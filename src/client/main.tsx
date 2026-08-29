import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "module-react3fiber/app";
import { getBackend } from "module-react3fiber/backend";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

// Backend chosen by ?api=ts|php — default same-origin (TS/Cloudflare), or the PHP PoC.
createRoot(el).render(
  <StrictMode>
    <App baseUrl={getBackend().apiBase} />
  </StrictMode>,
);
