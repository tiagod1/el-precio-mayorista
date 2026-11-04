import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

// Sirve fotos de productos desde el almacenamiento privado (solo lectura, rutas validadas).
export const Route = createFileRoute("/api/public/foto/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat ?? "";
        if (!/^[a-zA-Z0-9._\-/]+$/.test(path) || path.includes("..")) {
          return new Response("Ruta inválida", { status: 400 });
        }
        const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
        const client = createClient(process.env["SUPABASE_URL"]!, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h });
            },
          },
        });
        const { data, error } = await client.storage.from("product-photos").download(path);
        if (error || !data) return new Response("No encontrada", { status: 404 });
        return new Response(data, {
          headers: {
            "content-type": data.type || "image/jpeg",
            "cache-control": "public, max-age=86400, immutable",
          },
        });
      },
    },
  },
});
