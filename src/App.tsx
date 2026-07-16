import { useState } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import { isAuthed } from "./auth";
import Layout from "./components/Layout";
import Login from "./components/Login";
import Dashboard from "./components/Dashboard";
import JobsPage from "./pages/JobsPage";
import JobDetailPage from "./pages/JobDetailPage";

export default function App() {
  const [authed, setAuthed] = useState(isAuthed());

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;

  return (
    <HashRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="jobs" element={<JobsPage />} />
          <Route path="jobs/:id" element={<JobDetailPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
