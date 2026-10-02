import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev: run `ratel-burrow --port 4377 --no-open`, then `pnpm dev` and open
// http://localhost:5173/?t=<token printed by ratel-burrow>.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4377",
        changeOrigin: true,
      },
    },
  },
});
