import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// In development the Django API runs separately; proxying keeps everything same-origin,
// so the session and CSRF cookies just work.
const apiTarget = process.env.VITE_API_PROXY ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": apiTarget,
      "/django-admin": apiTarget,
      "/static": apiTarget,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
