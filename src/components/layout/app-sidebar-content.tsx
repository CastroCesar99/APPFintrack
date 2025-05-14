"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { AppLogoIcon, DashboardIcon, SettingsIcon } from "@/components/icons";
import { cn } from "@/lib/utils";

export function AppSidebarContent() {
  const pathname = usePathname();

  const menuItems = [
    { href: "/", label: "Dashboard", icon: DashboardIcon, exact: true },
    // Add more menu items here if needed, e.g.
    // { href: "/reports", label: "Reports", icon: BarChartIcon },
    // { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  return (
    <>
      <SidebarHeader className="p-4">
        <Link href="/" className="flex items-center gap-2">
          <AppLogoIcon className="h-8 w-8 text-primary" />
          <span className="text-xl font-semibold">FinTrack</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-2">
        <SidebarMenu>
          {menuItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <Link href={item.href} passHref legacyBehavior>
                <SidebarMenuButton
                  asChild
                  isActive={item.exact ? pathname === item.href : pathname.startsWith(item.href)}
                  className="w-full justify-start"
                  tooltip={{ children: item.label, side: "right", align: "center" }}
                >
                  <a>
                    <item.icon className="h-5 w-5" />
                    <span>{item.label}</span>
                  </a>
                </SidebarMenuButton>
              </Link>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="p-4 border-t">
         <Button variant="ghost" className="w-full justify-start gap-2">
            <SettingsIcon className="h-5 w-5" />
            <span>Settings</span>
        </Button>
      </SidebarFooter>
    </>
  );
}
