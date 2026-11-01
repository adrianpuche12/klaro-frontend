import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { API_KEYCLOAK_ADAPTER_URL, REACT_APP_API_URL } from '../config';
import { Platform } from 'react-native';

const CLIENT_ID = 'klaro-frontend';
const SESSION_KEYS = [
  'accessToken', 'refreshToken', 'expiresIn', 'userName', 'userId', 'roles', 'canManageUsers', 'permissions',
];

/** L-01: el login informa POR QUÉ falló (antes devolvía false y todo era "contraseña incorrecta"). */
export type AuthErrorCode = 'credentials' | 'network' | 'server' | 'unknown';
export class AuthError extends Error {
  constructor(public code: AuthErrorCode) { super(code); }
}

// K-08: cliente propio para Keycloak, con timeout y fuera del interceptor global de la API.
const kc = axios.create({
  baseURL: API_KEYCLOAK_ADAPTER_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
});

const isNetworkError = (e: any) => !e?.response;


interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  roles: string[];
  /** SPRINT-14: Keycloak ya no distingue admin/user (todos son "staff") --
   * esto viene del Role asignado en la app, no del JWT. root siempre true. */
  canManageUsers: boolean;
  /** Módulos habilitados por el Role asignado (ver constants/permissionModules.ts).
   * null = excepción legacy (mismo criterio que PermissionGuard.isLegacy en el
   * backend): sin Role Y sin businessRole/permissions/accessibleStores -> acceso
   * total, no "cero módulos". root no necesita este campo, ve todo siempre. */
  permissions: string[] | null;
  userName: string | null;
  userId: string | null;
  loading: boolean;
  error: string | null;
}

interface ProfileAccess { canManageUsers: boolean; permissions: string[] | null }

/** Resuelve canManageUsers + permissions para un staff no-root consultando su
 * perfil. root ya tiene acceso total por su rol de Keycloak, no necesita esto.
 * Espeja PermissionGuard.isLegacy() del backend: sin fila en absoluto, o con
 * fila pero sin Role ni datos del modelo viejo (businessRole/permissions/
 * accessibleStores), es la excepción legacy de acceso total. */
async function fetchProfileAccess(username: string): Promise<ProfileAccess> {
  try {
    const res = await axios.get(`${REACT_APP_API_URL}/api/v2/users/by-username/${username}`, { timeout: 15000 });
    const d = res.data;
    const isLegacy = !d.roleId
      && !d.businessRole
      && (!d.permissions || d.permissions.length === 0)
      && (!d.accessibleStoreIds || d.accessibleStoreIds.length === 0);
    return { canManageUsers: !!d.canManageUsers, permissions: isLegacy ? null : (d.permissions ?? []) };
  } catch {
    // Sin fila en app_users -> excepción legacy (mismo criterio que el backend).
    return { canManageUsers: false, permissions: null };
  }
}


interface AuthContextType extends AuthState {
  /** Lanza AuthError si falla (L-01). */
  login: (username: string, password: string) => Promise<true>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Rol de la app a partir del JWT.
 * - "platform": administrador de plataforma de Nilo (SPRINT-16). Exige el rol de Keycloak
 *   "platform" Y tenant_id = 0, igual que PlatformSecurity en el backend. No tiene empresa:
 *   no ve ni opera datos de negocio, solo la pantalla de Empresas.
 * - "root": dueño de una empresa.
 * - "staff": todo lo demás (los permisos finos vienen del Role de la app).
 */
export function resolveAppRoles(decodedToken: any): string[] {
  const userRoles: string[] = decodedToken?.realm_access?.roles || [];
  const tenantId = Number(decodedToken?.tenant_id);
  if (userRoles.includes('platform') && tenantId === 0) return ['platform'];
  if (userRoles.includes('root')) return ['root'];
  return ['staff'];
}

/**
 * K-07: un solo backend por plataforma.
 * Web → sessionStorage (la sesión dura lo que la pestaña, comportamiento actual).
 * Nativo → AsyncStorage.
 * Antes setItem/removeItem escribían en los dos (en web AsyncStorage = localStorage)
 * y multiSet/multiRemove en uno solo: quedaban tokens viejos en localStorage.
 */
const Storage = {
  async multiSet(pairs: [string, string][]): Promise<void> {
    try {
      if (Platform.OS === 'web') pairs.forEach(([k, v]) => sessionStorage.setItem(k, v));
      else await AsyncStorage.multiSet(pairs);
    } catch (error) {
      console.error('Error guardando la sesión:', error);
    }
  },

  async multiGet(keys: string[]): Promise<Record<string, string | null>> {
    try {
      if (Platform.OS === 'web') return Object.fromEntries(keys.map(k => [k, sessionStorage.getItem(k)]));
      return Object.fromEntries(await AsyncStorage.multiGet(keys));
    } catch (error) {
      console.error('Error leyendo la sesión:', error);
      return Object.fromEntries(keys.map(k => [k, null]));
    }
  },

  async clear(): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        // También borra los restos que la versión anterior dejaba en localStorage.
        SESSION_KEYS.forEach(k => { sessionStorage.removeItem(k); localStorage.removeItem(k); });
      } else {
        await AsyncStorage.multiRemove(SESSION_KEYS);
      }
    } catch (error) {
      console.error('Error limpiando la sesión:', error);
    }
  },
};

