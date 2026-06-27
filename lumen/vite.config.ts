import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

// In dev, `npm run dev` proxies /plex -> your real server so you avoid CORS,
// exactly like the nginx container does in production.
// Set VITE_PLEX_URL in a .env file, e.g. VITE_PLEX_URL=http://192.168.1.50:32400
export default defineConfig({
  plugins: [solid()],
  server: {
    proxy: {
      "/plex": {
        target: process.env.VITE_PLEX_URL || "http://localhost:32400",
        changeOrigin: true,
        secure: false,
        rewrite: (p) => p.replace(/^\/plex/, ""),
      },
    },
  },
});
