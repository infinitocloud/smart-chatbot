// components/Sidebar.tsx

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

interface SidebarProps {
  isPortrait: boolean;
  isSmallScreen: boolean;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  userRole?: string | null; // 'admin' u otro
}

export default function Sidebar({
  isPortrait,
  isSmallScreen,
  isSidebarOpen,
  setIsSidebarOpen,
  userRole
}: SidebarProps) {
  // ====== Evitar "no-unused-vars" ======
  // Con 'void' indicamos que estamos "usando" estas variables,
  // pero no hacemos nada con ellas. Así no salta el warning.
  void isPortrait;
  void isSmallScreen;
  void isSidebarOpen;

  const router = useRouter();
  const isAdmin = (userRole === 'admin');

  function isActiveRoute(path: string) {
    return router.pathname === path;
  }

  function MenuItem({
    href,
    iconClass,
    label,
  }: {
    href: string;
    iconClass: string;
    label: string;
  }) {
    const active = isActiveRoute(href);
    const baseClasses = 'flex items-center space-x-2 p-2 rounded-md text-base';
    const textColor = 'text-gray-700 hover:text-gray-900';
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

        {/* Solo si el usuario es admin */}
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

