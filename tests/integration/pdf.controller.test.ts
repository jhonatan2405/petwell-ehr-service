import request from 'supertest';
import app from '../../src/server';
import { pdfService } from '../../src/services/pdf.service';
import jwt from 'jsonwebtoken';
import { env } from '../../src/config/env';

jest.mock('../../src/services/pdf.service');

const validPetUUID = '223e4567-e89b-12d3-a456-426614174001';

const generateToken = (payload: any) => {
    return jwt.sign(payload, env.jwtSecret, { expiresIn: '1h' });
};

describe('PDF Controller Integration Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/v1/ehr/:petId/export/pdf', () => {
        it('should generate and return PDF successfully', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' });
            const mockBuffer = Buffer.from('mock pdf content');
            
            (pdfService.generatePetHistory as jest.Mock).mockResolvedValue(mockBuffer);

            const res = await request(app)
                .get(`/api/v1/ehr/${validPetUUID}/export/pdf`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toBe('application/pdf');
            expect(res.headers['content-disposition']).toBe(`attachment; filename="historial-${validPetUUID}.pdf"`);
            expect(res.headers['content-length']).toBe(mockBuffer.length.toString());
            expect(res.body).toEqual(mockBuffer);
        });

        it('should return error if generation fails', async () => {
            const token = generateToken({ email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' });
            
            const error: any = new Error('Error al generar PDF');
            error.statusCode = 500;
            (pdfService.generatePetHistory as jest.Mock).mockRejectedValue(error);

            const res = await request(app)
                .get(`/api/v1/ehr/${validPetUUID}/export/pdf`)
                .set('Authorization', `Bearer ${token}`);

            expect(res.status).toBe(500);
            expect(res.body.success).toBe(false);
            expect(res.body.message).toBe('Error al generar PDF');
        });
    });
});
