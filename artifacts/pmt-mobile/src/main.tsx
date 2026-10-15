import { lazy } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { auth } from "./firebase.js";
import PortalGate from "./lib/clientPortal/PortalGate.jsx";

// Staff app is lazy so none of its Firebase listeners exist until the gate
// has confirmed the session is not a client-portal session.
const StaffApp = lazy(() => import("./App.jsx"));
const bypass = (() => { const p = new URLSearchParams(window.location.search); return !!(p.get("code") && p.get("state")); })();
const apiBase = import.meta.env.VITE_API_BASE_URL || "/api";

createRoot(document.getElementById("root")!).render(
  <PortalGate auth={auth} apiBase={apiBase} StaffApp={StaffApp} bypass={bypass} />,
);
