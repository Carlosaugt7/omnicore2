import {
  LayoutDashboard, Users, Server, DollarSign, Bell,
  MonitorSmartphone, Settings, LogOut, Zap, Gift, Megaphone,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";

const mainNav = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Clientes", url: "/dashboard/clients", icon: Users },
  { title: "Serviços", url: "/dashboard/services", icon: Server },
  { title: "Financeiro", url: "/dashboard/financial", icon: DollarSign },
  { title: "Lembretes", url: "/dashboard/reminders", icon: Bell },
  { title: "Aviso Geral", url: "/dashboard/broadcast", icon: Megaphone },
  { title: "MAC Address", url: "/dashboard/mac-addresses", icon: MonitorSmartphone },
  { title: "Indicações", url: "/dashboard/referrals", icon: Gift },
];

const bottomNav = [
  { title: "Configurações", url: "/dashboard/settings", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { user, signOut } = useAuth();

  const initials = user?.email?.slice(0, 2).toUpperCase() || "U";

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <Zap className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <span className="text-lg font-bold text-sidebar-foreground">OmniCore</span>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={
                      item.url === "/dashboard"
                        ? location.pathname === "/dashboard"
                        : location.pathname.startsWith(item.url)
                    }
                    tooltip={item.title}
                  >
                    <NavLink to={item.url} end={item.url === "/dashboard"}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto">
        <Separator className="bg-sidebar-border" />
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {bottomNav.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location.pathname.startsWith(item.url)}
                    tooltip={item.title}
                  >
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Sair" onClick={signOut}>
                  <LogOut className="h-4 w-4" />
                  <span>Sair</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <Separator className="bg-sidebar-border" />
        <div className="p-2">
          <div className="flex items-center gap-2 rounded-md p-2">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-sidebar-foreground truncate">
                  {user?.email || 'Usuário'}
                </p>
              </div>
            )}
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
