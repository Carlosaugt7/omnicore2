import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { DashboardLayout } from "@/components/DashboardLayout";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Clients = lazy(() => import("./pages/Clients"));
const Services = lazy(() => import("./pages/Services"));
const Financial = lazy(() => import("./pages/Financial"));
const Reminders = lazy(() => import("./pages/Reminders"));
const Broadcast = lazy(() => import("./pages/Broadcast"));
const MacAddresses = lazy(() => import("./pages/MacAddresses"));
const Referrals = lazy(() => import("./pages/Referrals"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const Resellers = lazy(() => import("./pages/Resellers"));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <Routes>
            <Route path="/" element={<Login />} />
            <Route path="/login" element={<Login />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><Dashboard /></Suspense>} />
              <Route path="clients" element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><Clients /></Suspense>} />
              <Route path="services" element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><Services /></Suspense>} />
              <Route path="financial" element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><Financial /></Suspense>} />
              <Route path="reminders" element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><Reminders /></Suspense>} />
              <Route path="broadcast" element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><Broadcast /></Suspense>} />
              <Route path="mac-addresses" element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><MacAddresses /></Suspense>} />
              <Route path="referrals" element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><Referrals /></Suspense>} />
              <Route path="settings" element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><SettingsPage /></Suspense>} />
              <Route path="resellers" element={<Suspense fallback={<div className="p-8 text-center text-muted-foreground">Carregando...</div>}><Resellers /></Suspense>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
