/** Locale neutro para LATAM: separador de miles "," y decimal "." (igual que el formato anterior). */
export const APP_LOCALE = 'es-419';

/**
 * Formatea un monto en la moneda de la empresa (código ISO 4217 de tenant_config.currency).
 * Nunca asume la moneda de un cliente: sin moneda configurada muestra solo el número.
 * Ej.: formatMoney(1234.5, 'HNL') → 'L 1,234.50'; formatMoney(1234.5, 'USD') → '$ 1,234.50'.
 */
export const formatMoney = (v: number | string | null | undefined, currency?: string | null): string => {
  const n = Number(v ?? 0);
  const amount = (Number.isFinite(n) ? n : 0).toLocaleString(APP_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const code = (currency ?? '').trim().toUpperCase();
  if (!code) return amount;
  return `${currencySymbol(code)} ${amount}`;
};

/** Símbolo corto de la moneda ('HNL' → 'L', 'USD' → '$'); si el runtime no lo conoce, el código. */
export const currencySymbol = (code: string): string => {
  try {
    const part = new Intl.NumberFormat(APP_LOCALE, { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
      .formatToParts(0)
      .find(p => p.type === 'currency');
    return part?.value?.trim() || code;
  } catch {
    return code;
  }
};

// ── Zona horaria de la empresa ──────────────────────────────────────────────
// Las horas del backend llegan como instantes UTC ("2026-09-08T19:43:00Z"). Se muestran en la
// zona de la EMPRESA (tenant_config.timezone), no en la del dispositivo: una cajera de Honduras
// y un dueño que mira desde otro país tienen que ver la misma hora de apertura de turno.
// TenantConfigProvider la fija al cargar la configuración (setAppTimeZone).
let appTimeZone: string | undefined;

/** Fija la zona horaria de la empresa. Una zona inválida se ignora (se usa la del dispositivo). */
export const setAppTimeZone = (tz?: string | null): void => {
  if (!tz) { appTimeZone = undefined; return; }
  try {
    new Intl.DateTimeFormat(APP_LOCALE, { timeZone: tz });
    appTimeZone = tz;
  } catch {
    appTimeZone = undefined;
  }
};

export const getAppTimeZone = (): string | undefined => appTimeZone;

/** Opciones de Intl con la zona de la empresa (vacío si no hay zona configurada). */
export const tzOptions = (): { timeZone?: string } => (appTimeZone ? { timeZone: appTimeZone } : {});

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Formatea a DD/MM/AAAA.
 * - Fecha "solo día" del backend ("2026-09-08", LocalDate): es una fecha de calendario, se
 *   muestra tal cual, sin convertir de zona (si no, en un huso negativo saldría el día anterior).
 * - Instante ("…T19:43:00Z"): se muestra el día en la zona de la empresa.
 */
export const formatDate = (iso: string): string => {
  const m = DATE_ONLY.exec((iso ?? '').trim());
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12));
    return d.toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  }
  return new Date(iso).toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric', ...tzOptions() });
};

/** Formatea un instante a HH:MM en la zona de la empresa. */
export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit', ...tzOptions() });

/** Día calendario ("yyyy-mm-dd") de un instante en la zona de la empresa. */
const dayKey = (d: Date): string => {
  const parts = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...tzOptions() })
    .formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
};

/** ¿El instante cae HOY en la zona de la empresa? */
export const isTodayInCompany = (iso: string): boolean => dayKey(new Date(iso)) === dayKey(new Date());

/**
 * Fecha relativa simple: 'Hoy', 'Ayer', o la fecha formateada (días de la empresa).
 */
export const formatDateRelative = (iso: string): string => {
  const toUtcDay = (key: string) => { const [y, mo, da] = key.split('-').map(Number); return Date.UTC(y, mo - 1, da); };
  const target = DATE_ONLY.test((iso ?? '').trim()) ? iso.trim() : dayKey(new Date(iso));
  const diffDays = Math.round((toUtcDay(dayKey(new Date())) - toUtcDay(target)) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return formatDate(iso);
};
