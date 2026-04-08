import { Request, Response } from 'express';
import { pdfService } from '../services/pdf.service';
import { JwtPayload } from '../models/ehr.model';

export const pdfController = {
    /**
     * GET /ehr/:petId/export/pdf
     * Export the full clinical history of a pet as PDF.
     */
    async exportPdf(req: Request, res: Response): Promise<void> {
        const user = req.user as JwtPayload;
        const token = req.headers.authorization as string;
        const { petId } = req.params;

        try {
            const pdfBuffer = await pdfService.generatePetHistory(petId, user, token);

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader(
                'Content-Disposition',
                `attachment; filename="historial-${petId}.pdf"`,
            );
            res.setHeader('Content-Length', pdfBuffer.length);
            res.status(200).end(pdfBuffer);
        } catch (err: unknown) {
            const error = err as { message?: string; statusCode?: number };
            const statusCode = error.statusCode ?? 500;
            res.status(statusCode).json({
                success: false,
                message: error.message ?? 'Error al generar PDF',
            });
        }
    },
};
