/**
 * Idempotency-Key de las ventas del POS ("Ventas y stock sin carreras", lado del POS).
 *
 * El backend (POST /shifts/{id}/sales) guarda la clave junto con la venta en la misma
 * transacción: un reintento con la MISMA clave y el mismo pedido devuelve la venta ya registrada
 * en vez de cobrarla dos veces; si la venta falló (p. ej. 409 por stock), la clave no queda
 * registrada y el reintento vuelve a intentar.
 *
 * Por eso la clave es una por venta, no por toque: se mantiene mientras el carrito no cambie
 * (doble toque, timeout, red caída y reintento) y se renueva al registrar la venta o al cambiar
 * el carrito.
 */

export interface ItemDeVenta { productId: number; qty: number; }

/** UUID v4. crypto.randomUUID donde exista (web moderna); si no, getRandomValues o Math.random. */
export function nuevaClaveIdempotencia(): string {
  const c: any = (globalThis as any).crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Huella del carrito en el orden en que se manda (el backend también compara en orden). */
export function huellaCarrito(items: ItemDeVenta[]): string {
  return items.map((i) => `${i.productId}x${i.qty}`).join('|');
}

/** Guarda la clave de la venta en curso. Una instancia por POS (useRef). */
export class ClaveDeVenta {
  private huella = '';
  private clave = '';

  constructor(private readonly generar: () => string = nuevaClaveIdempotencia) {}

  /** La clave para este carrito: la misma mientras el carrito no cambie. */
  para(items: ItemDeVenta[]): string {
    const h = huellaCarrito(items);
    if (h !== this.huella || !this.clave) {
      this.huella = h;
      this.clave = this.generar();
    }
    return this.clave;
  }

  /** La venta quedó registrada: la próxima venta, aunque sea igual, lleva otra clave. */
  registrada(): void {
    this.huella = '';
    this.clave = '';
  }
}
