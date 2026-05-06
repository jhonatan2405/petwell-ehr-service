import request from 'supertest';
import app from '../../src/server';
import { vaccinationService } from '../../src/services/vaccination.service';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

jest.mock('../../src/services/vaccination.service');

const validPetUUID = '223e4567-e89b-12d3-a456-426614174001';

const generateToken = (payload: any) => {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: '1h' });
};

describe('Vaccination Controller Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/v1/ehr/vaccinations', () => {
        const payload = {
            pet_id: validPetUUID,
            vaccine_name: 'Rabia',
            application_date: '2023-10-10'
        };

        it('should create vaccination successfully', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO' });
            
            (vaccinationService.createVaccination as jest.Mock).mockResolvedValue({ id: 'vac-1', ...payload });

            const res = await request(app)
                .post('/api/v1/ehr/vaccinations')
                .set('Authorization', `Bearer ${token}`)
                .send(payload);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('id', 'vac-1');
        });

        it('should return error if creation fails', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO' });
            
            const error: any = new Error('Mascota no encontrada');
            error.statusCode = 404;
            (vaccinationService.createVaccination as jest.Mock).mockRejectedValue(error);

            const res = await request(app)
                .post('/api/v1/ehr/vaccinations')
                .set('Authorization', `Bearer ${token}`)
                .send(payload);

            expect(res.status).toBe(404);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Mascota no encontrada');
        });
    });

    describe('GET /api/v1/ehr/:petId/vaccinations', () => {
        it('should list vaccinations successfully', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' });
            
            (vaccinationService.getVaccinationsByPet as jest.Mock).mockResolvedValue([{ id: 'vac-1' }]);

            const res = await request(app)
                .get(`/api/v1/ehr/${validPetUUID}/vaccinations`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual([{ id: 'vac-1' }]);
        });

        it('should return error if retrieval fails', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' });
            
            const error: any = new Error('No autorizado');
            error.statusCode = 403;
            (vaccinationService.getVaccinationsByPet as jest.Mock).mockRejectedValue(error);

            const res = await request(app)
                .get(`/api/v1/ehr/${validPetUUID}/vaccinations`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('No autorizado');
        });
    });
});
