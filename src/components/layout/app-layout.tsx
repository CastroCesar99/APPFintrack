
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
    <div className="flex flex-1 min-h-[100dvh] w-full flex-col md:flex-row shadow-none">
      <Sidebar variant="sidebar" collapsible="icon">
        <AppSidebarContent />
      </Sidebar>
      <SidebarInset className="flex flex-col flex-1 w-full min-h-[100dvh]">
        <AppHeaderContent />
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 pt-6 md:p-6 pb-6">
          {children}
        </main>
      </SidebarInset>
    </div>
  );
}
