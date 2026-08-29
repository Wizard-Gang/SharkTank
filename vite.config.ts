import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// Resolve module-react3fiber from its first-party tracked source so the React plugin
// compiles its .tsx (aliases win over the node_modules `file:` link, which is kept
// so the Worker bundler can resolve the same specifiers).
const sub = (rel: string) => fileURLToPath(new URL(`./vendor/ModuleReact3Fiber/src/${rel}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "module-react3fiber/client": sub("client/index.ts"),
      "module-react3fiber/engine": sub("engine/index.ts"),
      "module-react3fiber/store": sub("store/index.ts"),
      "module-react3fiber/protocol": sub("protocol/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  // We output to dist/ and serve via the worker's ASSETS binding; no Vite publicDir.
  publicDir: false,
});
