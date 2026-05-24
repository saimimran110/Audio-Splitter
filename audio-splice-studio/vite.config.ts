import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/split": "http://127.0.0.1:8000",
      "/files": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
      "/config": "http://127.0.0.1:8000",
      "/cleanup": "http://127.0.0.1:8000",
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
