import { AxiosError } from 'axios';
import {
  accessFromProfile, fetchProfileAccess, filterAllowedStores, NO_ACCESS,
} from '../profileAccess';

const API = 'http://api';

const axiosError = (status?: number, data?: unknown, code = 'ERR_BAD_RESPONSE') =>
  new AxiosError('falló', code, undefined, undefined,
    status === undefined ? undefined : ({ status, data, statusText: '', headers: {}, config: {} } as any));

const getRejecting = (e: unknown) => () => Promise.reject(e);
const getResolving = (data: unknown) => () => Promise.resolve({ data });

describe('fetchProfileAccess — falla cerrada', () => {
  it('timeout / sin red → sin permisos y status error (antes: null = menú completo)', async () => {
    const a = await fetchProfileAccess(API, 'caja1', getRejecting(axiosError(undefined, undefined, 'ECONNABORTED')));
    expect(a).toEqual(NO_ACCESS);
    expect(a.status).toBe('error');
    expect(a.fullAccess).toBe(false);
    expect(a.permissions).toEqual([]);
    expect(a.allowedStoreIds).toEqual([]);
  });

  it('500 → sin permisos', async () => {
    expect(await fetchProfileAccess(API, 'caja1', getRejecting(axiosError(500, { error: 'boom' })))).toEqual(NO_ACCESS);
  });

  it('403 → sin permisos', async () => {
    expect(await fetchProfileAccess(API, 'caja1', getRejecting(axiosError(403, '')))).toEqual(NO_ACCESS);
  });

  it('error que no es de axios → sin permisos', async () => {
    expect(await fetchProfileAccess(API, 'caja1', getRejecting(new Error('x')))).toEqual(NO_ACCESS);
  });

  it('404 con cuerpo (ruta inexistente, proxy) → sin permisos', async () => {
    expect(await fetchProfileAccess(API, 'caja1', getRejecting(axiosError(404, '<html>Not found</html>')))).toEqual(NO_ACCESS);
  });

  it('200 con HTML (index.html de un proxy) → sin permisos, no legacy', async () => {
    expect(await fetchProfileAccess(API, 'caja1', getResolving('<!doctype html>'))).toEqual(NO_ACCESS);
  });

  it('404 sin cuerpo = sin fila en app_users → sin permisos, sin pantalla de error (P6 fail-closed, igual que backend#31)', async () => {
    const a = await fetchProfileAccess(API, 'viejo', getRejecting(axiosError(404, '')));
    expect(a.status).toBe('ok');
    expect(a.fullAccess).toBe(false);
    expect(a.permissions).toEqual([]);
  });

  it('codifica el usuario en la URL', async () => {
    const get = jest.fn().mockResolvedValue({ data: { id: 1, username: 'a b' } });
    await fetchProfileAccess(API, 'a b/#', get);
    expect(get.mock.calls[0][0]).toBe(`${API}/api/v2/users/by-username/a%20b%2F%23`);
  });
});

describe('accessFromProfile — "cargó y no tiene permisos" no es "error"', () => {
  it('Role sin módulos → status ok, cero módulos, sin acceso total', () => {
    const a = accessFromProfile({ id: 1, username: 'caja1', roleId: 3, permissions: [], accessibleStoreIds: [] });
    expect(a).toEqual({ status: 'ok', canManageUsers: false, permissions: [], fullAccess: false, allowedStoreIds: [] });
  });

  it('cajero con 1 local → solo ese local', () => {
    const a = accessFromProfile({ id: 1, username: 'caja1', roleId: 3, permissions: ['POS'], accessibleStoreIds: [7] });
    expect(a.permissions).toEqual(['POS']);
    expect(a.allowedStoreIds).toEqual([7]);
    expect(a.fullAccess).toBe(false);
  });

  it('fila sin Role ni datos del modelo viejo → legacy', () => {
    expect(accessFromProfile({ id: 1, username: 'viejo', permissions: [], accessibleStoreIds: [] }).fullAccess).toBe(true);
  });

  it('permissions con forma rara → sin permisos', () => {
    expect(accessFromProfile({ id: 1, username: 'x', roleId: 1, permissions: 'POS' })).toEqual(NO_ACCESS);
  });
});

describe('filterAllowedStores (P10)', () => {
  const stores = [{ id: 1 }, { id: 2 }, { id: 3 }];

  it('perfil acotado → solo los permitidos', () => {
    expect(filterAllowedStores(stores, { fullAccess: false, allowedStoreIds: [2] })).toEqual([{ id: 2 }]);
  });

  it('sin perfil cargado (NO_ACCESS) → ningún local', () => {
    expect(filterAllowedStores(stores, NO_ACCESS)).toEqual([]);
  });

  it('root / legacy → todos', () => {
    expect(filterAllowedStores(stores, { fullAccess: true, allowedStoreIds: [] })).toEqual(stores);
  });
});
