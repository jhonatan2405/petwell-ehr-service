import request from 'supertest';
import app from '../../src/server';
import { auditService } from '../../src/services/audit.service';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

jest.mock('../../src/services/audit.service');

const validPetUUID = '223e4567-e89b-12d3-a456-426614174001';

const generateToken = (payload: any) => {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: '1h' });
};

describe('Audit Controller Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v1/ehr/audit/:petId', () => {
        it('should list audit logs successfully', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' });
            
            (auditService.getAuditByPet as jest.Mock).mockResolvedValue([{ id: 'log-1', action: 'VIEW' }]);

            const res = await request(app)
                .get(`/api/v1/ehr/audit/${validPetUUID}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toEqual([{ id: 'log-1', action: 'VIEW' }]);
        });

        it('should return error from service', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' });
            
            const error: any = new Error('No autorizado');
            error.statusCode = 403;
            (auditService.getAuditByPet as jest.Mock).mockRejectedValue(error);

            const res = await request(app)
                .get(`/api/v1/ehr/audit/${validPetUUID}`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(403);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('No autorizado');
        });
    });
});
