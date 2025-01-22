// components/Sidebar.tsx

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface SidebarProps {
  isPortrait: boolean;
  isSmallScreen: boolean;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  userRole?: string | null;  // 'admin' o usuario normal
}

export default function Sidebar({
  isPortrait,
  isSmallScreen,
  isSidebarOpen,
  setIsSidebarOpen,
  userRole
}: SidebarProps) {

  const router = useRouter();

  const isAdmin = (userRole === 'admin');

  // Esta función decide si un link está activo comparando rutas
  function isActiveRoute(path: string) {
    return router.pathname === path;
    // O, si tienes rutas anidadas, podrías usar:
    // return router.pathname.startsWith(path);
  }

  // Componente de item
  function MenuItem({
    href,
    iconClass,
    label,
  }: {
    href: string;
    iconClass: string;
    label: string;
  }) {
    // Si la ruta actual es href => “activo”
    const active = isActiveRoute(href);

    // Clases base
    const baseClasses = 'flex items-center space-x-2 p-2 rounded-md text-base';
    const textColor = 'text-gray-700 hover:text-gray-900';
    // Si está activo => fondo gris clarito y font semibold
    const bgColor = active ? 'bg-gray-200 font-semibold' : '';

    return (
      <Link
        href={href}
        onClick={() => setIsSidebarOpen(false)}
        className={`${baseClasses} ${textColor} ${bgColor}`}
      >
        <i className={`${iconClass} fa-fw`} />
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <aside className="h-full bg-white border-r shadow flex flex-col">
      <nav className="pt-2 pb-4 px-2 space-y-2">
        {/* Smart Chatbot => siempre */}
        <MenuItem
          href="/smart-chatbot"
          iconClass="fa-solid fa-robot"
          label="Smart Chatbot"
        />

        {/* Solo si usuario es admin */}
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
  );
}

