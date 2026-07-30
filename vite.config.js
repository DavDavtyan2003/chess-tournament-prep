import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite's dev server only serves static/module files — it doesn't execute
// files under api/ as backend functions the way Vercel does. This plugin
// runs them in-process during `npm run dev` so /api/* works locally without
// needing the Vercel CLI. Vercel itself ignores this and deploys api/ as
// serverless functions on its own.
function apiDevMiddleware() {
  return {
    name: "api-dev-middleware",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith("/api/")) return next();
        const url = new URL(req.url, "http://localhost");
        const routePath = `/api${url.pathname.slice("/api".length)}.js`;
        req.query = Object.fromEntries(url.searchParams);
        res.status = (code) => {
          res.statusCode = code;
          return res;
        };
        res.json = (body) => {
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(body));
        };
        try {
          const mod = await server.ssrLoadModule(routePath);
          await mod.default(req, res);
        } catch (e) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: String(e && e.message ? e.message : e) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevMiddleware()],
});
