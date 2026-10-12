import path from "node:path";
import { defineConfig } from "vite";

const client = path.resolve(import.meta.dirname, "src/client");

export default defineConfig({
  root: client,
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/client"),
    emptyOutDir: true,
    rolldownOptions: {
      input: {
        main: path.join(client, "index.html"),
        notFound: path.join(client, "404.html"),
      },
    },
  },
  server: {
    port: 5173,
    // In development the API runs as its own process (see scripts/dev.ts).
    proxy: { "/api/": "http://localhost:8787" },
  },
});
