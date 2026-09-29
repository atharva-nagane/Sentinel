// The dashboard talks to every backend through /api/<name> on its own origin;
// the dev server proxies those to the real services, so no CORS setup is needed
// on anyone else's service. Targets come from the same env vars as
// docker-compose.yml / .env.example.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backends = {
  monitoring: process.env.MONITORING_URL || "http://localhost:4001",
  detection: process.env.FAILURE_DETECTION_URL || "http://localhost:4002",
  recovery: process.env.RECOVERY_URL || "http://localhost:4003",
  faults: process.env.FAULT_INJECTION_URL || "http://localhost:4004",
};

const proxy = Object.fromEntries(
  Object.entries(backends).map(([name, target]) => [
    `/api/${name}`,
    {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(new RegExp(`^/api/${name}`), ""),
    },
  ])
);

export default defineConfig({
  plugins: [react()],
  server: { host: true, port: Number(process.env.DASHBOARD_PORT) || 5173, proxy },
  preview: { host: true, port: Number(process.env.DASHBOARD_PORT) || 5173, proxy },
});
