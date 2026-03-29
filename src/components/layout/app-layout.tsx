
"use client";
import type React from 'react';
import { Sidebar, SidebarInset } from "@/components/ui/sidebar"; 
import { AppSidebarContent } from "./app-sidebar-content";
import { AppHeaderContent } from "./app-header-content";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-x-hidden"> {/* Fix: h-screen instead of min-h-screen for internal scroll */}
      <Sidebar variant="sidebar" collapsible="icon">
        <AppSidebarContent />
      </Sidebar>
      <SidebarInset className="flex flex-col h-full"> 
        <AppHeaderContent />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pt-6 md:p-6 pb-[calc(1.5rem+var(--safe-area-bottom))]"> {/* Added gap for bottom bar */}
          {children}
        </main>
      </SidebarInset>
    </div>
  );
}