const EMPTY_STATE: AuthState = {
  accessToken: null,
  refreshToken: null,
  expiresIn: null,
  roles: [],
  canManageUsers: false,
  permissions: null,
  userName: null,
  userId: null,
  loading: false,
  error: null,
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // K-03: arranca en loading=true → el layout muestra el Splash hasta saber si hay sesión
  // (antes se veía el login un instante y después rebotaba al panel).
  const [authState, setAuthState] = useState<AuthState>({ ...EMPTY_STATE, loading: true });

  // C-06: evita múltiples refresh paralelos cuando llegan varios 401 a la vez
  const refreshPromiseRef = useRef<Promise<any> | null>(null);
  // A-02: ref para que el interceptor lea el token fresco sin re-montarse
  const refreshTokenRef   = useRef<string | null>(authState.refreshToken);
  // C-07: timer para refresh proactivo antes de que expire el token
  const refreshTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Bug encontrado en testing E2E: scheduleRefresh() se llama DENTRO de login(),
  // antes de que el setAuthState() de esa misma función corra -- el closure de
  // refreshAccessToken que scheduleRefresh captura queda con el authState.
  // canManageUsers/permissions de ANTES del login (el default inicial: false/
  // null). Con un access token de vida corta (ej. 300s en DEV), el refresh
  // proactivo pisaba estos valores unos minutos después de cada login, dejando
  // a cualquier staff con canManageUsers=true viendo el menú vacío de golpe.
  // Mismo fix que refreshTokenRef: leer del ref, no del closure de authState.
  const canManageUsersRef = useRef<boolean>(authState.canManageUsers);
  const permissionsRef    = useRef<string[] | null>(authState.permissions);

  useEffect(() => {
    refreshTokenRef.current = authState.refreshToken;
  }, [authState.refreshToken]);

  useEffect(() => {
    canManageUsersRef.current = authState.canManageUsers;
    permissionsRef.current = authState.permissions;
  }, [authState.canManageUsers, authState.permissions]);

  const setAxiosAuthHeader = (token: string | null) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
  };

  // C-07: programa un refresh proactivo ~60s antes del exp del token
  const scheduleRefresh = (token: string) => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    try {
      const decoded = jwtDecode<any>(token);
      const msUntilRefresh = decoded.exp * 1000 - Date.now() - 60_000;
      if (msUntilRefresh > 0) {
        refreshTimerRef.current = setTimeout(() => {
          refreshAccessToken().catch(() => {});
        }, msUntilRefresh);
      }
    } catch {}
  };

  const isTokenExpiringSoon = (token: string): boolean => {
    try {
      const decoded = jwtDecode<any>(token);
      const currentTime = Date.now() / 1000;
      return decoded.exp - currentTime < 300;
    } catch {
      return true;
    }
  };

  const refreshAccessToken = async (tokenToUse?: string) => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    refreshPromiseRef.current = (async () => {
    try {
      let refreshToken = tokenToUse || refreshTokenRef.current;

      if (!refreshToken) {
        const { refreshToken: stored } = await Storage.multiGet(['refreshToken']);
        if (!stored) {
          throw new Error("No refresh token available");
        }
        refreshToken = stored;
      }
      const response = await kc.post('/token', new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
      }));

      const { access_token, refresh_token, expires_in } = response.data;
      const decodedToken = jwtDecode<any>(access_token);
      const appRoles = resolveAppRoles(decodedToken);
      const isRoot = appRoles.includes('root');
      const isPlatform = appRoles.includes('platform');
      const userName = decodedToken.preferred_username;
      const userId = decodedToken.sub;
      // canManageUsers/permissions no se recalculan en cada refresh (evita una
      // llamada extra cada ~pocos minutos) -- se mantiene el último valor
      // conocido, refrescado recién en el próximo login completo. Root siempre
      // true/null (acceso total), sin excepción. Se lee de los refs (no de
      // authState directamente) porque scheduleRefresh() captura este closure
      // ANTES de que el setAuthState() del login que lo programó se aplique --
      // leer authState acá daría el valor previo al login (bug real encontrado
      // en testing E2E, ver comentario en la declaración de los refs).
      const canManageUsers = isRoot ? true : isPlatform ? false : canManageUsersRef.current;
      const permissions    = isRoot ? null : isPlatform ? [] : permissionsRef.current;

      await Storage.multiSet([
        ['accessToken', access_token],
        ['refreshToken', refresh_token],
        ['expiresIn', expires_in.toString()],
        ['userName', userName],
        ['userId', userId],
        ['roles', JSON.stringify(appRoles)],
        ['canManageUsers', String(canManageUsers)],
        ['permissions', JSON.stringify(permissions)],
      ]);

      refreshTokenRef.current = refresh_token;
      setAxiosAuthHeader(access_token);
      scheduleRefresh(access_token);
      setAuthState(prev => ({
        ...prev,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        roles: appRoles,
        canManageUsers,
        permissions,
        userName,
        userId,
        loading: false,
        error: null
      }));

      return response.data;
    } catch (error: any) {
      // K-05: con el refresh vencido Keycloak responde 400 invalid_grant (no 401).
      // Cualquier rechazo del servidor limpia la sesión guardada; un error de red NO
      // (puede ser un corte momentáneo y el refresh sigue siendo válido).
      if (!isNetworkError(error)) {
        await clearSession();
      }
      throw error;
    } finally {
      refreshPromiseRef.current = null;
    }
    })();

    return refreshPromiseRef.current;
  };

  const login = async (username: string, password: string): Promise<true> => {
    try {
      // L-02: solo se recorta el usuario; la contraseña va tal cual (puede tener espacios).
      const response = await kc.post('/token', new URLSearchParams({
        grant_type: 'password',
        username: username.trim(),
        password,
        client_id: CLIENT_ID,
      }));

      const { access_token, refresh_token, expires_in } = response.data;
      const decodedToken = jwtDecode<any>(access_token);

      const userName = decodedToken.preferred_username;
      const userId = decodedToken.sub;
      // SPRINT-14: Keycloak colapsó admin/user -> "staff". root sigue siendo
      // un rol real de Keycloak; todo lo demás es "staff" y la granularidad
      // (canManageUsers) viene del Role asignado en la app, no del JWT.
      // SPRINT-16: "platform" (tenant 0) no tiene empresa ni perfil en app_users.
      const appRoles = resolveAppRoles(decodedToken);
      const isRoot = appRoles.includes('root');
      const isPlatform = appRoles.includes('platform');

      setAxiosAuthHeader(access_token); // necesario antes de poder llamar a /by-username
      const { canManageUsers, permissions } = isRoot
        ? { canManageUsers: true, permissions: null }
        : isPlatform
          ? { canManageUsers: false, permissions: [] as string[] }
          : await fetchProfileAccess(userName);

      await Storage.multiSet([
        ['accessToken', access_token],
        ['refreshToken', refresh_token],
        ['expiresIn', expires_in.toString()],
        ['userName', userName],
        ['userId', userId],
        ['roles', JSON.stringify(appRoles)],
        ['canManageUsers', String(canManageUsers)],
        ['permissions', JSON.stringify(permissions)],
      ]);

      refreshTokenRef.current = refresh_token;
      scheduleRefresh(access_token);
      setAuthState({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        roles: appRoles,
        canManageUsers,
        permissions,
        userName,
        userId,
        loading: false,
        error: null,
      });

      return true;
    } catch (error: any) {
      const status = error?.response?.status;
      const code: AuthErrorCode =
        status === 400 || status === 401 ? 'credentials'
        : isNetworkError(error) ? 'network'
        : status >= 500 ? 'server'
        : 'unknown';
      setAxiosAuthHeader(null);
      setAuthState(prev => ({ ...prev, error: code, loading: false }));
      throw new AuthError(code);
    }
  };

  /** Borra la sesión local (storage, header, timers) sin hablar con Keycloak. */
  const clearSession = async () => {
    if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    refreshTokenRef.current = null;
    await Storage.clear();
    setAxiosAuthHeader(null);
    setAuthState(EMPTY_STATE);
  };

  const logout = async () => {
    // K-06: cerrar también la sesión en Keycloak para invalidar el refresh token.
    // Sin await: si Keycloak no responde, el usuario igual sale.
    const refreshToken = refreshTokenRef.current;
    if (refreshToken) {
      kc.post('/logout', new URLSearchParams({ client_id: CLIENT_ID, refresh_token: refreshToken })).catch(() => {});
    }
    await clearSession();
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storageMap = await Storage.multiGet(SESSION_KEYS);
        const accessToken = storageMap.accessToken;
        const refreshToken = storageMap.refreshToken;

        if (accessToken && refreshToken) {
          refreshTokenRef.current = refreshToken;
          // El refresh conserva canManageUsers/permissions desde los refs: cargarlos del
          // storage ANTES de refrescar (si no, un manager con token por vencer perdía el menú).
          canManageUsersRef.current = storageMap.canManageUsers === 'true';
          try {
            permissionsRef.current = storageMap.permissions ? JSON.parse(storageMap.permissions) : null;
          } catch {
            permissionsRef.current = null;
          }
          try {
            if (isTokenExpiringSoon(accessToken)) {
              await refreshAccessToken();
            } else {
              setAxiosAuthHeader(accessToken);
              scheduleRefresh(accessToken);

              let roles: string[] = [];
              try {
                if (storageMap.roles) {
                  roles = JSON.parse(storageMap.roles);
                }
              } catch (e) {
              }

              let permissions: string[] | null = null;
              try {
                if (storageMap.permissions) {
                  permissions = JSON.parse(storageMap.permissions);
                }
              } catch (e) {
              }

              setAuthState({
                accessToken,
                refreshToken,
                expiresIn: parseInt(storageMap.expiresIn || '0', 10),
                roles,
                canManageUsers: storageMap.canManageUsers === 'true',
                permissions,
                userName: storageMap.userName,
                userId: storageMap.userId,
                loading: false,
                error: null,
              });
            }
          } catch (tokenError) {
            // Rechazo del servidor: refreshAccessToken ya limpió el storage (K-05).
            // Error de red: se conserva lo guardado para reintentar en la próxima carga.
            setAuthState({ ...EMPTY_STATE });
          }
        } else {
          setAuthState(prev => ({ ...prev, loading: false }));
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        setAuthState(prev => ({ ...prev, loading: false }));
      }
    };

    initializeAuth();
  }, []);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      async error => {
        const originalRequest = error.config;
        if (
          error.response?.status === 401 &&
          originalRequest &&
          !originalRequest._retry &&
          refreshTokenRef.current
        ) {
          originalRequest._retry = true;
          try {
            const newTokens = await refreshAccessToken();
            originalRequest.headers['Authorization'] = `Bearer ${newTokens.access_token}`;
            return axios(originalRequest);
          } catch (refreshError) {
            // refreshAccessToken ya limpió la sesión si Keycloak la rechazó (K-05).
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []); // deps vacías — se monta una sola vez, lee el token desde refreshTokenRef

  return (
    <AuthContext.Provider
      value={{
        ...authState,
        login,
        logout,
        isAuthenticated: !!authState.accessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};