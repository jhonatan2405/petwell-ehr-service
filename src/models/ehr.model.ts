// =============================================
// PetWell EHR Service - Domain Models & Types
// =============================================

// --- Database Row Shape (matches Supabase table) ---

export interface EhrRecordRow {
    id: string;
    pet_id: string;
    clinic_id: string;
    veterinarian_id: string | null;
    visit_date: string;       // DATE returned as ISO string by Supabase (YYYY-MM-DD)
    visit_time: string | null; // TIME e.g. "10:30:00"
    reason: string | null;
    anamnesis: string | null;
    diagnosis: string | null;
    treatment: string | null;
    prescriptions: string | null;
    lab_results: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

// --- Application-level DTOs ---

/**
 * DTO for creating a new EHR record.
 * NOTE: clinic_id is NEVER in this DTO — it is always injected
 * from the authenticated user's JWT (user.clinic_id) in the service layer.
 */
export interface CreateEhrDto {
    pet_id: string;           // Required
    visit_date: string;       // Required — ISO date (YYYY-MM-DD)
    visit_time?: string;      // Optional — HH:MM or HH:MM:SS
    veterinarian_id?: string; // Optional
    reason?: string;
    anamnesis?: string;
    diagnosis?: string;
    treatment?: string;
    prescriptions?: string;
    lab_results?: string;
    notes?: string;
}

/**
 * DTO for partial updates.
 * pet_id and clinic_id are immutable after creation.
 */
export interface UpdateEhrDto {
    visit_date?: string;
    visit_time?: string;
    veterinarian_id?: string;
    reason?: string;
    anamnesis?: string;
    diagnosis?: string;
    treatment?: string;
    prescriptions?: string;
    lab_results?: string;
    notes?: string;
}

// --- API Response Shape ---

export type EhrRecordPublic = EhrRecordRow;

// --- JWT Payload (mirrors User Service shape) ---

export interface JwtPayload {
    sub: string;              // user_id
    email: string;
    role: string;             // e.g. "DUENO_MASCOTA", "CLINIC_ADMIN", "VETERINARIO", "RECEPCIONISTA"
    clinic_id?: string | null;
    iat?: number;
    exp?: number;
}

// ── ehr_permissions ──────────────────────────────────────────────────────────

export interface EhrPermissionRow {
    id: string;
    pet_id: string;
    clinic_id: string;
    granted_by: string;       // owner user_id
    granted_at: string;
}

export interface CreatePermissionDto {
    pet_id: string;
    clinic_id: string;
}

export interface RevokePermissionDto {
    pet_id: string;
    clinic_id: string;
}

// ── ehr_audit_logs ────────────────────────────────────────────────────────────

export type AuditAction = 'CREATE' | 'VIEW' | 'UPDATE' | 'DELETE';

export interface EhrAuditLogRow {
    id: string;
    ehr_id: string | null;
    pet_id: string | null;
    action: AuditAction;
    actor_id: string;
    role: string;
    clinic_id: string | null;
    created_at: string;
}

export interface CreateAuditLogDto {
    ehr_id?: string | null;
    pet_id?: string | null;
    action: AuditAction;
    actor_id: string;
    role: string;
    clinic_id?: string | null;
}
