import { Router } from 'express';
import { body, param } from 'express-validator';
import { permissionController } from '../controllers/permission.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';

const router = Router();

// ── POST /ehr/permissions — OWNER grants clinic access ────────────────────────
router.post(
    '/permissions',
    authenticate,
    [
        body('pet_id')
            .isUUID()
            .withMessage('pet_id debe ser un UUID válido'),
        body('clinic_id')
            .isUUID()
            .withMessage('clinic_id debe ser un UUID válido'),
    ],
    validate,
    permissionController.grantPermission,
);

// ── DELETE /ehr/permissions — OWNER revokes clinic access ─────────────────────
// Body-based delete (no ID in URL — the pair pet_id+clinic_id identifies the row)
router.delete(
    '/permissions',
    authenticate,
    [
        body('pet_id')
            .isUUID()
            .withMessage('pet_id debe ser un UUID válido'),
        body('clinic_id')
            .isUUID()
            .withMessage('clinic_id debe ser un UUID válido'),
    ],
    validate,
    permissionController.revokePermission,
);

// ── GET /ehr/permissions/:petId — List authorized clinics ─────────────────────
router.get(
    '/permissions/:petId',
    authenticate,
    [
        param('petId')
            .isUUID()
            .withMessage('petId debe ser un UUID válido'),
    ],
    validate,
    permissionController.listPermissions,
);

export default router;
