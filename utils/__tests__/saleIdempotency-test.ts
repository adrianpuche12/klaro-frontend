import { ClaveDeVenta, huellaCarrito, nuevaClaveIdempotencia } from '../saleIdempotency';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('nuevaClaveIdempotencia', () => {
  it('es un UUID v4 de 36 caracteres (el backend acepta hasta 100)', () => {
    const k = nuevaClaveIdempotencia();
    expect(k).toMatch(UUID_V4);
  });

  it('sin crypto.randomUUID (React Native) igual da un UUID v4', () => {
    const original = (globalThis as any).crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      expect(nuevaClaveIdempotencia()).toMatch(UUID_V4);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: original, configurable: true });
    }
  });

  it('no se repite', () => {
    const claves = new Set(Array.from({ length: 200 }, () => nuevaClaveIdempotencia()));
    expect(claves.size).toBe(200);
  });
});

describe('ClaveDeVenta — una clave por venta, no por toque', () => {
  let n = 0;
  const generar = () => `clave-${++n}`;
  const carrito = [{ productId: 1, qty: 2 }, { productId: 5, qty: 1 }];

  it('doble toque o reintento con el mismo carrito → la misma clave (el backend no cobra dos veces)', () => {
    const k = new ClaveDeVenta(generar);
    const a = k.para(carrito);
    expect(k.para([...carrito])).toBe(a);
    expect(k.para(carrito)).toBe(a);
  });

  it('si cambia el carrito → clave nueva', () => {
    const k = new ClaveDeVenta(generar);
    const a = k.para(carrito);
    expect(k.para([{ productId: 1, qty: 3 }, { productId: 5, qty: 1 }])).not.toBe(a);
  });

  it('después de registrar la venta, la siguiente (aunque sea igual) lleva otra clave', () => {
    const k = new ClaveDeVenta(generar);
    const a = k.para(carrito);
    k.registrada();
    expect(k.para(carrito)).not.toBe(a);
  });

  it('la huella respeta el orden (igual que el hash del backend)', () => {
    expect(huellaCarrito(carrito)).toBe('1x2|5x1');
    expect(huellaCarrito([...carrito].reverse())).toBe('5x1|1x2');
  });
});
