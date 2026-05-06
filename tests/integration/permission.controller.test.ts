import request from 'supertest';
import app from '../../src/server';
import { permissionService } from '../../src/services/permission.service';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

jest.mock('../../src/services/permission.service');

const validPetUUID = '223e4567-e89b-12d3-a456-426614174001';
const validClinicUUID = '123e4567-e89b-12d3-a456-426614174000';

const generateToken = (payload: any) => {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: '1h' });
};

describe('Permission Controller Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('POST /api/v1/ehr/permissions', () => {
        it('should grant permission successfully', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' });
            const payload = { pet_id: validPetUUID, clinic_id: validClinicUUID };
            
            (permissionService.grantPermission as jest.Mock).mockResolvedValue({ id: 'perm-1', ...payload });

            const res = await request(app)
                .post('/api/v1/ehr/permissions')
                .set('Authorization', `Bearer ${token}`)
                .send(payload);

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toHaveProperty('id', 'perm-1');
        });

        it('should return error from service', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' });
            const payload = { pet_id: validPetUUID, clinic_id: validClinicUUID };
            
            const error: any = new Error('No tienes permiso');
            error.statusCode = 403;
            (permissionService.grantPermission as jest.Mock).mockRejectedValue(error);

            const res = await request(app)
                .post('/api/v1/ehr/permissions')
                .set('Authorization', `Bearer ${token}`)
                .send(payload);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
        });
    });



    describe('GET /api/v1/ehr/permissions/:petId', () => {
        it('should list permissions successfully', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' });
            
            (permissionService.listPermissions as jest.Mock).mockResolvedValue([{ clinic_id: validClinicUUID }]);

            const res = await request(app)
                .get(`/api/v1/ehr/permissions/${validPetUUID}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toEqual([{ clinic_id: validClinicUUID }]);
        });
    });
});
