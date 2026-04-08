import { Router } from 'express';
import { body } from 'express-validator';
import { ehrController } from '../controllers/ehr.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';

const router = Router();

// All routes require a valid JWT
// clinic_id is NEVER accepted from the body — it is extracted from the JWT in the service layer

// ── POST /ehr — Create a new EHR record (CLINIC only) ────────────────────────
router.post(
    '/',
    authenticate,
    [
        body('pet_id')
            .isUUID()
            .withMessage('pet_id debe ser un UUID válido'),
        body('visit_date')
            .notEmpty()
            .isISO8601()
            .withMessage('visit_date es requerido y debe estar en formato YYYY-MM-DD'),
        body('veterinarian_id')
            .optional()
            .isUUID()
            .withMessage('veterinarian_id debe ser un UUID válido'),
        body('reason').optional().isString(),
        body('anamnesis').optional().isString(),
        body('diagnosis').optional().isString(),
        body('treatment').optional().isString(),
        body('prescriptions').optional().isString(),
        body('lab_results').optional().isString(),
        body('notes').optional().isString(),
    ],
    validate,
    ehrController.createRecord,
);

// ── GET /ehr/pet/:petId — Get all records for a pet ──────────────────────────
// OWNER sees all records; CLINIC sees only their clinic's records
router.get('/pet/:petId', authenticate, ehrController.getRecordsByPet);

// ── GET /ehr/:id — Get a single EHR record ────────────────────────────────────
router.get('/:id', authenticate, ehrController.getRecordById);

// ── PUT /ehr/:id — Update an EHR record (CLINIC only) ────────────────────────
router.put(
    '/:id',
    authenticate,
    [
        body('visit_date')
            .optional()
            .isISO8601()
            .withMessage('visit_date debe estar en formato YYYY-MM-DD'),
        body('veterinarian_id')
            .optional()
            .isUUID()
            .withMessage('veterinarian_id debe ser un UUID válido'),
        body('reason').optional().isString(),
        body('anamnesis').optional().isString(),
        body('diagnosis').optional().isString(),
        body('treatment').optional().isString(),
        body('prescriptions').optional().isString(),
        body('lab_results').optional().isString(),
        body('notes').optional().isString(),
    ],
    validate,
    ehrController.updateRecord,
);

// ── DELETE /ehr/:id — Delete an EHR record (CLINIC only) ─────────────────────
router.delete('/:id', authenticate, ehrController.deleteRecord);

export default router;
