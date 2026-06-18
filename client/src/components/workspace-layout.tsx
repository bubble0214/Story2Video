'use client';

import { Sidebar } from '@/features/workspace/sidebar';

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Left Sidebar */}
      <aside className="w-56 shrink-0 border-r bg-background hidden md:flex flex-col">
        <Sidebar />
      </aside>

      {/* Main Workspace */}
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
