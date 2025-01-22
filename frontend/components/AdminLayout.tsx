// components/AdminLayout.tsx

import React, { useState, useEffect } from 'react';
import NavBar from './NavBar';
import Sidebar from './Sidebar';
import { useAuth } from './AuthProvider';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { token, role } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSmallScreen, setIsSmallScreen] = useState(false);

  useEffect(() => {
    function handleResize() {
      setIsSmallScreen(window.innerWidth < 768);
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Pantalla Loading si no hay token/role
  if (!token || role === null) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="text-gray-600">Loading authentication...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-x-hidden flex flex-col">
      {/* Barra superior */}
      <div className="h-16 flex-shrink-0 border-b z-50">
        <NavBar />
      </div>

      {/**
       * Si estamos en mobile y sidebar está cerrado,
       * mostramos el botón hamburger en un contenedor *debajo* de la navbar.
       */}
      {isSmallScreen && !isSidebarOpen && (
        <div className="border-b px-4 py-2">
          <button
            className="bg-white p-2 rounded shadow text-gray-700 hover:text-gray-900 focus:outline-none"
            onClick={() => setIsSidebarOpen(true)}
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path 
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Contenedor principal => (sidebar + contenido) */}
      <div className="flex flex-1 min-h-0 relative min-w-0">
        {/* Desktop => sidebar fijo */}
        {!isSmallScreen && (
          <div className="w-64 border-r flex-shrink-0">
            <Sidebar
              isSidebarOpen={false}
              setIsSidebarOpen={() => null}
              isPortrait={false}
              isSmallScreen={false}
              userRole={role}
            />
          </div>
        )}

        {/* Mobile => overlay */}
        {isSmallScreen && (
          <>
            <div
              className={`
                fixed top-[4rem] left-0 h-[calc(100vh-4rem)] w-64
                bg-white border-r z-[9999] shadow transform
                transition-transform duration-200 ease-in-out
                ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
              `}
            >
              <Sidebar
                isSidebarOpen={isSidebarOpen}
                setIsSidebarOpen={setIsSidebarOpen}
                isPortrait={false}
                isSmallScreen={true}
                userRole={role}
              />
            </div>
            {/* Backdrop => cierra overlay al hacer click */}
            {isSidebarOpen && (
              <div
                className="fixed inset-0 top-[4rem] bg-black bg-opacity-50 z-[9998]"
                onClick={() => setIsSidebarOpen(false)}
              />
            )}
          </>
        )}

        {/* Contenido principal => min-w-0 para ajustarse */}
        <main className="flex-1 min-h-0 flex flex-col min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}

