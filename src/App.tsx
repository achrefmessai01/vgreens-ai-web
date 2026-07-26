import { lazy, useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { api } from "./api";
import type { AuthUser } from "./auth";
import { AuthContext } from "./AuthContext";
import Layout from "./components/Layout";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";

// Route-level code splitting: each page is its own chunk, so the heavy
// Monitoring page (Recharts) is only fetched when a user opens it.
const JobsPage = lazy(() => import("./pages/JobsPage"));
const JobDetailPage = lazy(() => import("./pages/JobDetailPage"));
const SubmitPage = lazy(() => import("./pages/SubmitPage"));
const ModelsPage = lazy(() => import("./pages/ModelsPage"));
const ModelDetailPage = lazy(() => import("./pages/ModelDetailPage"));
const OnboardModelPage = lazy(() => import("./pages/OnboardModelPage"));
const DatasetsPage = lazy(() => import("./pages/DatasetsPage"));
const DatasetDetailPage = lazy(() => import("./pages/DatasetDetailPage"));
const DatasetImportPage = lazy(() => import("./pages/DatasetImportPage"));
const DatasetImportDetailPage = lazy(() => import("./pages/DatasetImportDetailPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const MonitoringPage = lazy(() => import("./pages/MonitoringPage"));

export default function App() {
  // undefined = still checking the session; null = logged out; object = logged in
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);

  useEffect(() => {
    api.me()
      .then((u) => setUser(u as AuthUser))
      .catch(() => setUser(null));
  }, []);

  if (user === undefined) {
    return (
      <div className="app">
        <main className="content"><p className="muted">Loading…</p></main>
      </div>
    );
  }

  if (!user) return <Login onAuthed={setUser} />;

  return (
    <AuthContext.Provider value={{ user, setUser }}>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="jobs" element={<JobsPage />} />
            <Route path="jobs/:id" element={<JobDetailPage />} />
            <Route path="submit" element={<SubmitPage />} />
            <Route path="models" element={<ModelsPage />} />
            <Route path="models/onboard" element={<OnboardModelPage />} />
            <Route path="models/:model" element={<ModelDetailPage />} />
            <Route path="datasets" element={<DatasetsPage />} />
            <Route path="datasets/new" element={<DatasetImportPage />} />
            <Route path="datasets/imports/:id" element={<DatasetImportDetailPage />} />
            <Route path="datasets/:name" element={<DatasetDetailPage />} />
            <Route path="monitoring" element={<MonitoringPage />} />
            <Route path="admin" element={<AdminPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthContext.Provider>
  );
}
