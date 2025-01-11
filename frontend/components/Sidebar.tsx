// components/Sidebar.tsx

import React from 'react';
import Link from 'next/link';

interface SidebarProps {
  isPortrait: boolean;
  isSmallScreen: boolean;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  // Permitir también null además de string | undefined
  userRole?: string | null;
  activeMenu?: string;
}

export default function Sidebar({
  isPortrait,
  isSmallScreen,
  isSidebarOpen,
  setIsSidebarOpen,
  userRole,
  activeMenu
}: SidebarProps) {

  // Para verificar si el usuario es administrador
  const isAdmin = userRole === 'admin';

  // Componente para cada ítem del menú
  const MenuItem = ({
    href,
    iconClass,
    label,
    onClick,
  }: {
    href: string;
    iconClass: string;
    label: string;
    onClick?: () => void;
  }) => {
    const isActive = activeMenu === label;
    const baseClasses = 'flex items-center space-x-2 p-2 rounded-md text-base';
    const textColor = 'text-gray-700 hover:text-gray-900';
    // Si está activo, le damos un fondo gris clarito y font semibold
    const bgColor = isActive ? 'bg-gray-200 font-semibold' : '';

    return (
      <Link
        href={href}
        onClick={onClick}
        className={`${baseClasses} ${textColor} ${bgColor}`}
      >
        <i className={`${iconClass} fa-fw`} />
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <>
      {/* SIDEBAR en desktop (sin hamburger) */}
      <aside
        className={`border-r p-4 pt-8 flex-shrink-0 bg-white
          ${!isPortrait && !isSmallScreen ? 'w-64 block' : 'hidden'}
        `}
      >
        <nav className="space-y-2">
          {/* Smart Chatbot para todos los usuarios */}
          <MenuItem
            href="/smart-chatbot"
            iconClass="fa-solid fa-robot"
            label="Smart Chatbot"
          />

          {/* Las secciones siguientes solo las ve un admin */}
          {isAdmin && (
            <>
              <MenuItem
                href="/admin/knowledgebase"
                iconClass="fa-solid fa-book"
                label="Knowledge Base"
              />
              <MenuItem
                href="/admin/monitor"
                iconClass="fa-solid fa-chart-line"
                label="Monitor"
              />
              <MenuItem
                href="/admin/user-management"
                iconClass="fa-solid fa-users"
                label="User Management"
              />
              <MenuItem
                href="/admin/settings"
                iconClass="fa-solid fa-gear"
                label="Settings"
              />
            </>
          )}
        </nav>
      </aside>

      {/* SIDEBAR en mobile => overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 top-16 z-40 bg-black bg-opacity-50 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}
      <aside
        className={`
          fixed inset-y-0 left-0 w-64 bg-white border-r z-50
          transform transition-transform duration-200 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex items-center justify-between mb-4 p-4">
          <button
            onClick={() => setIsSidebarOpen(false)}
            className="text-gray-600 hover:text-gray-800 focus:outline-none"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <nav className="space-y-2 px-4">
          {/* Smart Chatbot visible para todos */}
          <MenuItem
            href="/smart-chatbot"
            iconClass="fa-solid fa-robot"
            label="Smart Chatbot"
            onClick={() => setIsSidebarOpen(false)}
          />

          {/* Resto de menús => solo si es admin */}
          {isAdmin && (
            <>
              <MenuItem
                href="/admin/knowledgebase"
                iconClass="fa-solid fa-book"
                label="Knowledge Base"
                onClick={() => setIsSidebarOpen(false)}
              />
              <MenuItem
                href="/admin/monitor"
                iconClass="fa-solid fa-chart-line"
                label="Monitor"
                onClick={() => setIsSidebarOpen(false)}
              />
              <MenuItem
                href="/admin/user-management"
                iconClass="fa-solid fa-users"
                label="User Management"
                onClick={() => setIsSidebarOpen(false)}
              />
              <MenuItem
                href="/admin/settings"
                iconClass="fa-solid fa-gear"
                label="Settings"
                onClick={() => setIsSidebarOpen(false)}
              />
            </>
          )}
        </nav>
      </aside>
    </>
  );
}

