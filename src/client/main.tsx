import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GameCanvas } from "module-react3fiber/client";
import "./styles.css";

const el = document.getElementById("root");
if (!el) throw new Error("#root not found");

createRoot(el).render(
  <StrictMode>
    {/* same-origin: the worker serves /api/* */}
    <GameCanvas baseUrl="" />
  </StrictMode>,
);
