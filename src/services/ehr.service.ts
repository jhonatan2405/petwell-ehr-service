import { ehrRepository } from '../repositories/ehr.repository';
import { permissionRepository } from '../repositories/permission.repository';
import { auditService } from './audit.service';
import { CreateEhrDto, UpdateEhrDto, EhrRecordPublic, JwtPayload } from '../models/ehr.model';
import { env } from '../config/env';

// -----------------------------------------------------------------------
// EHR Service – business logic and access control layer.
//
// Permission matrix (v10.3):
//   DUENO_MASCOTA   → can VIEW records for their own pets (via Pet Service check)
//   CLINIC_ADMIN    → can CREATE / UPDATE / DELETE their own records
//   VETERINARIO     → can CREATE / UPDATE / DELETE their own records
//   Both clinic roles can VIEW records if:
//     (a) record.clinic_id === user.clinic_id   ← created by them
//     (b) ehr_permissions has a row for (pet_id, clinic_id) ← owner granted access
// -----------------------------------------------------------------------

/**
 * Calls Pet Service to verify that petId belongs to userId.
 * token MUST already contain the "Bearer " prefix.
 */
async function isPetOwner(petId: string, userId: string, token: string): Promise<boolean> {
    try {
        const response = await fetch(
            `${env.petServiceUrl}/api/v1/pets/${petId}`,
            {
                headers: {
                    Authorization: token,
                    'Content-Type': 'application/json',
                },
            },
        );

        if (!response.ok) return false;

        const result = (await response.json()) as {
            data?: { owner_ids?: string[] };
        };

        const ownerIds = result.data?.owner_ids ?? [];
        return ownerIds.includes(userId);
    } catch {
        return false;
    }
}

/** Creates a typed error with an HTTP status code attached. */
function makeError(message: string, statusCode: number): Error {
    const err = new Error(message);
    (err as { statusCode?: number }).statusCode = statusCode;
    return err;
}

// -----------------------------------------------------------------------

