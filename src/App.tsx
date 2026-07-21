import { useEffect, useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { api } from "./api";
import type { AuthUser } from "./auth";
import { AuthContext } from "./AuthContext";
import Layout from "./components/Layout";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import JobsPage from "./pages/JobsPage";
import JobDetailPage from "./pages/JobDetailPage";
import SubmitPage from "./pages/SubmitPage";
import ModelsPage from "./pages/ModelsPage";
import ModelDetailPage from "./pages/ModelDetailPage";
import DatasetsPage from "./pages/DatasetsPage";
import DatasetDetailPage from "./pages/DatasetDetailPage";
import DatasetImportPage from "./pages/DatasetImportPage";
import DatasetImportDetailPage from "./pages/DatasetImportDetailPage";

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
            <Route path="models/:model" element={<ModelDetailPage />} />
            <Route path="datasets" element={<DatasetsPage />} />
            <Route path="datasets/new" element={<DatasetImportPage />} />
            <Route path="datasets/imports/:id" element={<DatasetImportDetailPage />} />
            <Route path="datasets/:name" element={<DatasetDetailPage />} />
          </Route>
        </Routes>
      </HashRouter>
    </AuthContext.Provider>
  );
}
