/**
 * parseQty / parseCount / parseMoney — lectura segura de lo que escribe el usuario.
 * I-04 / I-05 (Revisión 04): `Number('1,5')` da NaN y `NaN <= 0` es false → pasaba la
 * validación y se mandaba `quantity: NaN` (llega como null) al backend.
 *
 * Ninguna función asume la moneda de un cliente: el símbolo (sea cual sea) se descarta
 * y solo se interpreta el número.
 */

/** Entero > 0 o null. Acepta "12", " 12 ". Rechaza "1,5", "1.5", "-3", "abc", "1e3", "0". */
export const parseQty = (raw: string): number | null => {
  const n = parseCount(raw);
  return n !== null && n > 0 ? n : null;
};

/** Entero >= 0 o null (ej. stock mínimo). Acepta "0", "12". Rechaza "1,5", "-3", "abc". */
export const parseCount = (raw: string): number | null => {
  const s = (raw ?? '').trim();
  if (!/^\d+$/.test(s)) return null;
  const n = parseInt(s, 10);
  return Number.isSafeInteger(n) ? n : null;
};

/**
 * Monto >= 0 con hasta 2 decimales, o null.
 * Acepta "120", "120.50", "120,50", "1,234.50", "1.234,50", "$ 1,234.50", "1 234,50".
 * Reglas:
 *  - Se descarta cualquier símbolo o código de moneda al principio o al final, y los espacios.
 *  - Si hay coma y punto, el que aparece último es el decimal y el otro es separador de miles.
 *  - Si hay un solo separador (una vez), es decimal. Si se repite, es separador de miles.
 *  - Ante la duda ("1,234" se lee como 1.234 → 3 decimales) se rechaza: mejor pedir que
 *    se corrija que guardar un precio mil veces menor.
 */
export const parseMoney = (raw: string): number | null => {
  // Un signo menos en cualquier lugar es un precio negativo: se rechaza (no se "limpia").
  if ((raw ?? '').includes('-')) return null;
  let s = (raw ?? '').trim()
    .replace(/^[^\d.,]+/, '')   // símbolo/código de moneda adelante ("$", "L", "USD", "€")
    .replace(/[^\d.,]+$/, '')   // o atrás ("120 €")
    .replace(/[\s  ]/g, ''); // espacios (incluye los no separables de toLocaleString)
  if (!s || /[^\d.,]/.test(s)) return null;

  // La parte entera con separador de miles tiene que estar bien agrupada ("1,234,567"),
  // si no ("1.2.3", "12,34,5") se rechaza en vez de adivinar.
  const groupedOk = (int: string, thousand: string) =>
    !int.includes(thousand) || new RegExp(`^\\d{1,3}(\\${thousand}\\d{3})+$`).test(int);

  const lastComma = s.lastIndexOf(',');
  const lastDot   = s.lastIndexOf('.');
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal  = lastComma > lastDot ? ',' : '.';
    const thousand = decimal === ',' ? '.' : ',';
    const cut      = s.lastIndexOf(decimal);
    const int = s.slice(0, cut), dec = s.slice(cut + 1);
    if (int.includes(decimal) || !groupedOk(int, thousand)) return null;
    s = `${int.split(thousand).join('')}.${dec}`;
  } else {
    const sep = lastComma !== -1 ? ',' : lastDot !== -1 ? '.' : null;
    if (sep) {
      const count = s.split(sep).length - 1;
      if (count === 1) s = s.replace(sep, '.');
      else if (groupedOk(s, sep)) s = s.split(sep).join('');
      else return null;
    }
  }

  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100) / 100;
};
