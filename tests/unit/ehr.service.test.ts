import { ehrService } from '../../src/services/ehr.service';
import { ehrRepository } from '../../src/repositories/ehr.repository';
import { permissionRepository } from '../../src/repositories/permission.repository';
import { CreateEhrDto, JwtPayload } from '../../src/models/ehr.model';

jest.mock('../../src/repositories/ehr.repository');
jest.mock('../../src/repositories/permission.repository');

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

describe('EHR Service Unit Tests', () => {
    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('createRecord', () => {
        const dto: CreateEhrDto = {
            pet_id: 'pet-123',
            veterinarian_id: 'vet-123',
            visit_date: '2023-10-10',
            visit_time: '10:00',
            reason: 'Checkup',
            anamnesis: 'Healthy',
            diagnosis: 'None',
            treatment: 'None',
        };
        const token = 'Bearer some-token';

        it('should throw an error if role is not CLINIC_ADMIN or VETERINARIO', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' };
            await expect(ehrService.createRecord(dto, user, token)).rejects.toThrow('Solo clínicas y veterinarios pueden crear registros médicos');
        });

        it('should throw an error if clinic_id is missing', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO' };
            await expect(ehrService.createRecord(dto, user, token)).rejects.toThrow('Tu cuenta no tiene una clínica asociada');
        });

        it('should throw an error if clinic_id is not a valid UUID', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: 'invalid-uuid' };
            await expect(ehrService.createRecord(dto, user, token)).rejects.toThrow('clinic_id inválido: debe ser un UUID válido');
        });

        it('should throw an error if pet service returns 404', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: '123e4567-e89b-12d3-a456-426614174000' };
            mockFetch.mockResolvedValueOnce({ status: 404 });
            await expect(ehrService.createRecord(dto, user, token)).rejects.toThrow('Mascota no encontrada');
        });

        it('should throw an error if pet service returns 403', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: '123e4567-e89b-12d3-a456-426614174000' };
            mockFetch.mockResolvedValueOnce({ status: 403 });
            await expect(ehrService.createRecord(dto, user, token)).rejects.toThrow('No autorizado para esta clínica');
        });

        it('should throw an error if pet service fetch fails (!ok)', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: '123e4567-e89b-12d3-a456-426614174000' };
            mockFetch.mockResolvedValueOnce({ status: 500, ok: false });
            await expect(ehrService.createRecord(dto, user, token)).rejects.toThrow('Error interno al verificar mascota');
        });

        it('should throw an error if pet primary clinic does not match', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: '123e4567-e89b-12d3-a456-426614174000' };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ data: { primary_clinic_id: 'different-clinic-id' } }),
            });
            await expect(ehrService.createRecord(dto, user, token)).rejects.toThrow('No autorizado para esta clínica');
        });

        it('should successfully create a record', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: '123e4567-e89b-12d3-a456-426614174000' };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({ data: { primary_clinic_id: user.clinic_id } }),
            });
            const mockRecord = { id: 'ehr-123', pet_id: 'pet-123' };
            (ehrRepository.create as jest.Mock).mockResolvedValue(mockRecord);
            const result = await ehrService.createRecord(dto, user, token);
            expect(result).toBeDefined();
            expect(result).toEqual(mockRecord);
        });
    });

    describe('getRecordsByPet', () => {
        const token = 'Bearer some-token';

        it('should return records for DUENO_MASCOTA if they own the pet', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { owner_ids: ['user-1'] } }),
            });
            (ehrRepository.findByPetId as jest.Mock).mockResolvedValue([{ id: 'ehr-1' }]);
            const result = await ehrService.getRecordsByPet('pet-123', user, token);
            expect(result).toHaveLength(1);
        });

        it('should return false for isPetOwner on fetch error (catch block)', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' };
            mockFetch.mockRejectedValueOnce(new Error('Network error'));
            await expect(ehrService.getRecordsByPet('pet-123', user, token)).rejects.toThrow('No tienes permiso para ver el historial de esta mascota');
        });

        it('should throw error for DUENO_MASCOTA if they do not own the pet', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' };
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { owner_ids: ['other-user'] } }),
            });
            await expect(ehrService.getRecordsByPet('pet-123', user, token)).rejects.toThrow('No tienes permiso para ver el historial de esta mascota');
        });

        it('should return records for CLINIC_ADMIN without consent', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'CLINIC_ADMIN', clinic_id: 'clinic-123' };
            (permissionRepository.hasPermission as jest.Mock).mockResolvedValue(false);
            (ehrRepository.findByPetIdAndClinic as jest.Mock).mockResolvedValue([{ id: 'ehr-1' }]);
            const result = await ehrService.getRecordsByPet('pet-123', user, token);
            expect(result).toHaveLength(1);
        });

        it('should throw error for CLINIC_ADMIN without clinic_id', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'CLINIC_ADMIN' };
            await expect(ehrService.getRecordsByPet('pet-123', user, token)).rejects.toThrow('Tu cuenta no tiene una clínica asociada');
        });
        
        it('should throw error for invalid role', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'INVALID_ROLE' as any };
            await expect(ehrService.getRecordsByPet('pet-123', user, token)).rejects.toThrow('No tienes permisos para acceder a registros médicos');
        });
    });

    describe('getRecordById', () => {
        const token = 'Bearer some-token';

        it('should throw 404 if record not found', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' };
            (ehrRepository.findById as jest.Mock).mockResolvedValue(null);
            await expect(ehrService.getRecordById('ehr-123', user, token)).rejects.toThrow('Registro médico no encontrado');
        });

        it('should throw 403 for DUENO_MASCOTA if they do not own pet', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' };
            (ehrRepository.findById as jest.Mock).mockResolvedValue({ id: 'ehr-123', pet_id: 'pet-123' });
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ data: { owner_ids: ['other-user'] } }),
            });
            await expect(ehrService.getRecordById('ehr-123', user, token)).rejects.toThrow('No tienes permiso para ver este registro');
        });

        it('should throw 403 for CLINIC_ADMIN without clinic_id', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'CLINIC_ADMIN' };
            (ehrRepository.findById as jest.Mock).mockResolvedValue({ id: 'ehr-123', pet_id: 'pet-123' });
            await expect(ehrService.getRecordById('ehr-123', user, token)).rejects.toThrow('Tu cuenta no tiene una clínica asociada');
        });

        it('should throw 403 for CLINIC_ADMIN without consent', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'CLINIC_ADMIN', clinic_id: 'clinic-1' };
            (ehrRepository.findById as jest.Mock).mockResolvedValue({ id: 'ehr-123', pet_id: 'pet-123', clinic_id: 'clinic-2' });
            (permissionRepository.hasPermission as jest.Mock).mockResolvedValue(false);
            await expect(ehrService.getRecordById('ehr-123', user, token)).rejects.toThrow('No tienes permiso para ver este registro');
        });
    });

    describe('updateRecord', () => {
        it('should throw error if user is DUENO_MASCOTA', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' };
            await expect(ehrService.updateRecord('ehr-123', {}, user)).rejects.toThrow('Solo clínicas y veterinarios pueden modificar registros médicos');
        });

        it('should throw error if record not found', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: 'clinic-123' };
            (ehrRepository.findById as jest.Mock).mockResolvedValue(null);
            await expect(ehrService.updateRecord('ehr-123', {}, user)).rejects.toThrow('Registro médico no encontrado');
        });

        it('should throw error if clinic_id mismatches', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: 'clinic-123' };
            (ehrRepository.findById as jest.Mock).mockResolvedValue({ id: 'ehr-123', clinic_id: 'different' });
            await expect(ehrService.updateRecord('ehr-123', {}, user)).rejects.toThrow('No tienes permiso para modificar este registro');
        });

        it('should update record successfully', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: 'clinic-123' };
            const mockRecord = { id: 'ehr-123', clinic_id: 'clinic-123', pet_id: 'pet-1' };
            
            (ehrRepository.findById as jest.Mock).mockResolvedValue(mockRecord);
            (ehrRepository.update as jest.Mock).mockResolvedValue({ ...mockRecord, reason: 'Updated' });

            const result = await ehrService.updateRecord('ehr-123', { reason: 'Updated' }, user);
            
            expect(result).toHaveProperty('reason', 'Updated');
        });
    });

    describe('deleteRecord', () => {
        it('should throw error if user is DUENO_MASCOTA', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'DUENO_MASCOTA' };
            await expect(ehrService.deleteRecord('ehr-123', user)).rejects.toThrow('Solo clínicas y veterinarios pueden eliminar registros médicos');
        });

        it('should throw error if record not found', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: 'clinic-123' };
            (ehrRepository.findById as jest.Mock).mockResolvedValue(null);
            await expect(ehrService.deleteRecord('ehr-123', user)).rejects.toThrow('Registro médico no encontrado');
        });

        it('should throw error if clinic_id mismatches', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: 'clinic-123' };
            (ehrRepository.findById as jest.Mock).mockResolvedValue({ id: 'ehr-123', clinic_id: 'different' });
            await expect(ehrService.deleteRecord('ehr-123', user)).rejects.toThrow('No tienes permiso para eliminar este registro');
        });

        it('should delete record successfully', async () => {
            const user: JwtPayload = { email: 'test@example.com', sub: 'user-1', role: 'VETERINARIO', clinic_id: 'clinic-123' };
            const mockRecord = { id: 'ehr-123', clinic_id: 'clinic-123', pet_id: 'pet-1' };
            (ehrRepository.findById as jest.Mock).mockResolvedValue(mockRecord);
            (ehrRepository.deleteById as jest.Mock).mockResolvedValue(undefined);

            await expect(ehrService.deleteRecord('ehr-123', user)).resolves.toBeUndefined();
            expect(ehrRepository.deleteById).toHaveBeenCalledWith('ehr-123');
        });
    });
});
