import { Router } from 'express';
import { param } from 'express-validator';
import { pdfController } from '../controllers/pdf.controller';
import { authenticate } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';

const router = Router();

// GET /ehr/:petId/export/pdf — Export full clinical history as PDF
router.get(
    '/:petId/export/pdf',
    authenticate,
    [
        param('petId')
            .isUUID()
            .withMessage('petId debe ser un UUID válido'),
    ],
    validate,
    pdfController.exportPdf,
);

export default router;
