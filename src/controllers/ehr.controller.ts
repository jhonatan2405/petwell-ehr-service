import { Request, Response, NextFunction } from 'express';
import { ehrService } from '../services/ehr.service';
import { sendSuccess } from '../utils/response.util';
import { CreateEhrDto, UpdateEhrDto } from '../models/ehr.model';

export const ehrController = {
    /**
     * POST /ehr
     * Creates a new EHR record.
     * clinic_id is extracted from the JWT — never from req.body.
     */
    async createRecord(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const user = req.user!;
            const dto: CreateEhrDto = req.body;
            console.log('[DEBUG-CONTROLLER] req.body:', req.body);
            const token = req.headers.authorization as string;
            const record = await ehrService.createRecord(dto, user, token);
            sendSuccess(res, record, 'Registro médico creado correctamente', 201);
        } catch (err) {
            next(err);
        }
    },

    /**
     * GET /ehr/pet/:petId
     * Returns the full clinical history of a pet.
     * OWNER sees all records; CLINIC sees only their own.
     */
    async getRecordsByPet(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const user = req.user!;
            const { petId } = req.params;
            // Forward the Authorization header (already includes "Bearer ")
            const token = req.headers.authorization as string;
            const records = await ehrService.getRecordsByPet(petId, user, token);
            sendSuccess(res, records, 'Historial médico obtenido correctamente');
        } catch (err) {
            next(err);
        }
    },

    /**
     * GET /ehr/:id
     * Returns a single EHR record.
     */
    async getRecordById(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const user = req.user!;
            const { id } = req.params;
            const token = req.headers.authorization as string;
            const record = await ehrService.getRecordById(id, user, token);
            sendSuccess(res, record, 'Registro médico obtenido correctamente');
        } catch (err) {
            next(err);
        }
    },

    /**
     * PUT /ehr/:id
     * Updates an EHR record (CLINIC only).
     */
    async updateRecord(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const user = req.user!;
            const { id } = req.params;
            const dto: UpdateEhrDto = req.body;
            const record = await ehrService.updateRecord(id, dto, user);
            sendSuccess(res, record, 'Registro médico actualizado correctamente');
        } catch (err) {
            next(err);
        }
    },

    /**
     * DELETE /ehr/:id
     * Deletes an EHR record (CLINIC only).
     */
    async deleteRecord(
        req: Request,
        res: Response,
        next: NextFunction,
    ): Promise<void> {
        try {
            const user = req.user!;
            const { id } = req.params;
            await ehrService.deleteRecord(id, user);
            sendSuccess(res, null, 'Registro médico eliminado correctamente');
        } catch (err) {
            next(err);
        }
    },
};
