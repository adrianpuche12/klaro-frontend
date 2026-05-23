import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { API_KEYCLOAK_ADAPTER_URL } from '../config';
import { Platform } from 'react-native';


interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  roles: string[];
  userName: string | null;
  userId: string | null;
  loading: boolean;
  error: string | null;
}


interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const Storage = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        sessionStorage.setItem(key, value);
      }
      await AsyncStorage.setItem(key, value);
    } catch (error) {
      console.error('Error guardando datos:', error);
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return sessionStorage.getItem(key);
      }
      return await AsyncStorage.getItem(key);
    } catch (error) {
      console.error('Error obteniendo datos:', error);
      return null;
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        sessionStorage.removeItem(key);
      }
      await AsyncStorage.removeItem(key);
    } catch (error) {
      console.error('Error eliminando datos:', error);
    }
  },

  async multiSet(keyValuePairs: [string, string][]): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        keyValuePairs.forEach(([key, value]) => {
          sessionStorage.setItem(key, value);
        });
        return;
      }
      await AsyncStorage.multiSet(keyValuePairs);
    } catch (error) {
      console.error('Error guardando múltiples datos:', error);
    }
  },

  async multiGet(keys: string[]): Promise<readonly [string, string | null][]> {
    try {
      if (Platform.OS === 'web') {
        return keys.map(key => [key, sessionStorage.getItem(key)] as [string, string | null]);
      }
      return await AsyncStorage.multiGet(keys);
    } catch (error) {
      console.error('Error obteniendo múltiples datos:', error);
      return keys.map(key => [key, null] as [string, string | null]);
    }
  },

  async multiRemove(keys: string[]): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        keys.forEach(key => sessionStorage.removeItem(key));
        return;
      }
      await AsyncStorage.multiRemove(keys);
    } catch (error) {
      console.error('Error eliminando múltiples datos:', error);
    }
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [authState, setAuthState] = useState<AuthState>({
    accessToken: null,
    refreshToken: null,
    expiresIn: null,
    roles: [],
    userName: null,
    userId: null,
    loading: true,
    error: null,
  });

  const setAxiosAuthHeader = (token: string | null) => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    } else {
      delete axios.defaults.headers.common['Authorization'];
    }
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
    try {
      let refreshToken = tokenToUse || authState.refreshToken;
      
      if (!refreshToken) {
        const storedRefreshToken = await Storage.getItem('refreshToken');
        if (!storedRefreshToken) {
          throw new Error("No refresh token available");
        }
        refreshToken = storedRefreshToken;
      }
      const response = await axios.post(
        `${API_KEYCLOAK_ADAPTER_URL}/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: 'klaro-frontend',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const decodedToken = jwtDecode<any>(access_token);
      const userRoles = decodedToken.realm_access?.roles || [];
      const isAdmin = userRoles.includes('admin');
      const userName = decodedToken.preferred_username;
      const userId = decodedToken.sub;

      await Storage.multiSet([
        ['accessToken', access_token],
        ['refreshToken', refresh_token],
        ['expiresIn', expires_in.toString()],
        ['userName', userName],
        ['userId', userId],
        ['roles', JSON.stringify(isAdmin ? ['admin'] : ['user'])],
      ]);

      setAxiosAuthHeader(access_token);
      setAuthState(prev => ({
        ...prev,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        roles: isAdmin ? ['admin'] : ['user'],
        userName,
        userId,
        loading: false,
        error: null
      }));
  
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        await logout();
      }
      throw error;
    }
  };

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const response = await axios.post(
        `${API_KEYCLOAK_ADAPTER_URL}/token`,
        new URLSearchParams({
          grant_type: 'password',
          username,
          password,
          client_id: 'klaro-frontend',
        }),
        { 
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, 
          withCredentials: false
        }
      );

      const { access_token, refresh_token, expires_in } = response.data;
      const decodedToken = jwtDecode<any>(access_token);

      console.log('Decoded token:', decodedToken);
      console.log('Roles from token:', decodedToken.realm_access?.roles);

      const userRoles = decodedToken.realm_access?.roles || [];
      const isAdmin = userRoles.includes('admin');
      const userName = decodedToken.preferred_username;
      const userId = decodedToken.sub;

      await Storage.multiSet([
        ['accessToken', access_token],
        ['refreshToken', refresh_token],
        ['expiresIn', expires_in.toString()],
        ['userName', userName],
        ['userId', userId],
        ['roles', JSON.stringify(isAdmin ? ['admin'] : ['user'])],
      ]);

      setAxiosAuthHeader(access_token);
      setAuthState({
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresIn: expires_in,
        roles: isAdmin ? ['admin'] : ['user'],
        userName,
        userId,
        loading: false,
        error: null,
      });

      return true;
    } catch (error) {
      console.error('Login error:', error);
      setAuthState(prev => ({
        ...prev,
        error: 'Error durante el inicio de sesión',
        loading: false,
      }));
      return false;
    }
  };

  const logout = async () => {
    try {
      await Storage.multiRemove([
        'accessToken', 
        'refreshToken', 
        'expiresIn', 
        'userName', 
        'userId', 
        'roles'
      ]);
      
      setAxiosAuthHeader(null);
      setAuthState({
        accessToken: null,
        refreshToken: null,
        expiresIn: null,
        roles: [],
        userName: null,
        userId: null,
        loading: false,
        error: null,
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const storageData = await Storage.multiGet([
          'accessToken',
          'refreshToken',
          'expiresIn',
          'userName',
          'userId',
          'roles'
        ]);
    
        const storageMap = Object.fromEntries(storageData);
        const accessToken = storageMap.accessToken;
        const refreshToken = storageMap.refreshToken;
        
        if (accessToken && refreshToken) {
          try {
            if (isTokenExpiringSoon(accessToken)) {
              await refreshAccessToken();
            } else {
              setAxiosAuthHeader(accessToken);
              
              let roles: string[] = [];
              try {
                if (storageMap.roles) {
                  roles = JSON.parse(storageMap.roles);
                }
              } catch (e) {
              }
              
              setAuthState({
                accessToken,
                refreshToken,
                expiresIn: parseInt(storageMap.expiresIn || '0', 10),
                roles,
                userName: storageMap.userName,
                userId: storageMap.userId,
                loading: false,
                error: null,
              });
            }
          } catch (tokenError) {
            setAuthState(prev => ({ 
              ...prev, 
              accessToken: null,
              refreshToken: null,
              roles: [],
              loading: false,
              error: null
            }));
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
          !originalRequest._retry && 
          authState.refreshToken
        ) {
          originalRequest._retry = true;
          try {
            const newTokens = await refreshAccessToken();
            originalRequest.headers['Authorization'] = `Bearer ${newTokens.access_token}`;
            return axios(originalRequest);
          } catch (refreshError) {
            await logout();
            return Promise.reject(error);
          }
        }
        return Promise.reject(error);
      }
    );

    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [authState.refreshToken]);

  if (authState.loading) {
    return null;
  }

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