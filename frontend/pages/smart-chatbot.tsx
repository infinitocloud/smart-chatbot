// pages/smart-chatbot.tsx

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useRouter } from 'next/router';
import AdminLayout from '../components/AdminLayout';
import { myFetch } from '../utils/myFetch'; // tu helper de fetch

type Message =
  | { role: 'user'; text: string }
  | { role: 'bot'; text: string };

interface QuickChatButton {
  buttonName: string;
}

export default function ChatPage() {
  const { token, role } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  // Manejo de Quick Chat Buttons
  const [quickChatButtons, setQuickChatButtons] = useState<QuickChatButton[]>([]);
  const [qcbLoading, setQcbLoading] = useState(true); // ← para saber si aún se están cargando

  // Referencias para scroll
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // 1) Scroll automático al final cada vez que cambian `messages` o `isSending`
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, isSending]);

  // 2) Redirigir a login si no hay token
  useEffect(() => {
    if (!token) {
      router.push('/');
    }
  }, [token, router]);

  // 3) Cargar QuickChatButtons una sola vez al montar
  useEffect(() => {
    if (!token) return;
    fetchQuickChatButtons();
  }, [token]);

  async function fetchQuickChatButtons() {
    setQcbLoading(true); // empezamos la carga
    const result = await myFetch('/admin/quick-chat-buttons', { method: 'GET' });
    setQcbLoading(false); // terminamos la carga

    if (result.status === 'error') {
      // Si hubo un 401/403, myFetch ya hizo logout + alert
      console.log('QuickChatButtons error:', result.message);
      return;
    }

    // status:'ok'
    if (Array.isArray(result.data)) {
      setQuickChatButtons(result.data);
    }
  }

  // 4) Mostrar el botón “↓” si el usuario se aleja del final
  function handleScroll() {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const pos = el.scrollTop + el.clientHeight;
    const height = el.scrollHeight;
    const nearBottom = (height - pos) <= 200;
    setShowScrollDown(!nearBottom);
  }

  // 5) Listener de scroll
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // 6) Bajar manualmente
  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }

  // 7) Enviar userInput => llama a myFetch
  const sendMessage = async () => {
    if (!userInput.trim() || isSending) return;
    setIsSending(true);

    // Añadimos mensaje del usuario
    const userMsg: Message = { role: 'user', text: userInput };
    setMessages((prev) => [...prev, userMsg]);
    setUserInput('');

    // Llamada con myFetch
    const result = await myFetch('/api/smart-chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPrompt: userMsg.text }),
    });

    if (result.status === 'error') {
      console.log('sendMessage => error:', result.message);
      setIsSending(false);
      return;
    }

    // Éxito
    // <-- CAMBIO: usamos 'const finalText' en una sola línea
    const finalText = (result.data.assistantContent || '(No rawResponse)').trim();
    setMessages((prev) => [...prev, { role: 'bot', text: finalText }]);
    setIsSending(false);
  };

  // 8) Botón rápido => userPrompt = btn.buttonName
  const handleQuickButtonClick = async (btn: QuickChatButton) => {
    if (isSending) return;

    const userMsg: Message = { role: 'user', text: btn.buttonName };
    setMessages((prev) => [...prev, userMsg]);
    setIsSending(true);

    const result = await myFetch('/api/smart-chatbot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userPrompt: btn.buttonName }),
    });

    if (result.status === 'error') {
      console.log('quickButton => error:', result.message);
      setIsSending(false);
      return;
    }

    // <-- CAMBIO: lo mismo aquí
    const finalText = (result.data.assistantContent || '(No rawResponse)').trim();
    setMessages((prev) => [...prev, { role: 'bot', text: finalText }]);
    setIsSending(false);
  };

  // 9) Enter => enviar
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isSending) {
      sendMessage();
    }
  };

  // Render principal
  const hasMessages = messages.length > 0;

  return (
    <AdminLayout userRole={role} activeMenu="Smart Chatbot">
      <div className="flex flex-col h-full w-full">
        {/* Contenedor scrolleable */}
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-auto flex flex-col items-center"
        >
          <div className="w-full max-w-3xl flex flex-col flex-1">
            {!hasMessages ? (
              // ================== MODO SIN MENSAJES ==================
              <div className="flex-1 flex flex-col items-center justify-center p-4">
                <h1 className="text-3xl font-bold text-center mb-6">
                  How can I help you?
                </h1>
                <div className="w-full max-w-2xl">
                  <div className="relative flex items-center mb-4">
                    <input
                      className="flex-1 bg-gray-50 border border-gray-300 rounded-full px-4 py-3
                                 focus:outline-none text-gray-700 placeholder-gray-400 pr-16"
                      type="text"
                      placeholder="Send your question"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={isSending}
                      className="bg-gray-200 hover:bg-gray-300 rounded-full w-10 h-10 flex items-center
                                 justify-center focus:outline-none text-gray-700 absolute right-2 disabled:opacity-50"
                    >
                      <i className="fa-solid fa-arrow-up"></i>
                    </button>
                  </div>

                  {!qcbLoading && quickChatButtons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 justify-center">
                      {quickChatButtons.map((btn, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleQuickButtonClick(btn)}
                          className="px-3 py-1 rounded bg-gray-200 text-gray-800 hover:bg-gray-300
                                     focus:outline-none focus:ring-2 focus:ring-gray-400"
                        >
                          {btn.buttonName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // ============== MODO CON MENSAJES ==============
              <>
                <div className="p-4 space-y-4 flex-1 overflow-auto">
                  {messages.map((msg, i) => {
                    const isUser = msg.role === 'user';
                    const bubbleAlignment = isUser ? 'justify-end' : 'justify-start';
                    const bubbleStyle = isUser
                      ? 'bg-gray-200 text-right max-w-xl'
                      : 'bg-white text-left w-full';

                    return (
                      <div key={i} className={`flex w-full ${bubbleAlignment}`}>
                        <div
                          className={`${bubbleStyle} p-3 rounded-lg whitespace-pre-wrap text-gray-800`}
                        >
                          {msg.text}
                        </div>
                      </div>
                    );
                  })}

                  {isSending && (
                    <div className="flex flex-col items-center text-gray-600">
                      <div className="mb-1">Processing...</div>
                      <div className="flex items-center space-x-1">
                        <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" />
                        <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Barra de input al fondo */}
                <div className="shrink-0 p-2 bg-white pb-14 md:pb-4">
                  <div className="relative flex items-center">
                    <input
                      className="flex-1 bg-gray-50 border border-gray-300 rounded-full px-4 py-3
                                 focus:outline-none text-gray-700 placeholder-gray-400 pr-16"
                      type="text"
                      placeholder="Send your question"
                      value={userInput}
                      onChange={(e) => setUserInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={isSending}
                      className="bg-gray-200 hover:bg-gray-300 rounded-full w-10 h-10 flex items-center
                                 justify-center focus:outline-none text-gray-700 absolute right-2 disabled:opacity-50"
                    >
                      <i className="fa-solid fa-arrow-up"></i>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Botón flotante “↓” => si showScrollDown es true */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          title="Scroll to bottom"
          className="
            fixed
            bottom-4
            left-1/2
            transform -translate-x-1/2
            bg-gray-100 hover:bg-gray-200
            text-gray-700
            border border-gray-300
            rounded-full
            w-10 h-10
            flex items-center
            justify-center
            z-50
          "
        >
          <i className="fa-solid fa-arrow-down"></i>
        </button>
      )}
    </AdminLayout>
  );
}

