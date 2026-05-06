import request from 'supertest';
import app from '../../src/server';
import { ehrRepository } from '../../src/repositories/ehr.repository';
import { permissionRepository } from '../../src/repositories/permission.repository';
import { auditService } from '../../src/services/audit.service';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

jest.mock('../../src/repositories/ehr.repository');
jest.mock('../../src/repositories/permission.repository');
jest.mock('../../src/services/audit.service');

const validUUID = '123e4567-e89b-12d3-a456-426614174000';
const validPetUUID = '223e4567-e89b-12d3-a456-426614174001';
const validVetUUID = '323e4567-e89b-12d3-a456-426614174002';

// Ensure fetch is mocked globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

const generateToken = (payload: any) => {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: '1h' });
};

describe('EHR Controller Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (auditService.log as jest.Mock).mockResolvedValue(undefined);
    });

    describe('POST /api/v1/ehr', () => {
        const payload = {
            pet_id: validPetUUID,
            veterinarian_id: validVetUUID,
            visit_date: '2023-10-10',
            visit_time: '10:00',
            reason: 'Checkup',
            anamnesis: 'Healthy',
            diagnosis: 'None',
            treatment: 'None',
        };

        it('should return 401 if token is missing', async () => {
            const res = await request(app).post('/api/v1/ehr').send(payload);
            expect(res.status).toBe(401);
            expect(res.body).toHaveProperty('success', false);
            expect(res.body.message).toBe('Cabecera de autorización faltante o incorrecta');
        });

        it('should return 403 if user is not a clinic or vet', async () => {
            const token = generateToken({ sub: 'user-1', role: 'DUENO_MASCOTA' });
            const res = await request(app)
                .post('/api/v1/ehr')
                .set('Authorization', `Bearer ${token}`)
                .send(payload);
            
            expect(res.status).toBe(403);
            expect(res.body.message).toBe('Solo clínicas y veterinarios pueden crear registros médicos');
        });

        it('should create a record successfully', async () => {
            const token = generateToken({ sub: 'user-1', role: 'VETERINARIO', clinic_id: validUUID });
            
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ data: { primary_clinic_id: validUUID } }),
            });

            (ehrRepository.create as jest.Mock).mockResolvedValue({ id: 'ehr-1', ...payload, clinic_id: validUUID });

            const res = await request(app)
                .post('/api/v1/ehr')
                .set('Authorization', `Bearer ${token}`)
                .send(payload);
            
            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('id', 'ehr-1');
        });

        it('should return 500 if pet service throws internal error', async () => {
            const token = generateToken({ sub: 'user-1', role: 'VETERINARIO', clinic_id: validUUID });
            
            mockFetch.mockResolvedValueOnce({
                ok: false,
                status: 500
            });

            const res = await request(app)
                .post('/api/v1/ehr')
                .set('Authorization', `Bearer ${token}`)
                .send(payload);
            
            expect(res.status).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Error interno al verificar mascota');
        });
    });

    describe('GET /api/v1/ehr/pet/:petId', () => {
        it('should return records for DUENO_MASCOTA', async () => {
            const token = generateToken({ sub: 'user-1', role: 'DUENO_MASCOTA' });
            
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { owner_ids: ['user-1'] } }),
            });

            (ehrRepository.findByPetId as jest.Mock).mockResolvedValue([{ id: 'ehr-1' }]);

            const res = await request(app)
                .get(`/api/v1/ehr/pet/${validPetUUID}`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([{ id: 'ehr-1' }]);
        });

        it('should return records for CLINIC_ADMIN with permission', async () => {
            const token = generateToken({ sub: 'user-1', role: 'CLINIC_ADMIN', clinic_id: validUUID });
            
            (permissionRepository.hasPermission as jest.Mock).mockResolvedValue(true);
            (ehrRepository.findByPetId as jest.Mock).mockResolvedValue([{ id: 'ehr-1' }]);

            const res = await request(app)
                .get(`/api/v1/ehr/pet/${validPetUUID}`)
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([{ id: 'ehr-1' }]);
        });
    });

    describe('GET /api/v1/ehr/:id', () => {
        it('should return 404 if record not found', async () => {
            const token = generateToken({ sub: 'user-1', role: 'DUENO_MASCOTA' });
            (ehrRepository.findById as jest.Mock).mockResolvedValue(null);

            const res = await request(app)
                .get('/api/v1/ehr/ehr-not-found')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(404);
            expect(res.body.message).toBe('Registro médico no encontrado');
        });

        it('should return record if found and owner', async () => {
            const token = generateToken({ sub: 'user-1', role: 'DUENO_MASCOTA' });
            (ehrRepository.findById as jest.Mock).mockResolvedValue({ id: 'ehr-1', pet_id: validPetUUID });
            
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { owner_ids: ['user-1'] } }),
            });

            const res = await request(app)
                .get('/api/v1/ehr/ehr-1')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body.data).toHaveProperty('id', 'ehr-1');
        });
    });

    describe('PUT /api/v1/ehr/:id', () => {
        it('should update record successfully', async () => {
            const token = generateToken({ sub: 'user-1', role: 'VETERINARIO', clinic_id: validUUID });
            (ehrRepository.findById as jest.Mock).mockResolvedValue({ id: 'ehr-1', clinic_id: validUUID });
            (ehrRepository.update as jest.Mock).mockResolvedValue({ id: 'ehr-1', reason: 'Updated' });

            const res = await request(app)
                .put('/api/v1/ehr/ehr-1')
                .set('Authorization', `Bearer ${token}`)
                .send({ reason: 'Updated' });
            
            expect(res.status).toBe(200);
            expect(res.body.data).toHaveProperty('reason', 'Updated');
        });
    });

    describe('DELETE /api/v1/ehr/:id', () => {
        it('should delete record successfully', async () => {
            const token = generateToken({ sub: 'user-1', role: 'VETERINARIO', clinic_id: validUUID });
            (ehrRepository.findById as jest.Mock).mockResolvedValue({ id: 'ehr-1', clinic_id: validUUID });
            (ehrRepository.deleteById as jest.Mock).mockResolvedValue(undefined);

            const res = await request(app)
                .delete('/api/v1/ehr/ehr-1')
                .set('Authorization', `Bearer ${token}`);
            
            expect(res.status).toBe(200);
            expect(res.body.message).toBe('Registro médico eliminado correctamente');
        });
    });
});
