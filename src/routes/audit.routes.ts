import { Router } from 'express';
import { param } from 'express-validator';
import { auditController } from '../controllers/audit.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';

const router = Router();

// ── GET /ehr/audit/:petId — Audit trail for a pet ────────────────────────────
router.get(
    '/audit/:petId',
    authenticate,
    [
        param('petId')
            .isUUID()
            .withMessage('petId debe ser un UUID válido'),
    ],
    validate,
    auditController.getAuditLog,
);

export default router;
