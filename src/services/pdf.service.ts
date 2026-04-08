import PDFDocument from 'pdfkit';
import { ehrRepository } from '../repositories/ehr.repository';
import { vaccinationRepository } from '../repositories/vaccination.repository';
import { permissionRepository } from '../repositories/permission.repository';
import { JwtPayload } from '../models/ehr.model';
import { env } from '../config/env';

// -----------------------------------------------------------------------
// PDF Service – generatePetHistory (v3.2)
//
// KEY RULES:
//  1. Never use emojis in PDFKit text  —  Helvetica is Latin-1 only.
//  2. Always normalize DATE strings (YYYY-MM-DD) to T12:00:00 before parsing
//     to prevent UTC midnight → local-previous-day shift.
//  3. Use record.veterinarian_id (never created_by / actor_id).
//  4. Debug console.log before building PDF to aid diagnostics.
// -----------------------------------------------------------------------

function makeError(message: string, statusCode: number): Error {
    const err = new Error(message);
    (err as { statusCode?: number }).statusCode = statusCode;
    return err;
}

interface PetData {
    name: string;
    species: string;
    breed: string | null;
    birth_date: string | null;
    weight: number | null;
    photo_url: string | null;
    owner_ids: string[];
    primary_clinic_id: string | null;
}

async function fetchPet(petId: string, token: string): Promise<PetData> {
    const res = await fetch(`${env.petServiceUrl}/api/v1/pets/${petId}`, {
        headers: { Authorization: token },
    });
    if (!res.ok) throw makeError('Mascota no encontrada', 404);
    const body = (await res.json()) as { data?: PetData };
    if (!body.data) throw makeError('Datos de mascota no disponibles', 502);
    return body.data;
}

async function fetchClinic(clinicId: string, token: string): Promise<any> {
    const res = await fetch(`${env.userServiceUrl}/api/v1/clinics/${clinicId}`, {
        headers: { Authorization: token },
    });
    if (!res.ok) return null;
    const body = await res.json() as { data?: any };
    return body.data;
}

/**
 * Fetch a user's name from User Service (via API Gateway URL in env).
 * Handles both flat { data: { name } } and nested { data: { data: { name } } }
 * response shapes to be resilient against different gateway configs.
 */
async function fetchVetName(userId: string, token: string): Promise<string | null> {
    try {
        const res = await fetch(`${env.userServiceUrl}/api/v1/users/${userId}`, {
            headers: { Authorization: token },
        });
        if (!res.ok) {
            console.warn(`[PDF] fetchVetName(${userId}) → HTTP ${res.status}`);
            return null;
        }
        const body = await res.json() as any;
        // Try both shapes
        const name: string | undefined =
            body?.data?.name ??
            body?.data?.data?.name ??
            body?.name;
        if (!name) console.warn(`[PDF] fetchVetName(${userId}) → no name field`, JSON.stringify(body).slice(0, 200));
        return name ?? null;
    } catch (e) {
        console.error(`[PDF] fetchVetName(${userId}) error:`, e);
        return null;
    }
}

async function fetchImageBuffer(url: string | null): Promise<Buffer | null> {
    if (!url) return null;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;
        return Buffer.from(await res.arrayBuffer());
    } catch {
        return null;
    }
}

async function isPetOwner(petId: string, userId: string, token: string): Promise<boolean> {
    try {
        const pet = await fetchPet(petId, token);
        return (pet.owner_ids ?? []).includes(userId);
    } catch {
        return false;
    }
}

/**
 * Normalise a DATE string (YYYY-MM-DD) to T12:00:00 before parsing.
 * This prevents the UTC midnight → local-previous-day off-by-one bug.
 */
function formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return 'N/A';
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? `${dateStr}T12:00:00`
        : dateStr;
    return new Date(normalized).toLocaleDateString('es-CO', {
        year: 'numeric', month: 'long', day: 'numeric',
    });
}

