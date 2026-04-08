import { Request, Response, NextFunction } from 'express';
import { auditService } from '../services/audit.service';
import { sendSuccess } from '../utils/response.util';

export const auditController = {
    /**
     * GET /ehr/audit/:petId
     * Returns the audit trail of actions performed on a pet's records.
     * OWNER: must own the pet.
     * CLINIC: must have consent in ehr_permissions.
     */
    async getAuditLog(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const user = req.user!;
            const { petId } = req.params;
            const token = req.headers.authorization as string;
            const logs = await auditService.getAuditByPet(petId, user, token);
            sendSuccess(res, logs, 'Auditoría obtenida correctamente');
        } catch (err) {
            next(err);
        }
    },
};
