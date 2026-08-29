import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const gameSource = (relativePath: string) =>
  fileURLToPath(new URL(`./vendor/ModuleReact3Fiber/src/${relativePath}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "module-react3fiber/client": gameSource("client/index.ts"),
      "module-react3fiber/engine": gameSource("engine/index.ts"),
      "module-react3fiber/store": gameSource("store/index.ts"),
      "module-react3fiber/protocol": gameSource("protocol/index.ts"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  publicDir: false,
});
