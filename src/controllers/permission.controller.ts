import { Request, Response, NextFunction } from 'express';
import { permissionService } from '../services/permission.service';
import { sendSuccess } from '../utils/response.util';
import { CreatePermissionDto, RevokePermissionDto } from '../models/ehr.model';

export const permissionController = {
    /**
     * POST /ehr/permissions
     * OWNER grants a clinic access to their pet's records.
     */
    async grantPermission(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const user = req.user!;
            const dto: CreatePermissionDto = req.body;
            const token = req.headers.authorization as string;
            const permission = await permissionService.grantPermission(dto, user, token);
            sendSuccess(res, permission, 'Permiso otorgado correctamente', 201);
        } catch (err) {
            next(err);
        }
    },

    /**
     * DELETE /ehr/permissions
     * OWNER revokes a clinic's access to their pet's records.
     */
    async revokePermission(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const user = req.user!;
            const dto: RevokePermissionDto = req.body;
            const token = req.headers.authorization as string;
            await permissionService.revokePermission(dto, user, token);
            sendSuccess(res, null, 'Permiso revocado correctamente');
        } catch (err) {
            next(err);
        }
    },

    /**
     * GET /ehr/permissions/:petId
     * Lists all clinics authorized to access a pet's records.
     */
    async listPermissions(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const user = req.user!;
            const { petId } = req.params;
            const token = req.headers.authorization as string;
            const permissions = await permissionService.listPermissions(petId, user, token);
            sendSuccess(res, permissions, 'Permisos obtenidos correctamente');
        } catch (err) {
            next(err);
        }
    },
};
