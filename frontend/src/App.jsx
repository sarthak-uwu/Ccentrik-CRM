import React, { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

// Auth pages (eager load)
import Login from "./pages/Auth/Login";
import ForgotPassword from "./pages/Auth/ForgotPassword";
import ResetPassword from "./pages/Auth/ResetPassword";

// Layout
import Layout from "./components/layout/Layout";

// CRM Pages (lazy loaded)
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leads = lazy(() => import("./pages/Leads"));
const Deals = lazy(() => import("./pages/Deals"));
const Customers = lazy(() => import("./pages/Customers"));
const Tasks = lazy(() => import("./pages/Tasks"));
const Meetings = lazy(() => import("./pages/Meetings"));
const Chat = lazy(() => import("./pages/Chat"));
const Team = lazy(() => import("./pages/Team"));
const Settings = lazy(() => import("./pages/Settings"));
const Activities = lazy(() => import("./pages/Activities"));
const Reports = lazy(() => import("./pages/Reports"));
const AIAssistant = lazy(() => import("./pages/AIAssistant"));

const PageLoader = () => (
  <div className="flex items-center justify-center h-full min-h-100">
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-10 h-10">
        <div className="w-10 h-10 rounded-full border-[3px] border-indigo-100 border-t-indigo-500 animate-spin" />
      </div>
      <p className="text-slate-400 text-xs font-medium">Loading...</p>
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/dashboard" replace /> : children;
};

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 3500,
              style: {
                borderRadius: "10px",
                fontSize: "13.5px",
                fontFamily: "Inter, sans-serif",
                background: "var(--surface)",
                color: "var(--text)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-lg)",
              },
            }}
          />
          <Routes>
            {/* Auth */}
            <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
            <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
            <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />

            {/* CRM — all wrapped in Layout */}
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="dashboard" element={<Dashboard />} />
                        <Route path="leads" element={<Leads />} />
                        <Route path="deals" element={<Deals />} />
                        <Route path="customers" element={<Customers />} />
                        <Route path="tasks" element={<Tasks />} />
                        <Route path="meetings" element={<Meetings />} />
                        <Route path="chat" element={<Chat />} />
                        <Route path="analytics" element={<Navigate to="/reports" replace />} />
                        <Route path="team" element={<Team />} />
                        <Route path="settings" element={<Settings />} />
                        <Route path="activities" element={<Activities />} />
                        <Route path="reports" element={<Reports />} />
                        <Route path="ai-assistant" element={<AIAssistant />} />
                        <Route path="*" element={<Navigate to="dashboard" replace />} />
                      </Routes>
                    </Suspense>
                  </Layout>
                </ProtectedRoute>
              }
            />

            <Route path="/" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
