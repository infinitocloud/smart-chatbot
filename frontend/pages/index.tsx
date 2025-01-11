// pages/index.tsx

import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../components/AuthProvider';
import NavBar from '../components/NavBar';

export default function IndexPage() {
  // Eliminamos 'role' si no lo necesitamos en este componente
  const { token, login } = useAuth();
  const router = useRouter();

  // Control de pestañas (login/register)
  const [tab, setTab] = useState<'login' | 'register'>('login');

  // Campos del formulario de LOGIN:
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // Para mostrar un error debajo del botón de login
  const [loginError, setLoginError] = useState('');

  // Campos del formulario de REGISTER:
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');

  // Banderas de carga
  const [registerLoading, setRegisterLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  // ───────────────────────────────────────────────────────────
  // 1) Redirigir a /smart-chatbot si ya hay token
  // ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (token) {
      router.push('/smart-chatbot');
    }
  }, [token, router]);

  // ───────────────────────────────────────────────────────────
  // 2) Truco para capturar autocompletado con setTimeout
  // ───────────────────────────────────────────────────────────
  useEffect(() => {
    const timerId = setTimeout(() => {
      const maybeEmail = (document.getElementById('login-email') as HTMLInputElement)?.value;
      const maybePassword = (document.getElementById('login-password') as HTMLInputElement)?.value;

      if (maybeEmail && !email) {
        console.log('[AutoComplete] email =', maybeEmail);
        setEmail(maybeEmail);
      }
      if (maybePassword && !password) {
        console.log('[AutoComplete] password =', maybePassword);
        setPassword(maybePassword);
      }
    }, 150);

    return () => clearTimeout(timerId);
  }, [email, password]);

  // ───────────────────────────────────────────────────────────
  // 3) handleLogin => llama a login() del AuthProvider
  // ───────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleLogin => email:', email);
    console.log('handleLogin => password:', password);

    // Limpiar error previo
    setLoginError('');
    setLoginLoading(true);

    // login(...) ahora devuelve boolean (true=ok, false=invalid)
    const success = await login(email, password);
    setLoginLoading(false);

    if (!success) {
      // Mostramos un mensaje debajo del botón
      setLoginError('Invalid credentials. Please check your email/password.');
    }
  };

  // ───────────────────────────────────────────────────────────
  // 4) handleRegister => llama /register => luego login()
  // ───────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log('handleRegister => name, company, email, password =>',
      name, company, email, password
    );

    setRegisterLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, company, email, password }),
      });

      if (res.ok) {
        // Auto-login => login(...) retorna boolean
        const success = await login(email, password);
        if (!success) {
          alert('Registration succeeded, but login failed. Try logging in manually.');
        }
      } else {
        alert('Registration failed. Possibly user already exists or invalid data.');
      }
    } catch (error) {
      console.error('Error in handleRegister =>', error);
      alert('Registration error');
    } finally {
      setRegisterLoading(false);
    }
  };

  // ───────────────────────────────────────────────────────────
  // Render principal con NavBar incluido
  // ───────────────────────────────────────────────────────────
  return (
    <>
      {/* NavBar global (siempre visible) */}
      <NavBar />

      <div className="min-h-screen bg-blue-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-8 w-full min-h-screen flex flex-col md:flex-row">

          {/* Columna IZQUIERDA => texto de introducción */}
          <div className="w-full md:w-[60%] flex flex-col justify-center items-start p-8">
            <div className="max-w-xl text-left">
              <h1 className="text-3xl font-bold mb-4">Smart Chatbot</h1>
              <p className="text-lg mb-4">
                Instantly deliver clear, concise answers from your internal knowledge base.
                No more hunting through endless documents.
              </p>
              <ul className="list-disc list-inside text-base space-y-2 mb-4">
                <li>
                  <strong>Time-Saving Efficiency:</strong> Give your team immediate access
                  to critical information in seconds.
                </li>
                <li>
                  <strong>Centralized Knowledge:</strong> Consolidate manuals, guides, and
                  FAQs into one hub.
                </li>
                <li>
                  <strong>24/7 Availability:</strong> Offer instant responses at any hour.
                </li>
              </ul>
            </div>
          </div>

          {/* Columna DERECHA => login/register forms */}
          <div className="w-full md:w-[40%] bg-white flex flex-col justify-center p-8">
            {/* Tabs => Log In / Register */}
            <div className="mb-4 flex space-x-8 border-b pb-2 justify-start">
              <button
                className={`text-lg font-semibold ${
                  tab === 'login' ? 'border-b-2 border-blue-600' : ''
                }`}
                onClick={() => setTab('login')}
              >
                Log In
              </button>
              <button
                className={`text-lg font-semibold ${
                  tab === 'register' ? 'border-b-2 border-blue-600' : ''
                }`}
                onClick={() => setTab('register')}
              >
                Register
              </button>
            </div>

            {/* Formulario de LOGIN */}
            {tab === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <input
                  id="login-email"
                  name="login-email"
                  autoComplete="username"
                  className="border w-full p-2"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  id="login-password"
                  name="login-password"
                  type="password"
                  autoComplete="current-password"
                  className="border w-full p-2"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="submit"
                  disabled={loginLoading}
                  className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {loginLoading ? 'Loading...' : 'Log In'}
                </button>

                {/* Error debajo del botón */}
                {loginError && (
                  <p className="text-red-600 text-sm mt-2">{loginError}</p>
                )}
              </form>
            )}

            {/* Formulario de REGISTER */}
            {tab === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <input
                  className="border w-full p-2"
                  placeholder="Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  className="border w-full p-2"
                  placeholder="Company"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
                <input
                  id="register-email"
                  className="border w-full p-2"
                  placeholder="Email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <input
                  id="register-password"
                  className="border w-full p-2"
                  type="password"
                  placeholder="Password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />

                <button
                  type="submit"
                  disabled={registerLoading}
                  className="w-full bg-green-600 text-white p-2 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {registerLoading ? 'Registering...' : 'Register'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

