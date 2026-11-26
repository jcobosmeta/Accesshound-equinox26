import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Not PORT: tools that launch the dev server set PORT to Vite's own port, which would proxy /api to itself.
const API = `http://localhost:${process.env.API_PORT ?? 8787}`;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The agent trace is a Server-Sent Events stream; the proxy passes it through unbuffered.
    proxy: { "/api": { target: API, changeOrigin: true } },
  },
});
