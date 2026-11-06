import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import "./index.css";
import { ToastProvider, Spinner } from "./components/ui";
import { MeProvider } from "./lib/session";
import { UploadDock } from "./components/UploadDock";
import { SiteFooter } from "./components/SiteFooter";

// Route-level code splitting (skill: --stack react "lazy() for routes and heavy components").
const Landing = lazy(() => import("./routes/Landing"));
const Login = lazy(() => import("./routes/Login"));
const Dashboard = lazy(() => import("./routes/Dashboard"));
const CreateEventWizard = lazy(() => import("./routes/CreateEventWizard"));
const SetupWizard = lazy(() => import("./routes/SetupWizard"));
const EventHome = lazy(() => import("./routes/EventHome"));
const Upload = lazy(() => import("./routes/Upload"));
const Gallery = lazy(() => import("./routes/Gallery"));
const Manage = lazy(() => import("./routes/Manage"));
const AdminLogin = lazy(() => import("./routes/AdminLogin"));
const ShareReceive = lazy(() => import("./routes/ShareReceive"));
const Legal = lazy(() => import("./routes/Legal"));
const NotFound = lazy(() => import("./routes/NotFound"));

function LegacyRedirect() {
  const { pathname, search } = useLocation();
  return <Navigate to={pathname.replace(/^\/e\//, "/") + search} replace />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      <MeProvider>
        <BrowserRouter>
          {/* Running uploads survive page changes; this shows their progress on every page. */}
          <UploadDock />
          <Suspense fallback={<Spinner className="min-h-dvh" />}>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/setup" element={<SetupWizard />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/dashboard/new" element={<CreateEventWizard />} />
              <Route path="/share" element={<ShareReceive />} />
              <Route path="/privacy" element={<Legal kind="privacy" />} />
              <Route path="/terms" element={<Legal kind="terms" />} />
              {/* Old links /e/<code>/… keep working. */}
              <Route path="/e/*" element={<LegacyRedirect />} />
              {/* Each event has its own address: /<event-name> */}
              <Route path="/:code" element={<EventHome />} />
              <Route path="/:code/upload" element={<Upload />} />
              <Route path="/:code/gallery" element={<Gallery />} />
              <Route path="/:code/manage" element={<Manage />} />
              <Route path="/:code/admin" element={<AdminLogin />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
            {/* Inside Suspense so it doesn't flash under the loading spinner. */}
            <SiteFooter />
          </Suspense>
        </BrowserRouter>
      </MeProvider>
    </ToastProvider>
  </StrictMode>,
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
