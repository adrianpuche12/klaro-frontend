import { AxiosError } from 'axios';
import { apiErrorMessage, isRateLimited, markRateLimited, rateLimitMessage } from '../apiError';

const axiosError = (status: number, data?: unknown, headers: Record<string, string> = {}) =>
  new AxiosError('falló', 'ERR_BAD_REQUEST', undefined, undefined,
    ({ status, data, statusText: '', headers, config: {} } as any));

const BODY_BACKEND = { error: 'Too Many Requests', message: 'Límite de peticiones alcanzado. Intentá en un minuto.' };

describe('429 del rate limit', () => {
  it('detecta el 429 y nada más', () => {
    expect(isRateLimited(axiosError(429))).toBe(true);
    expect(isRateLimited(axiosError(403))).toBe(false);
    expect(isRateLimited(new Error('x'))).toBe(false);
  });

  it('usa Retry-After si llega (mobile) y "un minuto" si no (web)', () => {
    expect(rateLimitMessage('12')).toContain('Esperá 12 segundos');
    expect(rateLimitMessage('1')).toContain('Esperá 1 segundo ');
    expect(rateLimitMessage(undefined)).toContain('Esperá un minuto');
    expect(rateLimitMessage('basura')).toContain('Esperá un minuto');
    expect(rateLimitMessage('99999')).toContain('Esperá un minuto');
  });

  it('el interceptor reescribe data.error, que es lo que muestran las pantallas', () => {
    const e = axiosError(429, { ...BODY_BACKEND }, { 'retry-after': '30' });
    markRateLimited(e);
    const data: any = e.response!.data;
    expect(data.error).toContain('demasiados pedidos');
    expect(data.error).toContain('30 segundos');
    expect(data.message).toBe(data.error);
    expect(data.error).not.toContain('Too Many Requests');
  });

  it('no toca otros errores', () => {
    const e = axiosError(409, { error: 'Sin stock' });
    markRateLimited(e);
    expect((e.response!.data as any).error).toBe('Sin stock');
  });

  it('apiErrorMessage muestra el mensaje claro aunque no haya pasado por el interceptor', () => {
    expect(apiErrorMessage(axiosError(429, BODY_BACKEND), 'fallback')).toContain('demasiados pedidos');
  });
});
