import { supabase } from '../config/supabase';
import { EhrRecordRow, EhrRecordPublic, UpdateEhrDto } from '../models/ehr.model';

// -----------------------------------------------------------------------
// EHR Repository – all Supabase interactions for the ehr_records table.
// -----------------------------------------------------------------------

export const ehrRepository = {
    /**
     * Insert a new EHR record.
     * clinic_id is always passed from the service layer (extracted from JWT).
     */
    async create(data: {
        pet_id: string;
        clinic_id: string;
        veterinarian_id?: string;
        visit_date: string;
        visit_time?: string;
        reason?: string;
        anamnesis?: string;
        diagnosis?: string;
        treatment?: string;
        prescriptions?: string;
        lab_results?: string;
        notes?: string;
    }): Promise<EhrRecordPublic> {
        const { data: record, error } = await supabase
            .from('ehr_records')
            .insert({
                pet_id: data.pet_id,
                clinic_id: data.clinic_id,
                veterinarian_id: data.veterinarian_id ?? null,
                visit_date: data.visit_date,
                visit_time: data.visit_time ?? null,
                reason: data.reason ?? null,
                anamnesis: data.anamnesis ?? null,
                diagnosis: data.diagnosis ?? null,
                treatment: data.treatment ?? null,
                prescriptions: data.prescriptions ?? null,
                lab_results: data.lab_results ?? null,
                notes: data.notes ?? null,
            })
            .select('*')
            .single();

        if (error) throw new Error(error.message);
        return record as EhrRecordPublic;
    },

    /**
     * Retrieve all EHR records for a given pet, ordered by visit_date DESC.
     */
    async findByPetId(petId: string): Promise<EhrRecordPublic[]> {
        const { data, error } = await supabase
            .from('ehr_records')
            .select('*')
            .eq('pet_id', petId)
            .order('visit_date', { ascending: false })
            .order('visit_time', { ascending: false, nullsFirst: false });

        if (error) throw new Error(error.message);
        return (data ?? []) as EhrRecordPublic[];
    },

    /**
     * Retrieve all EHR records for a given pet filtered by clinic_id.
     * Used when a CLINIC user requests the history.
     */
    async findByPetIdAndClinic(petId: string, clinicId: string): Promise<EhrRecordPublic[]> {
        const { data, error } = await supabase
            .from('ehr_records')
            .select('*')
            .eq('pet_id', petId)
            .eq('clinic_id', clinicId)
            .order('visit_date', { ascending: false })
            .order('visit_time', { ascending: false, nullsFirst: false });

        if (error) throw new Error(error.message);
        return (data ?? []) as EhrRecordPublic[];
    },

    /**
     * Find a single EHR record by its primary key.
     */
    async findById(id: string): Promise<EhrRecordPublic | null> {
        const { data, error } = await supabase
            .from('ehr_records')
            .select('*')
            .eq('id', id)
            .maybeSingle();

        if (error) throw new Error(error.message);
        return (data as EhrRecordRow) ?? null;
    },

    /**
     * Update an EHR record by id.
     * Only the fields present in dto are modified.
     */
    async update(id: string, dto: UpdateEhrDto): Promise<EhrRecordPublic> {
        const { data, error } = await supabase
            .from('ehr_records')
            .update({
                ...(dto.visit_date !== undefined && { visit_date: dto.visit_date }),
                ...(dto.visit_time !== undefined && { visit_time: dto.visit_time }),
                ...(dto.veterinarian_id !== undefined && { veterinarian_id: dto.veterinarian_id }),
                ...(dto.reason !== undefined && { reason: dto.reason }),
                ...(dto.anamnesis !== undefined && { anamnesis: dto.anamnesis }),
                ...(dto.diagnosis !== undefined && { diagnosis: dto.diagnosis }),
                ...(dto.treatment !== undefined && { treatment: dto.treatment }),
                ...(dto.prescriptions !== undefined && { prescriptions: dto.prescriptions }),
                ...(dto.lab_results !== undefined && { lab_results: dto.lab_results }),
                ...(dto.notes !== undefined && { notes: dto.notes }),
            })
            .eq('id', id)
            .select('*')
            .single();

        if (error) throw new Error(error.message);
        return data as EhrRecordPublic;
    },

    /**
     * Delete an EHR record by id.
     */
    async deleteById(id: string): Promise<void> {
        const { error } = await supabase
            .from('ehr_records')
            .delete()
            .eq('id', id);

        if (error) throw new Error(error.message);
    },
};
