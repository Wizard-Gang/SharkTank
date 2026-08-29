import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App, getBackend } from "module-react3fiber/client";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

// Backend chosen by ?api=ts|php — default same-origin (TS/Cloudflare), or the PHP PoC.
createRoot(el).render(
  <StrictMode>
    <App baseUrl={getBackend().apiBase} />
  </StrictMode>,
);
