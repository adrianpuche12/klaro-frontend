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

/**
 * Formatea una fecha ISO a DD/MM/AAAA en el locale de la app.
 */
export const formatDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(APP_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });

/**
 * Formatea una fecha ISO a HH:MM en el locale de la app.
 */
export const formatTime = (iso: string): string =>
  new Date(iso).toLocaleTimeString(APP_LOCALE, { hour: '2-digit', minute: '2-digit' });

/**
 * Fecha relativa simple: 'Hoy', 'Ayer', o la fecha formateada.
 */
export const formatDateRelative = (iso: string): string => {
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `hace ${diffDays} días`;
  return formatDate(iso);
};
