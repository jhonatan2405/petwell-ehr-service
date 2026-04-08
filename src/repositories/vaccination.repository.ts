import { supabase } from '../config/supabase';
import { VaccinationPublic } from '../models/vaccination.model';

// -----------------------------------------------------------------------
// Vaccination Repository – Supabase interactions for the vaccinations table.
// -----------------------------------------------------------------------

export const vaccinationRepository = {
    /**
     * Insert a new vaccination record.
     */
    async create(data: {
        pet_id: string;
        clinic_id: string;
        vaccine_name: string;
        application_date: string;
        application_time?: string;
        next_due_date?: string;
        batch_number?: string;
        veterinarian_id?: string;
        notes?: string;
    }): Promise<VaccinationPublic> {
        const { data: record, error } = await supabase
            .from('vaccinations')
            .insert({
                pet_id: data.pet_id,
                clinic_id: data.clinic_id,
                vaccine_name: data.vaccine_name,
                application_date: data.application_date,
                application_time: data.application_time ?? null,
                next_due_date: data.next_due_date ?? null,
                batch_number: data.batch_number ?? null,
                veterinarian_id: data.veterinarian_id ?? null,
                notes: data.notes ?? null,
            })
            .select('*')
            .single();

        if (error) throw new Error(error.message);
        return record as VaccinationPublic;
    },

    /**
     * Get all vaccinations for a pet, ordered most recent first.
     */
    async findByPetId(petId: string): Promise<VaccinationPublic[]> {
        const { data, error } = await supabase
            .from('vaccinations')
            .select('*')
            .eq('pet_id', petId)
            .order('application_date', { ascending: false });

        if (error) throw new Error(error.message);
        return (data ?? []) as VaccinationPublic[];
    },

    /**
     * Get vaccinations for a pet filtered by clinic.
     */
    async findByPetIdAndClinic(petId: string, clinicId: string): Promise<VaccinationPublic[]> {
        const { data, error } = await supabase
            .from('vaccinations')
            .select('*')
            .eq('pet_id', petId)
            .eq('clinic_id', clinicId)
            .order('application_date', { ascending: false });

        if (error) throw new Error(error.message);
        return (data ?? []) as VaccinationPublic[];
    },

    /**
     * Duplicate guard: checks if a vaccination for the same pet + vaccine
     * was applied within `withinDays` days of the target date.
     */
    async hasDuplicateRecent(
        petId: string,
        vaccineName: string,
        applicationDate: string,
        withinDays = 30,
    ): Promise<boolean> {
        const dateFrom = new Date(applicationDate);
        dateFrom.setDate(dateFrom.getDate() - withinDays);
        const dateTo = new Date(applicationDate);
        dateTo.setDate(dateTo.getDate() + withinDays);

        const { data, error } = await supabase
            .from('vaccinations')
            .select('id')
            .eq('pet_id', petId)
            .ilike('vaccine_name', vaccineName)
            .gte('application_date', dateFrom.toISOString().split('T')[0])
            .lte('application_date', dateTo.toISOString().split('T')[0])
            .limit(1);

        if (error) throw new Error(error.message);
        return (data ?? []).length > 0;
    },
};