/** Format "HH:MM:SS" or "HH:MM" → "10:30 AM" */
function formatTime(timeStr: string | null | undefined): string {
    if (!timeStr) return '';
    const [hStr, mStr] = timeStr.split(':');
    const h = parseInt(hStr ?? '0', 10);
    const m = mStr ?? '00';
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m} ${period}`;
}

function calcAge(birthDate: string | null): string {
    if (!birthDate) return 'N/A';
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(birthDate)
        ? `${birthDate}T12:00:00`
        : birthDate;
    const birth = new Date(normalized);
    const now = new Date();
    const months =
        (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if (months < 12) return `${months} mes(es)`;
    return `${Math.floor(months / 12)} ano(s)`;
}

function vaccineStatus(nextDueDateStr: string | null | undefined): { label: string; color: string } {
    if (!nextDueDateStr) return { label: 'Sin fecha', color: '#7f8c8d' };
    const normalized = /^\d{4}-\d{2}-\d{2}$/.test(nextDueDateStr)
        ? `${nextDueDateStr}T12:00:00`
        : nextDueDateStr;
    const diffDays = Math.floor((new Date(normalized).getTime() - Date.now()) / 86400000);
    if (diffDays < 0)   return { label: 'Vencida', color: '#c0392b' };
    if (diffDays <= 30) return { label: 'Proxima', color: '#e67e22' };
    return { label: 'Vigente', color: '#27ae60' };
}

function hcNumber(id: string): string {
    const num = parseInt(id.replace(/-/g, '').slice(0, 8), 16) % 1000000;
    return `HC-${String(num).padStart(6, '0')}`;
}

/** Capitalise each word, trim whitespace, and strip common title prefixes. */
function formatName(raw: string | null | undefined): string | null {
    if (!raw) return null;
    return raw
        .trim()
        .replace(/^(dr\.?|dra\.?)\s+/i, '')  // strip Dr / Dra prefix
        .toLowerCase()
        .split(' ')
        .filter(Boolean)
        .map(p => p.charAt(0).toUpperCase() + p.slice(1))
        .join(' ') || null;
}

export const pdfService = {
    async generatePetHistory(
        petId: string,
        user: JwtPayload,
        token: string,
    ): Promise<Buffer> {

        // ── Authorization ────────────────────────────────────────────────────
        if (user.role === 'DUENO_MASCOTA') {
            if (!(await isPetOwner(petId, user.sub, token)))
                throw makeError('No tienes permiso para exportar este historial', 403);
        } else if (user.role === 'CLINIC_ADMIN' || user.role === 'VETERINARIO') {
            if (!user.clinic_id)
                throw makeError('Tu cuenta no tiene una clinica asociada', 403);
        } else {
            throw makeError('No tienes permisos para exportar historiales clinicos', 403);
        }

        // ── Fetch all data ────────────────────────────────────────────────────
        const [pet, allEhrRecords, allVaccinations, clinic] = await Promise.all([
            fetchPet(petId, token),
            (async () => {
                if (user.role === 'DUENO_MASCOTA') return ehrRepository.findByPetId(petId);
                const ok = await permissionRepository.hasPermission(petId, user.clinic_id!);
                return ok
                    ? ehrRepository.findByPetId(petId)
                    : ehrRepository.findByPetIdAndClinic(petId, user.clinic_id!);
            })(),
            (async () => {
                if (user.role === 'DUENO_MASCOTA') return vaccinationRepository.findByPetId(petId);
                const ok = await permissionRepository.hasPermission(petId, user.clinic_id!);
                return ok
                    ? vaccinationRepository.findByPetId(petId)
                    : vaccinationRepository.findByPetIdAndClinic(petId, user.clinic_id!);
            })(),
            user.clinic_id ? fetchClinic(user.clinic_id, token) : Promise.resolve(null),
        ]);

        // ── DEBUG — log raw data before PDF build ─────────────────────────────
        console.log('[PDF DEBUG] EHR records count:', allEhrRecords.length);
        if (allEhrRecords.length > 0) {
            const first = allEhrRecords[0] as any;
            console.log('[PDF DEBUG] First EHR record sample:', JSON.stringify({
                id: first.id,
                visit_date: first.visit_date,
                visit_time: first.visit_time,
                veterinarian_id: first.veterinarian_id,
            }));
        }
        console.log('[PDF DEBUG] Vaccinations count:', allVaccinations.length);
        if (allVaccinations.length > 0) {
            const first = allVaccinations[0] as any;
            console.log('[PDF DEBUG] First vaccination sample:', JSON.stringify({
                id: first.id,
                application_date: first.application_date,
                application_time: first.application_time,
                veterinarian_id: first.veterinarian_id,
            }));
        }

        // ── Fetch images ──────────────────────────────────────────────────────
        const [petPhotoBuffer, clinicLogoBuffer] = await Promise.all([
            fetchImageBuffer(pet.photo_url),
            fetchImageBuffer(clinic?.logo_url),
        ]);

        // ── Build unified vet name map from both EHR + vaccination records ────
        const allVetIds = [...new Set([
            ...allEhrRecords.map((r: any) => r.veterinarian_id as string | null),
            ...allVaccinations.map((v: any) => v.veterinarian_id as string | null),
        ].filter((id): id is string => !!id))];

        console.log('[PDF DEBUG] Vet IDs to resolve:', allVetIds);

        const vetMap: Record<string, string> = {};
        await Promise.all(
            allVetIds.map(async (id) => {
                const name = await fetchVetName(id, token);
                console.log(`[PDF DEBUG] Vet ${id} → ${name ?? 'NOT FOUND'}`);
                if (name) vetMap[id] = name;
            }),
        );

        console.log('[PDF DEBUG] VetMap:', JSON.stringify(vetMap));

        // ── Build PDF ─────────────────────────────────────────────────────────
        return new Promise((resolve, reject) => {
            const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: true });
            const chunks: Buffer[] = [];
            doc.on('data', (c: Buffer) => chunks.push(c));
            doc.on('end',  () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);

            // Design tokens
            const PRIMARY    = '#1a3c5e';
            const ACCENT     = '#2980b9';
            const LIGHT_BG   = '#eaf4fb';
            const STRIPE_ODD = '#f4f8fb';
            const TEXT       = '#2c3e50';
            const MUTED      = '#7f8c8d';
            const L = 50, R = 545, W = R - L;

            function ensureSpace(y: number, needed: number): number {
                if (y + needed > doc.page.height - 70) { doc.addPage(); return 50; }
                return y;
            }
            function sectionBar(title: string, y: number): number {
                y = ensureSpace(y, 28);
                doc.rect(L, y, W, 22).fill(PRIMARY);
                doc.fillColor('#ffffff').fontSize(11).font('Helvetica-Bold')
                    .text(title, L + 8, y + 6, { width: W - 16 });
                return y + 28;
            }
            function divider(y: number): number {
                doc.moveTo(L, y).lineTo(R, y).strokeColor('#c8d8e4').lineWidth(0.7).stroke();
                return y + 8;
            }

            // ─── 1. HEADER ─────────────────────────────────────────────────
            const LOGO_W = 60;
            const TEXT_X = clinicLogoBuffer ? L + LOGO_W + 12 : L;
            const TEXT_W = clinicLogoBuffer ? W - LOGO_W - 12 : W;

            if (clinicLogoBuffer) doc.image(clinicLogoBuffer, L, 38, { fit: [LOGO_W, LOGO_W] });

            doc.fillColor(PRIMARY).fontSize(18).font('Helvetica-Bold')
                .text(clinic?.clinic_name ?? clinic?.name ?? 'PetWell', TEXT_X, 40, { width: TEXT_W });
            doc.fillColor(ACCENT).fontSize(10).font('Helvetica')
                .text('Historia Clinica Veterinaria', TEXT_X, doc.y + 2, { width: TEXT_W });
            doc.fillColor(MUTED).fontSize(9).font('Helvetica-Bold')
                .text(hcNumber(petId), TEXT_X, doc.y + 2, { width: TEXT_W });
            doc.fillColor(MUTED).fontSize(8).font('Helvetica')
                .text(`Generado el: ${formatDate(new Date().toISOString())}`, L, doc.y + 4,
                    { align: 'right', width: W });

            let y = Math.max(doc.y + 10, 118);
            doc.moveTo(L, y).lineTo(R, y).strokeColor(PRIMARY).lineWidth(2).stroke();
            y += 14;

            // ─── 2. MASCOTA — two columns ───────────────────────────────────
            y = sectionBar('DATOS DE LA MASCOTA', y);
            const PHOTO_SZ = 80;
            const DATA_X   = petPhotoBuffer ? L + PHOTO_SZ + 14 : L + 8;
            const DATA_W   = petPhotoBuffer ? W - PHOTO_SZ - 14 : W - 8;
            const yBase    = y;

            if (petPhotoBuffer) doc.image(petPhotoBuffer, L, y, { fit: [PHOTO_SZ, PHOTO_SZ] });

            const petFields: [string, string][] = [
                ['Nombre',     pet.name],
                ['Especie',    pet.species],
                ['Raza',       pet.breed ?? 'N/A'],
                ['Edad',       calcAge(pet.birth_date)],
                ['Peso',       pet.weight ? `${pet.weight} kg` : 'N/A'],
                ['Nacimiento', formatDate(pet.birth_date)],
            ];
            petFields.forEach(([label, value]) => {
                doc.fillColor(TEXT).fontSize(9.5).font('Helvetica-Bold')
                    .text(`${label}:`, DATA_X, y, { continued: true, width: 90 });
                doc.font('Helvetica').text(`  ${value}`, { width: DATA_W - 90 });
                y += 13;
            });
            y = Math.max(y, yBase + PHOTO_SZ) + 14;

            // ─── 3. HISTORIAL CLINICO ───────────────────────────────────────
            y = ensureSpace(y, 40);
            y = sectionBar('HISTORIAL CLINICO', y);

            if (allEhrRecords.length === 0) {
                doc.fillColor(MUTED).fontSize(9.5).font('Helvetica')
                    .text('Sin registros clinicos.', L + 8, y);
                y += 18;
            } else {
                allEhrRecords.forEach((record: any, idx: number) => {
                    y = ensureSpace(y, 55);

                    const vetId   = record.veterinarian_id as string | null;
                    const vetName = vetId ? formatName(vetMap[vetId]) : null;
                    const timeStr = record.visit_time ? formatTime(record.visit_time) : '';
                    const dateFmt = formatDate(record.visit_date);
                    
                    const headerParts = [`Consulta #${idx + 1}`, dateFmt];
                    if (timeStr) headerParts.push(timeStr);
                    if (vetName) headerParts.push(`Vet: ${vetName}`);
                    
                    const header = headerParts.join('  |  ');

                    doc.rect(L, y, W, 18).fill(LIGHT_BG);
                    doc.fillColor(PRIMARY).fontSize(9.5).font('Helvetica-Bold')
                        .text(header, L + 6, y + 4, { continued: false, width: W - 12 });
                    y += 22;

                    const ehrFields: [string, string | null][] = [
                        ['Motivo',      record.reason],
                        ['Anamnesis',   record.anamnesis],
                        ['Diagnostico', record.diagnosis],
                        ['Tratamiento', record.treatment],
                        ['Recetas',     record.prescriptions],
                        ['Resultados',  record.lab_results],
                        ['Notas',       record.notes],
                    ];
                    ehrFields.forEach(([label, value]) => {
                        if (!value) return;
                        y = ensureSpace(y, 18);
                        doc.fillColor(TEXT).fontSize(9).font('Helvetica-Bold')
                            .text(`${label}: `, L + 8, y, { continued: true });
                        doc.font('Helvetica').text(value, { width: W - 16 });
                        y += doc.currentLineHeight() + 3;
                    });

                    if (idx < allEhrRecords.length - 1) { y += 4; y = divider(y); }
                    else { y += 10; }
                });
            }

            // ─── 5. VACUNAS — fixed-width columns with time + vet ──────────
            y = ensureSpace(y, 55);
            y = sectionBar('VACUNAS', y);

            if (allVaccinations.length === 0) {
                doc.fillColor(MUTED).fontSize(9.5).font('Helvetica')
                    .text('Sin registros de vacunas.', L + 8, y);
                y += 18;
            } else {
                const COL: Array<{ x: number; w: number; label: string; align: 'left' | 'center' }> = [
                    { x: L + 2,   w: 90,  label: 'Vacuna',        align: 'left'   },
                    { x: L + 95,  w: 95,  label: 'Fecha / Hora',  align: 'left'   },
                    { x: L + 193, w: 80,  label: 'Proxima Dosis', align: 'left'   },
                    { x: L + 276, w: 55,  label: 'Estado',        align: 'center' },
                    { x: L + 334, w: 45,  label: 'Lote',          align: 'center' },
                    { x: L + 382, w: 110, label: 'Veterinario',   align: 'center' },
                ];
                const ROW_H = 18;

                doc.rect(L, y, W, ROW_H).fill(ACCENT);
                COL.forEach(({ x, w, label, align }) => {
                    doc.fillColor('#ffffff').fontSize(7.5).font('Helvetica-Bold')
                        .text(label, x, y + 5, { width: w, align });
                });
                y += ROW_H;

                allVaccinations.forEach((v: any, idx: number) => {
                    y = ensureSpace(y, ROW_H + 2);
                    doc.rect(L, y, W, ROW_H).fill(idx % 2 === 0 ? STRIPE_ODD : '#ffffff');
                    const status  = vaccineStatus(v.next_due_date);
                    const appTime = v.application_time ? ` ${formatTime(v.application_time)}` : '';
                    const vacVet  = formatName(v.veterinarian_id ? vetMap[v.veterinarian_id] : null) ?? '—';

                    doc.fillColor(TEXT).fontSize(7.5).font('Helvetica')
                        .text(v.vaccine_name ?? '—', COL[0].x, y + 5, { width: COL[0].w, ellipsis: true });
                    doc.text(`${formatDate(v.application_date)}${appTime}`, COL[1].x, y + 5, { width: COL[1].w, ellipsis: true });
                    doc.text(v.next_due_date ? formatDate(v.next_due_date) : '—', COL[2].x, y + 5, { width: COL[2].w });
                    doc.fillColor(status.color).font('Helvetica-Bold')
                        .text(status.label, COL[3].x, y + 5, { width: COL[3].w, align: 'center' });
                    doc.fillColor(TEXT).font('Helvetica')
                        .text(v.batch_number ?? '—', COL[4].x, y + 5, { width: COL[4].w, align: 'center', ellipsis: true });
                    doc.fillColor(TEXT).font('Helvetica')
                        .text(vacVet, COL[5].x, y + 5, { width: COL[5].w, align: 'center', ellipsis: true });
                    y += ROW_H;
                });
                y += 10;
            }

            // ─── 6. FOOTER ──────────────────────────────────────────────────
            const footerY = doc.page.height - 38;
            doc.moveTo(L, footerY - 5).lineTo(R, footerY - 5)
                .strokeColor('#c8d8e4').lineWidth(0.6).stroke();
            doc.fillColor(MUTED).fontSize(7.5).font('Helvetica')
                .text(
                    'Documento generado automaticamente por PetWell  |  Confidencial  |  Uso medico veterinario exclusivo',
                    L, footerY, { align: 'center', width: W },
                );

            doc.end();
        });
    },
};
