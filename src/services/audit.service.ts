import { auditRepository } from '../repositories/audit.repository';
import { permissionRepository } from '../repositories/permission.repository';
import { CreateAuditLogDto, EhrAuditLogRow, JwtPayload } from '../models/ehr.model';
import { env } from '../config/env';

// -----------------------------------------------------------------------
// Audit Service
//
// log()           – fire-and-forget, never blocks business operations.
// getAuditByPet() – access-controlled audit log retrieval.
// -----------------------------------------------------------------------

/** Typed error with HTTP status code. */
function makeError(message: string, statusCode: number): Error {
    const err = new Error(message);
    (err as { statusCode?: number }).statusCode = statusCode;
    return err;
}

/** Fetches owner_ids from Pet Service. Throws 404 if pet not found. */
async function fetchPetOwnerIds(petId: string, token: string): Promise<string[]> {
    const response = await fetch(`${env.petServiceUrl}/api/v1/pets/${petId}`, {
        headers: { Authorization: token, 'Content-Type': 'application/json' },
    });
    if (response.status === 404) throw makeError('La mascota no existe', 404);
    if (!response.ok) throw makeError('No se pudo verificar la mascota en el Pet Service', 502);
    const result = (await response.json()) as { data?: { owner_ids?: string[] } };
    return result.data?.owner_ids ?? [];
}

export const auditService = {
    /**
     * Persist an audit log entry.
     * Never throws — audit failures must not interrupt the main flow.
     */
    async log(dto: CreateAuditLogDto): Promise<void> {
        try {
            await auditRepository.create(dto);
        } catch (err) {
            console.error('[AuditService] Failed to persist audit log:', err);
        }
    },

    /**
     * Returns the audit trail for a pet.
     *
     * - DUENO_MASCOTA: must own the pet (verified via Pet Service)
     * - CLINIC_ADMIN / VETERINARIO: must have explicit consent in ehr_permissions
     */
    async getAuditByPet(
        petId: string,
        user: JwtPayload,
        token: string,
    ): Promise<EhrAuditLogRow[]> {
        if (user.role === 'DUENO_MASCOTA') {
            const ownerIds = await fetchPetOwnerIds(petId, token);
            if (!ownerIds.includes(user.sub)) {
                throw makeError('No tienes permiso para ver la auditoría de esta mascota', 403);
            }
        } else if (user.role === 'CLINIC_ADMIN' || user.role === 'VETERINARIO') {
            if (!user.clinic_id) {
                throw makeError('Tu cuenta no tiene una clínica asociada', 403);
            }
            const hasAccess = await permissionRepository.hasPermission(petId, user.clinic_id);
            if (!hasAccess) {
                throw makeError('No tienes permiso para ver la auditoría de esta mascota', 403);
            }
        } else {
            throw makeError('No tienes permisos para acceder a esta información', 403);
        }

        return auditRepository.findByPetId(petId);
    },
};
