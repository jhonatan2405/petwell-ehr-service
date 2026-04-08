import { permissionRepository } from '../repositories/permission.repository';
import { auditRepository } from '../repositories/audit.repository';
import { CreatePermissionDto, RevokePermissionDto, EhrPermissionRow, JwtPayload } from '../models/ehr.model';
import { env } from '../config/env';

// -----------------------------------------------------------------------
// Permission Service – business logic for clinic access consent.
//
// Security rules:
//   grantPermission  → only DUENO_MASCOTA; validates pet ownership; validates clinic_id format
//   revokePermission → only DUENO_MASCOTA; DELETE protection (404 if not found)
//   listPermissions  → DUENO_MASCOTA (all) or CLINIC_ADMIN/VETERINARIO with explicit permission
// -----------------------------------------------------------------------

/** Typed error with HTTP status code. */
function makeError(message: string, statusCode: number): Error {
    const err = new Error(message);
    (err as { statusCode?: number }).statusCode = statusCode;
    return err;
}

/**
 * Validates that userId owns petId via the Pet Service.
 * Returns the owner_ids array (or throws if pet not found).
 * token MUST already contain the "Bearer " prefix.
 */
async function fetchPetOwnerIds(
    petId: string,
    token: string,
): Promise<string[]> {
    const response = await fetch(
        `${env.petServiceUrl}/api/v1/pets/${petId}`,
        {
            headers: {
                Authorization: token,
                'Content-Type': 'application/json',
            },
        },
    );

    if (response.status === 404) {
        throw makeError('La mascota no existe', 404);
    }

    if (!response.ok) {
        throw makeError('No se pudo verificar la mascota en el Pet Service', 502);
    }

    const result = (await response.json()) as { data?: { owner_ids?: string[] } };
    return result.data?.owner_ids ?? [];
}

// -----------------------------------------------------------------------

export const permissionService = {
    /**
     * OWNER grants a clinic access to their pet's records.
     *
     * Validates:
     *   1. Caller must be OWNER
     *   2. pet exists in Pet Service (404 if not)
     *   3. caller is an owner of that pet (403 if not)
     *   4. clinic_id is a valid UUID format (400 if not)
     */
    async grantPermission(
        dto: CreatePermissionDto,
        user: JwtPayload,
        token: string,
    ): Promise<EhrPermissionRow> {
        if (user.role !== 'DUENO_MASCOTA') {
            throw makeError('Solo los dueños pueden otorgar permisos de acceso', 403);
        }

        // Validate clinic_id format (UUID v4)
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(dto.clinic_id)) {
            throw makeError('clinic_id debe ser un UUID válido', 400);
        }

        // Verify pet exists and user owns it
        const ownerIds = await fetchPetOwnerIds(dto.pet_id, token);
        if (!ownerIds.includes(user.sub)) {
            throw makeError('No tienes permiso para gestionar accesos de esta mascota', 403);
        }

        const permission = await permissionRepository.grant({
            pet_id: dto.pet_id,
            clinic_id: dto.clinic_id,
            granted_by: user.sub,
        });

        // Audit log (fire-and-forget)
        void auditRepository
            .create({
                pet_id: dto.pet_id,
                action: 'CREATE',
                actor_id: user.sub,
                role: user.role,
                clinic_id: dto.clinic_id,
            })
            .catch((e: unknown) =>
                console.error('[permissionService.grantPermission] audit error:', e),
            );

        return permission;
    },

    /**
     * OWNER revokes a clinic's access to their pet's records.
     *
     * Validates:
     *   1. Caller must be OWNER
     *   2. pet exists and caller owns it
     *   3. Permission must exist (404 if not — prevents silent no-ops)
     */
    async revokePermission(
        dto: RevokePermissionDto,
        user: JwtPayload,
        token: string,
    ): Promise<void> {
        if (user.role !== 'DUENO_MASCOTA') {
            throw makeError('Solo los dueños pueden revocar permisos de acceso', 403);
        }

        // Verify pet exists and user owns it
        const ownerIds = await fetchPetOwnerIds(dto.pet_id, token);
        if (!ownerIds.includes(user.sub)) {
            throw makeError('No tienes permiso para gestionar accesos de esta mascota', 403);
        }

        // DELETE protection: check permission exists first
        const existing = await permissionRepository.findOne(dto.pet_id, dto.clinic_id);
        if (!existing) {
            throw makeError('El permiso no existe', 404);
        }

        await permissionRepository.revoke(dto.pet_id, dto.clinic_id);

        // Audit log (fire-and-forget)
        void auditRepository
            .create({
                pet_id: dto.pet_id,
                action: 'DELETE',
                actor_id: user.sub,
                role: user.role,
                clinic_id: dto.clinic_id,
            })
            .catch((e: unknown) =>
                console.error('[permissionService.revokePermission] audit error:', e),
            );
    },

    /**
     * Lists all clinics authorized to access a pet's records.
     *
     * - OWNER: must own the pet
     * - CLINIC: must have permission for the pet
     */
    async listPermissions(
        petId: string,
        user: JwtPayload,
        token: string,
    ): Promise<EhrPermissionRow[]> {
        if (user.role === 'DUENO_MASCOTA') {
            const ownerIds = await fetchPetOwnerIds(petId, token);
            if (!ownerIds.includes(user.sub)) {
                throw makeError('No tienes permiso para ver los accesos de esta mascota', 403);
            }
            return permissionRepository.findByPetId(petId);
        }

        if (user.role === 'CLINIC_ADMIN' || user.role === 'VETERINARIO') {
            if (!user.clinic_id) {
                throw makeError('Tu cuenta no tiene una clínica asociada', 403);
            }
            const hasAccess = await permissionRepository.hasPermission(petId, user.clinic_id);
            if (!hasAccess) {
                throw makeError('No tienes permiso para ver los accesos de esta mascota', 403);
            }
            return permissionRepository.findByPetId(petId);
        }

        throw makeError('No tienes permisos para acceder a esta información', 403);
    },
};

