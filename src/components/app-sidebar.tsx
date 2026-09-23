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
  HelpCircle,
  Server,
  Network,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  {
    title: "サイト一覧",
    href: "/",
    icon: Globe,
  },
  {
    title: "hosts 管理",
    href: "/hosts",
    icon: Network,
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
    title: "サーバー",
    href: "/servers",
    icon: Server,
  },
  {
    title: "設定",
    href: "/settings",
    icon: Settings,
  },
  {
    title: "使い方",
    href: "/help",
    icon: HelpCircle,
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

      <SidebarFooter className="border-t p-4 gap-2">
        <Button className="w-full" size="sm" asChild>
          <Link href="/sites/new">
            <Plus className="w-4 h-4 mr-2" />
            新規サイト作成
          </Link>
        </Button>
        <Button className="w-full" size="sm" variant="outline" asChild>
          <Link href="/servers/new">
            <Plus className="w-4 h-4 mr-2" />
            サーバー追加
          </Link>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
