// components/AdminLayout.tsx

import React, { useEffect, useState } from 'react';
import NavBar from './NavBar';
import Sidebar from './Sidebar';

interface AdminLayoutProps {
  children: React.ReactNode;
  // ⚠️ Permitir también null en userRole para que sea compatible con (string | null)
  userRole?: string | null;
  activeMenu?: string;
}

export default function AdminLayout({
  children,
  userRole,
  activeMenu,
}: AdminLayoutProps) {
  // ============= 1) Estados para hamburger y responsive =============
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPortrait, setIsPortrait] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    // Detectar orientación (portrait vs. landscape)
    const mql = window.matchMedia('(orientation: portrait)');
    setIsPortrait(mql.matches);

    const handleOrientationChange = (e: MediaQueryListEvent) => {
      setIsPortrait(e.matches);
    };
    mql.addEventListener('change', handleOrientationChange);

    return () => {
      mql.removeEventListener('change', handleOrientationChange);
    };
  }, []);

  useEffect(() => {
    // Detectar si ancho < 768 (para modo mobile)
    const checkWidth = () => {
      setIsSmallScreen(window.innerWidth < 768);
    };
    checkWidth();
    window.addEventListener('resize', checkWidth);

    return () => {
      window.removeEventListener('resize', checkWidth);
    };
  }, []);

  // Determinamos si debemos mostrar el "hamburger" en base a portrait/small-screen
  const shouldShowHamburger = isPortrait || isSmallScreen;

  // ============= 2) Layout principal =============
  return (
    <div className="h-screen w-full flex flex-col">
      {/* Barra superior (NavBar): altura fija de 4rem (h-16) */}
      <div className="h-16 flex-shrink-0 border-b z-50">
        <NavBar />
      </div>

      {/**
       * Contenedor principal:
       *  - flex => organiza horizontalmente (sidebar + contenido)
       *  - flex-1 => ocupa el resto del espacio vertical
       *  - min-h-0 => para que los hijos con overflow-auto funcionen
       */}
      <div className="flex flex-1 min-h-0 relative">
        {/* 3) SIDEBAR en desktop (no hamburger) */}
        {!shouldShowHamburger && (
          <div className="w-64 border-r flex-shrink-0">
            <Sidebar
              userRole={userRole}
              activeMenu={activeMenu}
              isSidebarOpen={false}
              setIsSidebarOpen={() => null}
              isPortrait={false}
              isSmallScreen={false}
            />
          </div>
        )}

        {/**
         * 4) SIDEBAR en mobile:
         *    Aparece si shouldShowHamburger === true y isSidebarOpen === true
         */}
        {shouldShowHamburger && isSidebarOpen && (
          <>
            {/* Backdrop oscuro, cierra el sidebar al hacer clic */}
            <div
              className="fixed inset-0 top-16 bg-black bg-opacity-50 z-40"
              onClick={() => setIsSidebarOpen(false)}
            />
            {/* Panel lateral con el sidebar */}
            <div className="absolute top-16 left-0 w-64 h-[calc(100vh-4rem)] z-50 border-r bg-white shadow-md overflow-y-auto">
              <Sidebar
                userRole={userRole}
                activeMenu={activeMenu}
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
                isPortrait={isPortrait}
                isSmallScreen={isSmallScreen}
              />
            </div>
          </>
        )}

        {/**
         * 5) Botón hamburger => solo se muestra si (shouldShowHamburger && !isSidebarOpen)
         */}
        {shouldShowHamburger && !isSidebarOpen && (
          <button
            className="absolute top-4 left-4 z-50 bg-white p-2 rounded shadow
                       text-gray-700 hover:text-gray-900 focus:outline-none"
            onClick={() => setIsSidebarOpen(true)}
          >
            <svg className="h-6 w-6" stroke="currentColor" fill="none" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        )}

        {/**
         * 6) Área de contenido principal => children
         *    flex-1 => consume resto del ancho horizontal
         */}
        <main className="flex-1 min-h-0 flex flex-col">
          {children}
        </main>
      </div>
    </div>
  );
}

