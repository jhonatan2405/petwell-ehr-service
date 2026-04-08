import { Router } from 'express';
import { body, param } from 'express-validator';
import { vaccinationController } from '../controllers/vaccination.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';

const router = Router();

// POST /ehr/vaccinations — Register a new vaccination
router.post(
    '/vaccinations',
    authenticate,
    [
        body('pet_id')
            .isUUID()
            .withMessage('pet_id debe ser un UUID válido'),
        body('vaccine_name')
            .trim()
            .notEmpty()
            .withMessage('El nombre de la vacuna es requerido'),
        body('application_date')
            .isISO8601()
            .withMessage('application_date debe estar en formato YYYY-MM-DD'),
        body('next_due_date')
            .optional()
            .isISO8601()
            .withMessage('next_due_date debe estar en formato YYYY-MM-DD'),
        body('batch_number')
            .optional()
            .trim(),
        body('veterinarian_id')
            .optional()
            .isUUID()
            .withMessage('veterinarian_id debe ser un UUID válido'),
        body('notes')
            .optional()
            .trim(),
    ],
    validate,
    vaccinationController.createVaccination,
);

// GET /ehr/:petId/vaccinations — List vaccinations for a pet
router.get(
    '/:petId/vaccinations',
    authenticate,
    [
        param('petId')
            .isUUID()
            .withMessage('petId debe ser un UUID válido'),
    ],
    validate,
    vaccinationController.getVaccinationsByPet,
);

export default router;
