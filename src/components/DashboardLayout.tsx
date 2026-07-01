import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Outlet, useLocation } from "react-router-dom";
import { ChevronRight } from "lucide-react";

const breadcrumbMap: Record<string, string> = {
  dashboard: "Dashboard",
  clients: "Clientes",
  services: "Serviços",
  financial: "Financeiro",
  reminders: "Lembretes",
  "mac-addresses": "MAC Address",
  referrals: "Indicações",
  settings: "Configurações",
};

export function DashboardLayout() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 flex items-center border-b bg-background px-4 shrink-0">
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
          </header>
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
