// =============================================
// PetWell EHR Service - Vaccination Models & Types
// =============================================

export interface VaccinationRow {
    id: string;
    pet_id: string;
    clinic_id: string;
    vaccine_name: string;
    application_date: string;   // DATE as ISO string (YYYY-MM-DD)
    application_time: string | null; // TIME e.g. "10:30:00"
    next_due_date: string | null;
    batch_number: string | null;
    veterinarian_id: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export type VaccinationPublic = VaccinationRow;

export interface CreateVaccinationDto {
    pet_id: string;
    vaccine_name: string;
    application_date: string;       // YYYY-MM-DD
    application_time?: string;      // HH:MM or HH:MM:SS
    next_due_date?: string;         // YYYY-MM-DD — optional, set by user
    batch_number?: string;
    veterinarian_id?: string;       // optional — defaults to JWT sub if VETERINARIO
    notes?: string;
}
