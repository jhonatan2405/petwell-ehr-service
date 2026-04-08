import { supabase } from '../config/supabase';
import { EhrAuditLogRow, CreateAuditLogDto } from '../models/ehr.model';

// -----------------------------------------------------------------------
// Audit Repository – Supabase interactions for ehr_audit_logs table.
// -----------------------------------------------------------------------

export const auditRepository = {
    /**
     * Insert a new audit log entry.
     * Called from the service layer after every CREATE / VIEW / UPDATE / DELETE.
     */
    async create(data: CreateAuditLogDto): Promise<EhrAuditLogRow> {
        const { data: row, error } = await supabase
            .from('ehr_audit_logs')
            .insert({
                ehr_id: data.ehr_id ?? null,
                pet_id: data.pet_id ?? null,
                action: data.action,
                actor_id: data.actor_id,
                role: data.role,
                clinic_id: data.clinic_id ?? null,
                created_at: new Date().toISOString(),
            })
            .select('*')
            .single();

        if (error) throw new Error(error.message);
        return row as EhrAuditLogRow;
    },

    /**
     * Retrieve all audit logs for a given pet, ordered by most recent first.
     */
    async findByPetId(petId: string): Promise<EhrAuditLogRow[]> {
        const { data, error } = await supabase
            .from('ehr_audit_logs')
            .select('*')
            .eq('pet_id', petId)
            .order('created_at', { ascending: false });

        if (error) throw new Error(error.message);
        return (data ?? []).map((row: any) => ({
            ...row,
            created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
        })) as EhrAuditLogRow[];
    },
};
