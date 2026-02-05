"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  Globe,
  Rocket,
  Settings,
  Plus,
  Container,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  {
    title: "サイト一覧",
    href: "/",
    icon: Globe,
  },
  {
    title: "コンテナ",
    href: "/containers",
    icon: Container,
  },
  {
    title: "デプロイ",
    href: "/deploy",
    icon: Rocket,
  },
  {
    title: "設定",
    href: "/settings",
    icon: Settings,
  },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg">
          <Globe className="w-5 h-5" />
          wp-tether
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>メニュー</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={pathname === item.href}>
                    <Link href={item.href}>
                      <item.icon className="w-4 h-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <Button className="w-full" size="sm" asChild>
          <Link href="/sites/new">
            <Plus className="w-4 h-4 mr-2" />
            新規サイト作成
          </Link>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
