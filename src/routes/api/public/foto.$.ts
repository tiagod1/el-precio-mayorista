import { createFileRoute } from "@tanstack/react-router";

const BUCKET = "product-photos";

async function downloadWithPublishableKey(path: string, supabaseUrl: string, key: string) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const client = createClient(supabaseUrl, key, {
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
    const { data, error } = await client.storage.from(BUCKET).download(path);
    return error || !data ? null : data;
  } catch {
    return null;
  }
}

async function downloadPhoto(path: string) {
  const supabaseUrl = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
  const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!supabaseUrl || (!serviceKey && !publishableKey)) return null;

  if (serviceKey) {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
      if (!error && data) return data;
    } catch {
      return publishableKey ? downloadWithPublishableKey(path, supabaseUrl, publishableKey) : null;
    }
  }

  return publishableKey ? downloadWithPublishableKey(path, supabaseUrl, publishableKey) : null;
}

// Sirve fotos de productos desde el almacenamiento privado (solo lectura, rutas validadas).
export const Route = createFileRoute("/api/public/foto/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const path = params._splat ?? "";
        if (!/^[a-zA-Z0-9._\-/]+$/.test(path) || path.includes("..")) {
          return new Response("Ruta inválida", { status: 400 });
        }
        const data = await downloadPhoto(path);
        if (!data) {
          const configured = !!(process.env["SUPABASE_SERVICE_ROLE_KEY"] || process.env["SUPABASE_PUBLISHABLE_KEY"] || process.env["VITE_SUPABASE_PUBLISHABLE_KEY"]);
          return new Response(configured ? "No encontrada" : "Servicio de fotos no configurado", { status: configured ? 404 : 503 });
        }
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
