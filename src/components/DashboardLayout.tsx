import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, useLocation } from "react-router-dom";
import { Bell, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const breadcrumbMap: Record<string, string> = {
  dashboard: "Dashboard",
  agents: "Agentes",
  new: "Novo",
  edit: "Editar",
  clients: "Clientes",
  knowledge: "Conhecimento",
  conversations: "Conversas",
  analytics: "Analytics",
  settings: "Configurações",
  billing: "Assinatura",
};

export function DashboardLayout() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center justify-between border-b bg-background px-4 shrink-0">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="text-muted-foreground" />
              <nav className="flex items-center text-sm text-muted-foreground">
                {segments.map((seg, i) => (
                  <span key={i} className="flex items-center">
                    {i > 0 && <ChevronRight className="h-3.5 w-3.5 mx-1" />}
                    <span className={i === segments.length - 1 ? "text-foreground font-medium" : ""}>
                      {breadcrumbMap[seg] || seg}
                    </span>
                  </span>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="text-muted-foreground">
                <Bell className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
