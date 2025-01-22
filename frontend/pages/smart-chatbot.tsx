// pages/smart-chatbot.tsx

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../components/AuthProvider';
import { useRouter } from 'next/router';
import AdminLayout from '../components/AdminLayout';
import { myFetch } from '../utils/myFetch';

// ==================== CAMBIO AQUÍ: Ambas variantes pueden tener `feedback` ====================
type Message =
  | { role: 'user'; text: string; copied?: boolean; feedback?: 'like' | 'dislike' }
  | { role: 'bot'; text: string; copied?: boolean; id?: string; feedback?: 'like' | 'dislike' };

interface QuickChatButton {
  buttonName: string;
}

export default function SmartChatbotPage() {
  const { token } = useAuth();
  const router = useRouter();

  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [quickChatButtons, setQuickChatButtons] = useState<QuickChatButton[]>([]);
  const [qcbLoading, setQcbLoading] = useState(true);

  // Refs para scroll del chat
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // “More” => carrusel 2 filas
  const [isExpanded, setIsExpanded] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  // Scroll del carrusel
  const scrollLeft = () => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollLeft -= 200;
  };
  const scrollRight = () => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollLeft += 200;
  };

  // Redirigir si no hay token
  useEffect(() => {
    if (!token) {
      router.push('/');
    }
  }, [token, router]);

  // Cargar QuickChatButtons
  useEffect(() => {
    if (!token) return;
    fetchQuickChatButtons();
  }, [token]);

  async function fetchQuickChatButtons() {
    setQcbLoading(true);
    const result = await myFetch('/admin/quick-chat-buttons', { method: 'GET' });
    setQcbLoading(false);

    if (result.status === 'error') {
      console.log('QuickChatButtons error:', result.message);
      return;
    }
    if (Array.isArray(result.data)) {
      setQuickChatButtons(result.data);
    }
  }

  // Scroll en el contenedor principal
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => {
      el.removeEventListener('scroll', handleScroll);
    };
  }, []);

  function handleScroll() {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const pos = el.scrollTop + el.clientHeight;
    const height = el.scrollHeight;
    const nearBottom = (height - pos) <= 200;
    setShowScrollDown(!nearBottom);
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }

  // Auto-scroll cuando cambian messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, isSending]);

  // =========== Enviar un mensaje ===========
  const sendMessage = async () => {
    if (!userInput.trim() || isSending) return;
    setIsSending(true);

    const userMsg: Message = { role: 'user', text: userInput };
    setMessages((prev) => [...prev, userMsg]);
    setUserInput('');

    // Llamada al backend
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

    // Capturar texto final
    const finalText = (result.data.assistantContent || '(No rawResponse)').trim();
    const usageLogId = result.data.usageLogId;

    const newBotMsg: Message = { role: 'bot', text: finalText };
    if (usageLogId) {
      newBotMsg.id = String(usageLogId);
    }

    setMessages((prev) => [...prev, newBotMsg]);
    setIsSending(false);
  };

  // =========== Quick Chat => userPrompt ===========
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

    const finalText = (result.data.assistantContent || '(No rawResponse)').trim();
    const usageLogId = result.data.usageLogId;

    const newBotMsg: Message = { role: 'bot', text: finalText };
    if (usageLogId) {
      newBotMsg.id = String(usageLogId);
    }

    setMessages((prev) => [...prev, newBotMsg]);
    setIsSending(false);
  };

  // =========== Enter => enviar ===========
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isSending) {
      sendMessage();
    }
  };

  // =========== Copiar con fallback ===========
  function copyToClipboard(msg: Message, index: number) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(msg.text)
        .then(() => {
          console.log('Copied (modern):', msg.text);
          markAsCopied(index);
        })
        .catch((err) => {
          console.error('Clipboard API error:', err);
          fallbackCopy(msg.text, index);
        });
    } else {
      fallbackCopy(msg.text, index);
    }
  }

  function fallbackCopy(text: string, index: number) {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-9999px';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      console.log('Copied (fallback):', text);
      markAsCopied(index);
    } catch (err) {
      console.error('fallbackCopy => error:', err);
    }
  }

  function markAsCopied(i: number) {
    setMessages((prev) => {
      const newArr = [...prev];
      newArr[i] = { ...newArr[i], copied: true };
      return newArr;
    });
  }

  // =========== Like / Dislike => feedback ===========
  async function handleLike(botMsg: Message, index: number) {
    console.log('Like =>', botMsg.text);

    // Chequeamos si es un botMsg con id (para mandar al backend),
    // pero en ambos casos, a nivel de TypeScript, se permite set feedback.
    if (botMsg.role !== 'bot' || !botMsg.id) {
      console.log('No usageLogId => ignoring Like');
      return;
    }

    try {
      const usageLogId = botMsg.id;
      const feedbackResult = await myFetch('/api/smart-chatbot/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usageLogId,
          feedback: 'like',
        }),
      });
      console.log('Like => feedbackResult:', feedbackResult);

      // Marcamos feedback='like' localmente
      setMessages((prev) => {
        const newArr = [...prev];
        const oldMsg = newArr[index];
        newArr[index] = { ...oldMsg, feedback: 'like' };
        return newArr;
      });

    } catch (error) {
      console.error('Like => error:', error);
    }
  }

  async function handleDislike(botMsg: Message, index: number) {
    console.log('Dislike =>', botMsg.text);

    // Igual que en handleLike, verificamos si es “bot”
    if (botMsg.role !== 'bot' || !botMsg.id) {
      console.log('No usageLogId => ignoring Dislike');
      return;
    }

    try {
      const usageLogId = botMsg.id;
      const feedbackResult = await myFetch('/api/smart-chatbot/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usageLogId,
          feedback: 'dislike',
        }),
      });
      console.log('Dislike => feedbackResult:', feedbackResult);

      // Marcamos feedback='dislike'
      setMessages((prev) => {
        const newArr = [...prev];
        const oldMsg = newArr[index];
        newArr[index] = { ...oldMsg, feedback: 'dislike' };
        return newArr;
      });

    } catch (error) {
      console.error('Dislike => error:', error);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    <AdminLayout>
      <div className="flex flex-col h-full w-full overflow-x-hidden">
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-auto flex flex-col items-center"
        >
          <div className="w-full max-w-3xl flex flex-col flex-1">
            {!hasMessages ? (
              // ====================== MODO SIN MENSAJES ======================
              <div className="flex-1 flex flex-col items-center justify-center p-4">
                <h1 className="text-3xl font-bold text-center mb-6">
                  How can I help you?
                </h1>
                <div className="w-full max-w-2xl">
                  {/* Input */}
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

                  {/* Quick Chat Buttons => sin mensajes */}
                  {!qcbLoading && quickChatButtons.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2 justify-center">
                      {quickChatButtons.map((btn, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleQuickButtonClick(btn)}
                          className="
                            px-3 py-1
                            rounded bg-gray-200 text-gray-800 hover:bg-gray-300
                            focus:outline-none focus:ring-2 focus:ring-gray-400
                            whitespace-normal break-words text-sm
                          "
                        >
                          {btn.buttonName}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // ====================== MODO CON MENSAJES ======================
              <>
                <div className="p-4 space-y-4 flex-1 overflow-auto w-full">
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
                          {/* Texto del mensaje */}
                          {msg.text}

                          {/* Bot => 3 botones => solo si es bot */}
                          {!isUser && (
                            <div className="flex items-center gap-2 mt-2 text-sm text-gray-600">
                              {/* Copy => ícono copy / check */}
                              <button
                                onClick={() => copyToClipboard(msg, i)}
                                className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                              >
                                {msg.copied
                                  ? <i className="fa-solid fa-check"></i>
                                  : <i className="fa-solid fa-copy"></i>
                                }
                              </button>

                              {/* Like => thumbs-up (colorear si feedback='like') */}
                              <button
                                onClick={() => handleLike(msg, i)}
                                className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                              >
                                <i
                                  className="fa-solid fa-thumbs-up"
                                  style={{
                                    color: msg.feedback === 'like' ? '#3B82F6' : 'inherit'
                                  }}
                                />
                              </button>

                              {/* Dislike => thumbs-down (colorear si feedback='dislike') */}
                              <button
                                onClick={() => handleDislike(msg, i)}
                                className="px-2 py-1 bg-gray-100 rounded hover:bg-gray-200"
                              >
                                <i
                                  className="fa-solid fa-thumbs-down"
                                  style={{
                                    color: msg.feedback === 'dislike' ? '#dc3545' : 'inherit'
                                  }}
                                />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Indicador de “isSending” */}
                  {isSending && (
                    <div className="flex flex-col items-center text-gray-600">
                      <div className="mb-1">Thinking...</div>
                      <div className="flex items-center space-x-1">
                        <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce" />
                        <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0.2s]" />
                        <div className="h-2 w-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0.4s]" />
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Barra inferior => carrusel de 2 filas + input */}
                <div className="shrink-0 p-2 bg-white pb-14 md:pb-4 w-full">
                  {!qcbLoading && quickChatButtons.length > 0 && (
                    <div className="mb-2">
                      {/* Botón More / Hide */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => setIsExpanded(!isExpanded)}
                          className="px-3 py-2 bg-blue-500 text-white rounded"
                        >
                          {isExpanded ? 'Hide' : 'More'}
                        </button>
                      </div>

                      {isExpanded && (
                        <div className="relative mt-3 w-full box-border overflow-hidden">
                          {/* Flecha Izquierda */}
                          <button
                            onClick={scrollLeft}
                            className="
                              absolute left-2 top-1/2 -translate-y-1/2 z-10
                              bg-gray-300 hover:bg-gray-400
                              rounded-full w-10 h-10
                              flex items-center justify-center
                            "
                          >
                            <i className="fa-solid fa-chevron-left"></i>
                          </button>

                          {/* Flecha Derecha */}
                          <button
                            onClick={scrollRight}
                            className="
                              absolute right-2 top-1/2 -translate-y-1/2 z-10
                              bg-gray-300 hover:bg-gray-400
                              rounded-full w-10 h-10
                              flex items-center justify-center
                            "
                          >
                            <i className="fa-solid fa-chevron-right"></i>
                          </button>

                          {/* 2 filas con scroll horizontal */}
                          <div
                            ref={carouselRef}
                            className="w-full overflow-x-auto px-2"
                            style={{ scrollBehavior: 'smooth' }}
                          >
                            <div className="grid grid-rows-2 grid-flow-col gap-2 py-2">
                              {quickChatButtons.map((btn, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => handleQuickButtonClick(btn)}
                                  className="
                                    px-3 py-2
                                    rounded bg-gray-200 text-gray-800
                                    hover:bg-gray-300 focus:outline-none
                                    focus:ring-2 focus:ring-gray-400
                                    whitespace-nowrap
                                  "
                                >
                                  {btn.buttonName}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Input */}
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

      {/* Botón flotante “Scroll to bottom” */}
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

