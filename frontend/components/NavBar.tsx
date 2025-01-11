// components/NavBar.tsx

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from './AuthProvider';
import Image from 'next/image';

export default function NavBar() {
  const { token, logout, userName } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <header className="w-full bg-white border-b relative z-50">
      <div className="px-4 sm:px-6 lg:px-8 flex items-center h-16">

        {/* Left: Logo */}
        <div className="flex-shrink-0">
          {/* 
            Al usar width={0} y height={0} + style, consigues el mismo look que h-8 w-auto
            sin que Next.js se queje ni se rompa la optimización de imágenes.
          */}
          <Image
            src="/logo.svg"
            alt="Logo"
            priority
            width={0}
            height={0}
            style={{ width: 'auto', height: '2rem' }} // ~ h-8
          />
        </div>

        {/* Middle: Navigation Links (desktop) */}
        <div className="flex-1 flex justify-center">
          <nav className="hidden md:flex space-x-10">
            <Link href="/" className="text-gray-700 hover:text-gray-900">
              Home
            </Link>
            <Link href="/how-it-works" className="text-gray-700 hover:text-gray-900">
              How it works?
            </Link>
            <Link href="/contact" className="text-gray-700 hover:text-gray-900">
              Contact
            </Link>
          </nav>
        </div>

        {/* Derecha: usuario y logout (solo en desktop) */}
        {token && (
          <div className="hidden md:flex items-center space-x-4 ml-4">
            {/* Nombre del usuario */}
            <div className="text-gray-700">
              {userName || 'Current User'}
            </div>
            {/* Botón Logout */}
            <button
              onClick={logout}
              className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            >
              Logout
            </button>
          </div>
        )}

        {/* Botón de menú móvil (hamburger) */}
        <div className="flex md:hidden ml-2">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-gray-700 hover:text-gray-900 focus:outline-none"
          >
            <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
              {isOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Menú móvil (Only visible cuando isOpen == true y pantalla chica) */}
      {isOpen && (
        <>
          {/* Overlay debajo de la barra: empieza desde top-16 para no cubrir la barra superior */}
          <div
            className="fixed inset-0 top-16 z-40 bg-black bg-opacity-50"
            onClick={() => setIsOpen(false)}
          ></div>

          <div className="md:hidden bg-white border-t z-50 relative">
            <nav className="px-4 py-4 space-y-2 flex flex-col items-end text-right text-gray-900">
              <Link
                href="/"
                className="hover:text-gray-700"
                onClick={() => setIsOpen(false)}
              >
                Home
              </Link>
              <Link
                href="/how-it-works"
                className="hover:text-gray-700"
                onClick={() => setIsOpen(false)}
              >
                How it works?
              </Link>
              <Link
                href="/contact"
                className="hover:text-gray-700"
                onClick={() => setIsOpen(false)}
              >
                Contact
              </Link>

              {token && (
                <>
                  {/* Nombre del usuario en versión móvil */}
                  <div className="text-gray-700 font-semibold border-t pt-2 mt-2 w-full text-right">
                    {userName || 'Current User'}
                  </div>
                  {/* Botón Logout (móvil) */}
                  <button
                    onClick={() => {
                      logout();
                      setIsOpen(false);
                    }}
                    className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 text-right mt-2"
                  >
                    Logout
                  </button>
                </>
              )}
            </nav>
          </div>
        </>
      )}
    </header>
  );
}

