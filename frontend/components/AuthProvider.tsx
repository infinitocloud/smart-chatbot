// components/AuthProvider.tsx

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';

interface AuthContextProps {
  token: string | null;
  role: string | null;
  userName: string | null;
  // => login() ahora retorna Promise<boolean> => true = OK, false = fallo credenciales
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextProps>({
  token: null,
  role: null,
  userName: null,
  login: async () => false,
  logout: () => {},
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);

  // Al montar, leer de localStorage
  useEffect(() => {
    const savedToken = window.localStorage.getItem('token');
    const savedRole = window.localStorage.getItem('role');
    const savedName = window.localStorage.getItem('userName');

    if (savedToken) setToken(savedToken);
    if (savedRole) setRole(savedRole);
    if (savedName) setUserName(savedName);
  }, []);

  /**
   * Iniciar sesión => /login
   * Se asume que el backend devuelve { token, role, name? }
   * @returns boolean => true si se logueó OK, false si credenciales inválidas
   */
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        // Si el status no es 200-299, asumimos credenciales inválidas
        console.log('AuthProvider => login: res not ok =>', res.status);
        return false; 
      }

      // Parseamos la respuesta
      const data = await res.json();
      const receivedToken = data.token as string;
      const receivedRole = data.role as string;
      const nameFromServer = data.name || 'User';

      // Guardar en estado
      setToken(receivedToken);
      setRole(receivedRole);
      setUserName(nameFromServer);

      // Guardar en localStorage
      window.localStorage.setItem('token', receivedToken);
      window.localStorage.setItem('role', receivedRole);
      window.localStorage.setItem('userName', nameFromServer);

      // Redirigir
      window.location.href = '/smart-chatbot';
      return true; 
    } catch (error) {
      console.error('AuthProvider => login => exception:', error);
      return false; 
    }
  };

  /**
   * Cerrar sesión
   */
  const logout = () => {
    setToken(null);
    setRole(null);
    setUserName(null);

    window.localStorage.removeItem('token');
    window.localStorage.removeItem('role');
    window.localStorage.removeItem('userName');

    // Ir a pantalla de login
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider
      value={{
        token,
        role,
        userName,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

