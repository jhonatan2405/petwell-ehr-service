import { supabase } from '../config/supabase';
import { EhrPermissionRow } from '../models/ehr.model';

// -----------------------------------------------------------------------
// Permission Repository – Supabase interactions for ehr_permissions table.
// -----------------------------------------------------------------------

export const permissionRepository = {
    /**
     * Insert a permission row granting a clinic access to a pet's records.
     * Throws if the unique constraint (pet_id, clinic_id) is violated.
     */
    async grant(data: {
        pet_id: string;
        clinic_id: string;
        granted_by: string;
    }): Promise<EhrPermissionRow> {
        const { data: row, error } = await supabase
            .from('ehr_permissions')
            .insert({
                pet_id: data.pet_id,
                clinic_id: data.clinic_id,
                granted_by: data.granted_by,
            })
            .select('*')
            .single();

        if (error) throw new Error(error.message);
        return row as EhrPermissionRow;
    },

    /**
     * Remove a permission.
     * Returns true if a row was deleted, false if nothing matched.
     */
    async revoke(petId: string, clinicId: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('ehr_permissions')
            .delete()
            .eq('pet_id', petId)
            .eq('clinic_id', clinicId)
            .select('id');

        if (error) throw new Error(error.message);
        return (data?.length ?? 0) > 0;
    },

    /**
     * Returns all permissions for a given pet (lists authorized clinics).
     */
    async findByPetId(petId: string): Promise<EhrPermissionRow[]> {
        const { data, error } = await supabase
            .from('ehr_permissions')
            .select('*')
            .eq('pet_id', petId)
            .order('granted_at', { ascending: false });

        if (error) throw new Error(error.message);
        return (data ?? []) as EhrPermissionRow[];
    },

    /**
     * Check whether a specific clinic has been granted access to a pet's records.
     */
    async hasPermission(petId: string, clinicId: string): Promise<boolean> {
        const { data, error } = await supabase
            .from('ehr_permissions')
            .select('id')
            .eq('pet_id', petId)
            .eq('clinic_id', clinicId)
            .maybeSingle();

        if (error) throw new Error(error.message);
        return data !== null;
    },

    /**
     * Find a single permission record (used for existence check before delete).
     */
    async findOne(petId: string, clinicId: string): Promise<EhrPermissionRow | null> {
        const { data, error } = await supabase
            .from('ehr_permissions')
            .select('*')
            .eq('pet_id', petId)
            .eq('clinic_id', clinicId)
            .maybeSingle();

        if (error) throw new Error(error.message);
        return (data as EhrPermissionRow) ?? null;
    },
};
