import { vaccinationRepository } from '../repositories/vaccination.repository';
import { permissionRepository } from '../repositories/permission.repository';
import { CreateVaccinationDto, VaccinationPublic } from '../models/vaccination.model';
import { JwtPayload } from '../models/ehr.model';
import { env } from '../config/env';

// -----------------------------------------------------------------------
// Vaccination Service – business logic and access control.
//
// Permission matrix:
//   CREATE → CLINIC_ADMIN or VETERINARIO (same clinic_id from JWT)
//   READ   → DUENO_MASCOTA (own pet via Pet Service check)
//            CLINIC_ADMIN / VETERINARIO (own clinic OR consent in ehr_permissions)
// -----------------------------------------------------------------------

function makeError(message: string, statusCode: number): Error {
    const err = new Error(message);
    (err as { statusCode?: number }).statusCode = statusCode;
    return err;
}

async function isPetOwner(petId: string, userId: string, token: string): Promise<boolean> {
    try {
        const res = await fetch(`${env.petServiceUrl}/api/v1/pets/${petId}`, {
            headers: { Authorization: token },
        });
        if (!res.ok) return false;
        const body = (await res.json()) as { data?: { owner_ids?: string[] } };
        return (body.data?.owner_ids ?? []).includes(userId);
    } catch {
        return false;
    }
}

export const vaccinationService = {
    /**
     * Register a new vaccination.
     * Only CLINIC_ADMIN or VETERINARIO can create.
     * clinic_id always comes from the JWT.
     * If role is VETERINARIO and veterinarian_id is not provided, defaults to user.sub.
     */
    async createVaccination(
        dto: CreateVaccinationDto,
        user: JwtPayload,
    ): Promise<VaccinationPublic> {
        if (user.role !== 'CLINIC_ADMIN' && user.role !== 'VETERINARIO') {
            throw makeError('Solo clínicas y veterinarios pueden registrar vacunas', 403);
        }

        if (!user.clinic_id) {
            throw makeError('Tu cuenta no tiene una clínica asociada', 403);
        }

        // Duplicate guard: same vaccine for same pet within ±30 days
        const isDuplicate = await vaccinationRepository.hasDuplicateRecent(
            dto.pet_id,
            dto.vaccine_name,
            dto.application_date,
        );

        if (isDuplicate) {
            throw makeError(
                `Ya existe un registro de "${dto.vaccine_name}" para esta mascota en los últimos 30 días`,
                409,
            );
        }

        // If a vet creates without providing veterinarian_id, default to themselves
        const vetId =
            dto.veterinarian_id ??
            (user.role === 'VETERINARIO' ? user.sub : undefined);

        const record = await vaccinationRepository.create({
            pet_id: dto.pet_id,
            clinic_id: user.clinic_id,
            vaccine_name: dto.vaccine_name,
            application_date: dto.application_date,
            next_due_date: dto.next_due_date,
            batch_number: dto.batch_number,
            veterinarian_id: vetId,
            notes: dto.notes,
        });

        // Emit vaccination.created event (structured log — same pattern as Appointment Service)
        console.log(
            JSON.stringify({
                event: 'vaccination.created',
                payload: {
                    vaccination_id: record.id,
                    pet_id: record.pet_id,
                    vaccine_name: record.vaccine_name,
                    next_due_date: record.next_due_date,
                    clinic_id: record.clinic_id,
                },
            }),
        );

        return record;
    },

    /**
     * Returns all vaccinations for a pet.
     * Access rules mirror EHR records access control.
     */
    async getVaccinationsByPet(
        petId: string,
        user: JwtPayload,
        token: string,
    ): Promise<VaccinationPublic[]> {
        if (user.role === 'DUENO_MASCOTA') {
            const isOwner = await isPetOwner(petId, user.sub, token);
            if (!isOwner) {
                throw makeError('No tienes permiso para ver las vacunas de esta mascota', 403);
            }
            return vaccinationRepository.findByPetId(petId);
        }

        if (user.role === 'CLINIC_ADMIN' || user.role === 'VETERINARIO') {
            if (!user.clinic_id) {
                throw makeError('Tu cuenta no tiene una clínica asociada', 403);
            }
            const hasConsent = await permissionRepository.hasPermission(petId, user.clinic_id);
            if (hasConsent) {
                return vaccinationRepository.findByPetId(petId);
            }
            return vaccinationRepository.findByPetIdAndClinic(petId, user.clinic_id);
        }

        throw makeError('No tienes permisos para ver vacunas', 403);
    },
};
