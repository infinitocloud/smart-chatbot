// utils/myFetch.ts

let isLoggingOut = false;

export async function myFetch(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {

  function logoutUser() {
    window.localStorage.removeItem('token');
    window.localStorage.removeItem('role');
    window.location.href = '/';
  }

  const token = window.localStorage.getItem('token');
  const finalHeaders = new Headers(options.headers || {});
  if (token) {
    finalHeaders.set('Authorization', `Bearer ${token}`);
  }

  const fullUrl = `${process.env.NEXT_PUBLIC_BACKEND_URL}${endpoint}`;

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers: finalHeaders,
    });

    if (response.status === 401 || response.status === 403) {
      if (!isLoggingOut) {
        isLoggingOut = true;
        alert('Your session has expired. Please log in again.');
        logoutUser();
      }
      return {
        status: 'error',
        message: 'Session expired or not authorized.',
      };
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const msg = errData.error || 'Request error';
      return {
        status: 'error',
        message: msg,
      };
    }

    // Detectar SSE
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('text/event-stream')) {
      // Leer todo el stream manualmente
      let resultData = '';
      const reader = response.body?.getReader();
      if (!reader) {
        return {
          status: 'error',
          message: 'Could not read response stream',
        };
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = new TextDecoder('utf-8').decode(value);
        resultData += chunk;
      }

      // Parse SSE
      const parsedData = parseSSEData(resultData);
      return {
        status: 'ok',
        data: parsedData,
      };
    } else {
      // JSON normal
      const data = await response.json().catch(() => ({}));
      return {
        status: 'ok',
        data,
      };
    }

  } catch (error) {
    console.error('Error in myFetch:', error);
    return {
      status: 'error',
      message: String(error),
    };
  }
}

// parseSSEData => extrae assistantContent, usageLogId, done
function parseSSEData(fullSSE: string) {
  const accum = {
    assistantContent: '',
    usageLogId: undefined as string | undefined,
    done: false,
  };

  // Cada evento SSE va separado por "\n\n"
  // y empieza con "data: {...}"
  const events = fullSSE.split('\n\n');
  for (const e of events) {
    if (e.startsWith('data: ')) {
      const jsonStr = e.slice(6).trim(); // remove "data: "
      if (!jsonStr) continue;

      try {
        const parsed = JSON.parse(jsonStr);
        // Concatenar el contenido
        if (parsed.assistantContent) {
          accum.assistantContent += parsed.assistantContent;
        }
        // Guardar usageLogId
        if (typeof parsed.usageLogId !== 'undefined') {
          accum.usageLogId = String(parsed.usageLogId);
        }
        // done
        if (parsed.done === true) {
          accum.done = true;
        }
      } catch (err) {
        console.error('parseSSEData => error:', err, 'chunk:', e);
      }
    }
  }

  return accum;
}