export const ehrService = {
    /**
     * Creates a new EHR record.
     * ONLY users with role CLINIC_ADMIN or VETERINARIO may create records.
     * clinic_id is ALWAYS extracted from the JWT — never from the request body.
     * Validates that the pet belongs to the user's clinic before creating.
     * Logs a CREATE audit event.
     */
    async createRecord(dto: CreateEhrDto, user: JwtPayload, token: string): Promise<EhrRecordPublic> {
        if (user.role !== 'CLINIC_ADMIN' && user.role !== 'VETERINARIO') {
            throw makeError('Solo clínicas y veterinarios pueden crear registros médicos', 403);
        }

        if (!user.clinic_id) {
            throw makeError('Tu cuenta no tiene una clínica asociada', 403);
        }

        // Guard: clinic_id comes from the JWT, but validate its format before
        // hitting the DB to prevent "invalid input syntax for type uuid" errors.
        const UUID_REGEX =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!UUID_REGEX.test(user.clinic_id)) {
            console.error(
                `[EHR] clinic_id inválido en JWT — valor recibido: "${user.clinic_id}"`,
            );
            throw makeError('clinic_id inválido: debe ser un UUID válido', 400);
        }

        // Validate that the pet belongs to the user's clinic
        const petRes = await fetch(
            `${env.petServiceUrl}/api/v1/pets/${dto.pet_id}`,
            {
                headers: {
                    Authorization: token,
                    'Content-Type': 'application/json',
                },
            },
        );

        if (petRes.status === 404) {
            throw makeError('Mascota no encontrada', 404);
        }

        if (petRes.status === 403) {
            throw makeError('No autorizado para esta clínica', 403);
        }

        if (!petRes.ok) {
            throw makeError('Error interno al verificar mascota', 500);
        }

        const petData = (await petRes.json()) as {
            data?: { primary_clinic_id?: string };
        };

        if (petData.data?.primary_clinic_id !== user.clinic_id) {
            throw makeError('No autorizado para esta clínica', 403);
        }

        const record = await ehrRepository.create({
            pet_id: dto.pet_id,
            clinic_id: user.clinic_id, // ← always from JWT, never from body
            veterinarian_id: dto.veterinarian_id,
            visit_date: dto.visit_date,
            visit_time: dto.visit_time,       // ← NEW: forward time to DB
            reason: dto.reason,
            anamnesis: dto.anamnesis,
            diagnosis: dto.diagnosis,
            treatment: dto.treatment,
            prescriptions: dto.prescriptions,
            lab_results: dto.lab_results,
            notes: dto.notes,
        });

        console.log('[DEBUG-EHR-SERVICE] dto.veterinarian_id:', dto.veterinarian_id);
        console.log('[DEBUG-EHR-SERVICE] Inserting into DB:', { ...dto, clinic_id: user.clinic_id });
        console.log('[DEBUG-EHR-SERVICE] DB Record Inserted:', record);

        // Audit log — CREATE
        await auditService.log({
            ehr_id: record.id,
            pet_id: record.pet_id,
            action: 'CREATE',
            actor_id: user.sub,
            role: user.role,
            clinic_id: user.clinic_id,
        });

        return record;
    },

    /**
     * Returns the clinical history of a pet.
     *
     * - OWNER: must own the pet (verified via Pet Service). Gets ALL records.
     * - CLINIC: gets records if (a) records are from their clinic_id OR
     *           (b) the owner has granted consent in ehr_permissions.
     *
     * Logs a VIEW audit event.
     */
    async getRecordsByPet(
        petId: string,
        user: JwtPayload,
        token: string,
    ): Promise<EhrRecordPublic[]> {
        let records: EhrRecordPublic[];

        if (user.role === 'DUENO_MASCOTA') {
            const isOwner = await isPetOwner(petId, user.sub, token);
            // 403 ONLY when user is not the owner — never for empty record sets.
            // A verified owner with no clinical records receives [] (200 OK).
            if (!isOwner) {
                throw makeError('No tienes permiso para ver el historial de esta mascota', 403);
            }
            // findByPetId returns [] when there are no records — this is intentional.
            records = await ehrRepository.findByPetId(petId);
        } else if (user.role === 'CLINIC_ADMIN' || user.role === 'VETERINARIO') {
            if (!user.clinic_id) {
                throw makeError('Tu cuenta no tiene una clínica asociada', 403);
            }

            // Check if owner has granted explicit consent (cross-clinic access)
            const hasConsent = await permissionRepository.hasPermission(petId, user.clinic_id);

            if (hasConsent) {
                // Owner granted access — clinic sees ALL records for this pet
                records = await ehrRepository.findByPetId(petId);
            } else {
                // No consent — clinic only sees their own records
                records = await ehrRepository.findByPetIdAndClinic(petId, user.clinic_id);
            }
        } else {
            throw makeError('No tienes permisos para acceder a registros médicos', 403);
        }

        // Audit log — VIEW (list)
        await auditService.log({
            ehr_id: null,
            pet_id: petId,
            action: 'VIEW',
            actor_id: user.sub,
            role: user.role,
            clinic_id: user.clinic_id ?? null,
        });

        return records;
    },

    /**
     * Returns a single EHR record by id.
     *
     * - OWNER: must own the pet referenced by the record.
     * - CLINIC: record.clinic_id must equal user.clinic_id OR owner has granted consent.
     *
     * Logs a VIEW audit event.
     */
    async getRecordById(
        id: string,
        user: JwtPayload,
        token: string,
    ): Promise<EhrRecordPublic> {
        const record = await ehrRepository.findById(id);

        if (!record) {
            throw makeError('Registro médico no encontrado', 404);
        }

        if (user.role === 'DUENO_MASCOTA') {
            const isOwner = await isPetOwner(record.pet_id, user.sub, token);
            if (!isOwner) {
                throw makeError('No tienes permiso para ver este registro', 403);
            }
        } else if (user.role === 'CLINIC_ADMIN' || user.role === 'VETERINARIO') {
            if (!user.clinic_id) {
                throw makeError('Tu cuenta no tiene una clínica asociada', 403);
            }

            const isOwnRecord = record.clinic_id === user.clinic_id;
            if (!isOwnRecord) {
                // Check if owner granted cross-clinic consent
                const hasConsent = await permissionRepository.hasPermission(
                    record.pet_id,
                    user.clinic_id,
                );
                if (!hasConsent) {
                    throw makeError('No tienes permiso para ver este registro', 403);
                }
            }
        } else {
            throw makeError('No tienes permisos para acceder a registros médicos', 403);
        }

        // Audit log — VIEW (single)
        await auditService.log({
            ehr_id: record.id,
            pet_id: record.pet_id,
            action: 'VIEW',
            actor_id: user.sub,
            role: user.role,
            clinic_id: user.clinic_id ?? null,
        });

        return record;
    },

    /**
     * Updates an EHR record.
     * ONLY CLINIC role; and only records belonging to their clinic.
     * Logs an UPDATE audit event.
     */
    async updateRecord(
        id: string,
        dto: UpdateEhrDto,
        user: JwtPayload,
    ): Promise<EhrRecordPublic> {
        if (user.role !== 'CLINIC_ADMIN' && user.role !== 'VETERINARIO') {
            throw makeError('Solo clínicas y veterinarios pueden modificar registros médicos', 403);
        }

        const record = await ehrRepository.findById(id);
        if (!record) {
            throw makeError('Registro médico no encontrado', 404);
        }

        if (!user.clinic_id || record.clinic_id !== user.clinic_id) {
            throw makeError('No tienes permiso para modificar este registro', 403);
        }

        const updated = await ehrRepository.update(id, dto);

        // Audit log — UPDATE
        await auditService.log({
            ehr_id: updated.id,
            pet_id: updated.pet_id,
            action: 'UPDATE',
            actor_id: user.sub,
            role: user.role,
            clinic_id: user.clinic_id,
        });

        return updated;
    },

    /**
     * Deletes an EHR record.
     * ONLY CLINIC role; and only records belonging to their clinic.
     * Logs a DELETE audit event.
     */
    async deleteRecord(id: string, user: JwtPayload): Promise<void> {
        if (user.role !== 'CLINIC_ADMIN' && user.role !== 'VETERINARIO') {
            throw makeError('Solo clínicas y veterinarios pueden eliminar registros médicos', 403);
        }

        const record = await ehrRepository.findById(id);
        if (!record) {
            throw makeError('Registro médico no encontrado', 404);
        }

        if (!user.clinic_id || record.clinic_id !== user.clinic_id) {
            throw makeError('No tienes permiso para eliminar este registro', 403);
        }

        await ehrRepository.deleteById(id);

        // Audit log — DELETE (capture pet_id before deletion)
        await auditService.log({
            ehr_id: id,
            pet_id: record.pet_id,
            action: 'DELETE',
            actor_id: user.sub,
            role: user.role,
            clinic_id: user.clinic_id,
        });
    },
};
