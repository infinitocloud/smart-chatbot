// frontend/utils/myFetch.ts

// Variable global para evitar múltiples alert/logout simultáneos
let isLoggingOut = false;

export async function myFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {

  // Helper interno para logout
  function logoutUser() {
    window.localStorage.removeItem('token');
    window.localStorage.removeItem('role');
    window.location.href = '/';
  }

  // 1) Obtener token de localStorage
  const token = window.localStorage.getItem('token');

  // 2) Construir headers con Authorization si hay token
  const finalHeaders = new Headers(options.headers || {});
  if (token) {
    finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  // 3) Armar la URL completa (BACKEND_URL + endpoint)
  const fullUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL}${endpoint}`;

  try {
    // 4) Hacemos el fetch
    const response = await fetch(fullUrl, {
      ...options,
      headers: finalHeaders,
    });

    // 5) Manejo de 401/403 => sesión expirada o no autorizada
    if (response.status === 401 || response.status === 403) {
      // Evitar múltiples alert en paralelo
      if (!isLoggingOut) {
        isLoggingOut = true;
        alert('Your session has expired. Please log in again.');
        logoutUser();
      }
      // En vez de throw => devolvemos un objeto error
      return {
        status: 'error',
        message: 'Session expired or not authorized.',
      };
    }

    // 6) Ver si hubo otro error (4xx o 5xx)
    if (!response.ok) {
      // Intentamos parsear error
      const errData = await response.json().catch(() => ({}));
      const msg = errData.error || 'Request error';
      return {
        status: 'error',
        message: msg,
      };
    }

    // 7) Si todo OK => parseamos el JSON
    const data = await response.json().catch(() => ({}));
    return {
      status: 'ok',
      data,
    };

  } catch (error) {
    console.error('Error in myFetch:', error);
    return {
      status: 'error',
      message: String(error),
    };
  }
}

