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
        token: string,
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

        // Disparar las notificaciones asíncronamente
        schedulePetVaccineReminders(record, token).catch(() => {});

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

// -----------------------------------------------------------------------
// Helper: Schedule Notifications
// -----------------------------------------------------------------------
async function schedulePetVaccineReminders(
    record: VaccinationPublic,
    token: string,
) {
    if (!record.next_due_date) return;

    try {
        // 1. Obtener mascota para leer owner_id y nombre
        const petRes = await fetch(`${env.petServiceUrl}/api/v1/pets/${record.pet_id}`, {
            headers: { Authorization: token },
        });
        if (!petRes.ok) return;
        const petBody = await petRes.json() as any;
        const petData = petBody.data;
        
        let ownerId = petData?.owner_id;
        if (!ownerId && petData?.owner_ids && Array.isArray(petData.owner_ids)) {
            ownerId = petData.owner_ids[0];
        }
        if (!ownerId && petData?.owners && Array.isArray(petData.owners)) {
            ownerId = petData.owners[0]?.id;
        }
        if (!ownerId) return;

        // 2. Obtener user para leer nombre
        const userRes = await fetch(`${env.userServiceUrl}/api/v1/users/${ownerId}`, {
            headers: { Authorization: token },
        });
        if (!userRes.ok) return;
        const userBody = await userRes.json() as any;
        const userData = userBody.data;

        // Limpiar H:M para alinear fechas relativas al día actual limpio
        const todayStr = new Date().toISOString().split('T')[0];
        const nextDueDateLocal = new Date(`${record.next_due_date}T12:00:00`);
        
        const upcomingDate = new Date(nextDueDateLocal);
        upcomingDate.setDate(upcomingDate.getDate() - 30);

        // Si faltan - de 30 días, scheduleDate caería en pasado, por ende saldría inmediato.
        // Pero si la vacuna ya venció (o está en < 0 días relativas a hoy), NO debemos alertar "próxima".
        const now = new Date(`${todayStr}T12:00:00`);
        const daysToDue = Math.ceil((nextDueDateLocal.getTime() - now.getTime()) / (1000 * 3600 * 24));
        
        const dateFormattedStr = nextDueDateLocal.toLocaleDateString('es-CO');
        const petName = petData?.name || 'tu mascota';
        const ownerFirstName = userData?.first_name || 'Hola';

        const reqs: Promise<Response>[] = [];

        // Si faltan > 0 días, encolamos el "Próxima a vencer" (-30 días). 
        // Nota: Si faltan <= 30 días (pero > 0), target.scheduled_at <= now, se dispara ya mismo (lo cual es genial)
        if (daysToDue > 0) {
            const payload1 = {
                user_id: ownerId,
                email: userData?.email,
                type: 'VACCINE_REMINDER',
                channel: 'EMAIL',
                title: '💉 Vacuna próxima a vencer',
                message: `${ownerFirstName}, te recordamos que la vacuna ${record.vaccine_name} de ${petName} vence el ${dateFormattedStr}. ¡Agenda pronto!`,
                scheduled_at: upcomingDate.toISOString(),
                metadata: { pet_id: record.pet_id, vaccination_id: record.id }
            };
            reqs.push(fetch(`${env.notificationServiceUrl}/api/v1/notifications`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: token },
                body: JSON.stringify(payload1)
            }));
        }

        // Encolamos el de "Vencida" para la fecha exacta de next_due_date (o lo disparamos localmente si day <= 0)
        const payload2 = {
            user_id: ownerId,
            email: userData?.email,
            type: 'VACCINE_REMINDER',
            channel: 'EMAIL',
            title: '🚨 ¡Vacuna vencida o aplicable hoy!',
            message: `La vacuna ${record.vaccine_name} de ${petName} está programada para aplicarse a partir de hoy.`,
            scheduled_at: nextDueDateLocal.toISOString(),
            metadata: { pet_id: record.pet_id, vaccination_id: record.id }
        };
        reqs.push(fetch(`${env.notificationServiceUrl}/api/v1/notifications`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token },
            body: JSON.stringify(payload2)
        }));

        await Promise.all(reqs);

        console.log(`[VaccinationService] Programadas ${reqs.length} alertas de vacuna para mascota ${record.pet_id}`);

    } catch (e) {
        console.error('[VaccinationService] Error programando notificaciones de vacuna', e);
    }
}
