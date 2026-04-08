import { Request, Response } from 'express';
import { vaccinationService } from '../services/vaccination.service';
import { sendSuccess, sendError } from '../utils/response.util';
import { JwtPayload } from '../models/ehr.model';

export const vaccinationController = {
    /**
     * POST /ehr/vaccinations
     * Create a vaccination record.
     */
    async createVaccination(req: Request, res: Response): Promise<void> {
        const user = req.user as JwtPayload;

        try {
            const record = await vaccinationService.createVaccination(req.body, user);
            sendSuccess(res, record, 'Vacuna registrada exitosamente', 201);
        } catch (err: unknown) {
            const error = err as { message?: string; statusCode?: number };
            sendError(res, error.message ?? 'Error al registrar vacuna', error.statusCode ?? 500);
        }
    },


    /**
     * GET /ehr/:petId/vaccinations
     * List all vaccinations for a pet.
     */
    async getVaccinationsByPet(req: Request, res: Response): Promise<void> {
        const user = req.user as JwtPayload;
        const token = req.headers.authorization as string;
        const { petId } = req.params;

        try {
            const records = await vaccinationService.getVaccinationsByPet(petId, user, token);
            sendSuccess(res, records, 'Vacunas obtenidas exitosamente');
        } catch (err: unknown) {
            const error = err as { message?: string; statusCode?: number };
            sendError(res, error.message ?? 'Error al obtener vacunas', error.statusCode ?? 500);
        }
    },
};
