import { APP_LOCALE } from './format';

/**
 * Fechas "solo día" del backend (LocalDate → "yyyy-MM-dd").
 *
 * `new Date('2026-11-01')` se interpreta como medianoche UTC: en un huso negativo
 * (ej. UTC-6) se muestra como el día ANTERIOR. Acá se arma la fecha en hora local
 * (al mediodía, para que ningún cambio de horario la corra de día).
 */
export function parseDateOnly(value?: string | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/** ¿El string trae hora? Las operaciones guardan solo la fecha: sin "T" no hay hora que mostrar (O-12). */
export const hasTime = (value?: string | null): boolean => !!value && value.includes('T');

/** DD/MM/AAAA en el locale de la app, sin corrimiento por huso horario. */
export function formatDateOnly(value?: string | null): string {
  const d = parseDateOnly(value);
  if (!d) return '—';
  return d.toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Cantidad de días de un rango, contando ambos extremos (mínimo 1). */
export function daysInRange(start: Date, end: Date): number {
  const a = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const b = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
}
