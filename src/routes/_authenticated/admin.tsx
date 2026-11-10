import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { FileSpreadsheet, LogOut, Upload, ImagePlus, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { fetchAllProducts, fetchSettings, formatDate, isAvailable, normalizeText, photoSrc, type Product } from "@/lib/catalog";
import { findMissingColumns, formatARS, processRows, REQUIRED_COLUMNS, type ImportResult } from "@/lib/import-rules";
import { OffersSection } from "@/components/admin/OffersSection";
import { OrdersSection } from "@/components/admin/OrdersSection";
import { StatsSection } from "@/components/admin/StatsSection";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Administración | El Precio Mayorista" },
      { name: "description", content: "Panel para importar precios, stock y fotos del catálogo." },
      { property: "og:title", content: "Administración | El Precio Mayorista" },
      { property: "og:description", content: "Panel de administración del catálogo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function useIsAdmin() {
  return useQuery({
    queryKey: ["is-admin"],
    queryFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return { admin: false, email: "" };
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
      return { admin: !!data, email: u.user.email ?? "" };
    },
  });
}

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = useIsAdmin();

  async function logout() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 bg-header text-primary-foreground">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <Brand small />
          <span className="rounded bg-primary-foreground/15 px-2 py-0.5 text-xs font-semibold">Admin</span>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/" className="text-sm underline-offset-2 hover:underline">Ver catálogo</Link>
            <button onClick={logout} className="rounded p-2" aria-label="Cerrar sesión"><LogOut className="h-4 w-4" /></button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        {role.isLoading ? (
          <p className="text-muted-foreground">Verificando permisos…</p>
        ) : !role.data?.admin ? (
          <div className="rounded-xl border bg-card p-6 shadow-card">
            <h1 className="text-xl font-black">Sin permisos de administración</h1>
            <p className="mt-2 text-sm text-muted-foreground">La cuenta {role.data?.email} no tiene acceso al panel.</p>
          </div>
        ) : (
          <AdminContent />
        )}
      </main>
    </div>
  );
}

function AdminContent() {
  const products = useQuery({ queryKey: ["products"], queryFn: fetchAllProducts });
  const settings = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const total = products.data?.length ?? 0;
  const conStock = products.data?.filter(isAvailable).length ?? 0;
  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Productos" value={total.toLocaleString("es-AR")} />
        <Stat label="Con stock" value={conStock.toLocaleString("es-AR")} />
        <Stat label="Sin stock" value={(total - conStock).toLocaleString("es-AR")} />
        <Stat label="Última actualización" value={formatDate(settings.data?.ultima_actualizacion ?? null)} small />
      </section>
      <div className="grid gap-6 lg:grid-cols-2">
        {settings.data && <ImportSection excluded={settings.data.familias_excluidas} existing={products.data ?? []} />}
        <OffersSection products={products.data ?? []} />
      </div>
      {settings.data && <SettingsSection key={JSON.stringify(settings.data)} s={settings.data} />}
      <OrdersSection />
      <StatsSection products={products.data ?? []} />
      <ProductsSection products={products.data ?? []} />
    </>
  );
}

function Stat({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 font-display font-black ${small ? "text-sm" : "text-2xl"}`}>{value}</p>
    </div>
  );
}

function Card({ title, children, desc }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="text-lg font-black">{title}</h2>
      {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function ImportSection({ excluded, existing }: { excluded: string[]; existing: Product[] }) {
  const qc = useQueryClient();
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [markMissing, setMarkMissing] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);

  async function onFile(f: File | undefined) {
    setResult(null); setFatal(null);
    if (!f) return;
    setFileName(f.name);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) return setFatal("El archivo debe ser Excel (.xlsx, .xls) o .csv.");
    if (f.size > 20 * 1024 * 1024) return setFatal("El archivo supera los 20 MB.");
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const first = wb.SheetNames[0]; const ws = first ? wb.Sheets[first] : undefined;
      if (!ws) return setFatal("El archivo no tiene hojas.");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      // Buscar la fila de encabezados entre las primeras 10
      let hIdx = -1;
      for (let i = 0; i < Math.min(10, matrix.length); i++) {
        if (findMissingColumns((matrix[i] ?? []).map(String)).length === 0) { hIdx = i; break; }
      }
      if (hIdx === -1) {
        const missing = findMissingColumns((matrix[0] ?? []).map(String));
        return setFatal(`Faltan columnas obligatorias: ${missing.join(", ")}. Se esperan: ${REQUIRED_COLUMNS.join(", ")}.`);
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: hIdx, defval: "" });
      const r = processRows(rows, excluded, hIdx + 2);
      if (r.products.length === 0) return setFatal("No se encontraron productos válidos en el archivo.");
      setResult(r);
    } catch {
      setFatal("No se pudo leer el archivo. Verificá que no esté dañado ni protegido con contraseña.");
    }
  }

  const stats = useMemo(() => {
    if (!result) return null;
    const ex = new Set(existing.map((p) => p.codigo));
    const nuevos = result.products.filter((p) => !ex.has(p.codigo)).length;
    const inFile = new Set(result.products.map((p) => p.codigo));
    const faltantes = existing.filter((p) => !inFile.has(p.codigo)).length;
    return { nuevos, actualizados: result.products.length - nuevos, faltantes };
  }, [result, existing]);

  async function confirm() {
    if (!result) return;
    setProgress(0);
    try {
      const chunk = 500;
      const list = result.products.map((p) => ({ ...p, updated_at: new Date().toISOString() }));
      for (let i = 0; i < list.length; i += chunk) {
        const { error } = await supabase.from("products").upsert(list.slice(i, i + chunk), { onConflict: "codigo" });
        if (error) throw error;
        setProgress(Math.round(((i + chunk) / list.length) * 90));
      }
      if (markMissing) {
        const inFile = new Set(result.products.map((p) => p.codigo));
        const missing = existing.filter((p) => !inFile.has(p.codigo)).map((p) => p.codigo);
        for (let i = 0; i < missing.length; i += 200) {
          const { error } = await supabase.from("products").update({ stock: 0 }).in("codigo", missing.slice(i, i + 200));
          if (error) throw error;
        }
      }
      const { error } = await supabase.from("settings").update({ ultima_actualizacion: new Date().toISOString(), ultimo_archivo: fileName }).eq("id", 1);
      if (error) throw error;
      setProgress(100);
      toast.success(`Importación completa: ${result.products.length.toLocaleString("es-AR")} productos.`);
      setResult(null); setFileName("");
      qc.invalidateQueries();
    } catch (e) {
      toast.error(`Error al importar: ${e instanceof Error ? e.message : "desconocido"}. Los productos ya procesados quedaron guardados; podés reintentar.`);
    } finally {
      setTimeout(() => setProgress(null), 800);
    }
  }

  return (
    <Card title="Importar Excel de precios y stock" desc={`Columnas requeridas: ${REQUIRED_COLUMNS.join(", ")}. Se actualiza por Código sin borrar fotos. Los Jumbo Pack se excluyen y los cigarrillos se agrupan en CIGARRILLOS.`}>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center hover:bg-secondary">
        <FileSpreadsheet className="h-8 w-8 text-primary" />
        <span className="font-semibold">{fileName || "Elegir archivo Excel"}</span>
        <span className="text-xs text-muted-foreground">.xlsx, .xls o .csv · máx. 20 MB</span>
        <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      {fatal && (
        <div role="alert" className="mt-4 flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {fatal}
        </div>
      )}

      {result && stats && (
        <div className="mt-4 space-y-4">
          <div className="flex gap-2 rounded-lg border border-success/40 bg-success/10 p-3 text-sm">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
            <div>
              <p className="font-semibold">Archivo válido: {result.products.length.toLocaleString("es-AR")} productos listos.</p>
              <p className="text-muted-foreground">
                {stats.nuevos} nuevos · {stats.actualizados} a actualizar · {result.excluded} excluidos (Jumbo Pack / categorías descartadas) · {result.errors.length} filas con error · {result.warnings.length} avisos
              </p>
            </div>
          </div>
          {(result.errors.length > 0 || result.warnings.length > 0) && (
            <details className="rounded-lg border p-3 text-sm">
              <summary className="cursor-pointer font-semibold">Ver errores y avisos</summary>
              <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
                {result.errors.slice(0, 200).map((e, i) => <li key={`e${i}`} className="text-destructive">Fila {e.fila}: {e.motivo} (se omite)</li>)}
                {result.warnings.slice(0, 200).map((e, i) => <li key={`w${i}`} className="text-muted-foreground">Fila {e.fila}: {e.motivo}</li>)}
              </ul>
            </details>
          )}
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={markMissing} onCheckedChange={setMarkMissing} />
            Marcar sin stock los {stats.faltantes} productos que no están en este archivo
          </label>
          {progress !== null && <Progress value={progress} />}
          <div className="flex gap-2">
            <Button onClick={confirm} disabled={progress !== null}><Upload /> Confirmar importación</Button>
            <Button variant="outline" onClick={() => { setResult(null); setFileName(""); }} disabled={progress !== null}>Cancelar</Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function SettingsSection({ s }: { s: { whatsapp: string | null; ocultar_sin_stock: boolean; familias_excluidas: string[] } }) {
  const qc = useQueryClient();
  const [wa, setWa] = useState(s.whatsapp ?? "");
  const [hide, setHide] = useState(s.ocultar_sin_stock);
  const [excl, setExcl] = useState(s.familias_excluidas.join("\n"));
  const [saving, setSaving] = useState(false);

  async function save() {
    const digits = wa.replace(/\D/g, "");
    if (wa && (digits.length < 10 || digits.length > 15)) {
      { toast.error("Número inválido. Usá formato internacional, ej: 549 + código de área + número."); return; }
    }
    setSaving(true);
    const familias = excl.split("\n").map((x) => x.trim().toUpperCase()).filter(Boolean);
    const { error } = await supabase.from("settings").update({ whatsapp: digits || null, ocultar_sin_stock: hide, familias_excluidas: familias }).eq("id", 1);
    setSaving(false);
    if (error) { toast.error(`No se pudo guardar: ${error.message}`); return; }
    toast.success("Configuración guardada");
    qc.invalidateQueries({ queryKey: ["settings"] });
  }

  return (
    <Card title="Configuración">
      <div className="grid gap-5 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="wa">WhatsApp para pedidos</Label>
          <Input id="wa" inputMode="tel" placeholder="Ej: 5491112345678" value={wa} onChange={(e) => setWa(e.target.value)} />
          <p className="text-xs text-muted-foreground">Formato internacional sin + ni espacios (Argentina celular: 549 + área + número).</p>
          <label className="mt-4 flex items-center gap-3 text-sm">
            <Switch checked={hide} onCheckedChange={setHide} /> Ocultar del catálogo los productos sin stock
          </label>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ex">Categorías (Familia) descartadas</Label>
          <Textarea id="ex" rows={5} placeholder="Una por línea" value={excl} onChange={(e) => setExcl(e.target.value)} />
          <p className="text-xs text-muted-foreground">Se excluyen en las próximas importaciones. Escribilas tal como figuran en la columna Familia.</p>
        </div>
      </div>
      <Button className="mt-4" onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar configuración"}</Button>
    </Card>
  );
}

function ProductsSection({ products }: { products: Product[] }) {
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(30);
  useEffect(() => setLimit(30), [q]);
  const list = useMemo(() => {
    const t = normalizeText(q);
    return t ? products.filter((p) => normalizeText(`${p.nombre} ${p.codigo}`).includes(t)) : products;
  }, [products, q]);
  return (
    <Card title="Productos y fotos" desc="Buscá un producto para cargar su foto, marcarlo sin stock u ocultarlo.">
      <Input placeholder="Buscar por nombre o código…" value={q} onChange={(e) => setQ(e.target.value)} className="mb-3" />
      {products.length === 0 ? (
        <p className="text-sm text-muted-foreground">Todavía no hay productos. Importá el Excel para comenzar.</p>
      ) : (
        <ul className="divide-y">
          {list.slice(0, limit).map((p) => <AdminRow key={p.id} p={p} />)}
        </ul>
      )}
      {list.length > limit && <Button variant="outline" className="mt-3 w-full" onClick={() => setLimit((l) => l + 30)}>Ver más</Button>}
    </Card>
  );
}

function AdminRow({ p }: { p: Product }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function update(patch: Partial<Product>): Promise<boolean> {
    setBusy(true);
    const { error } = await supabase.from("products").update(patch).eq("id", p.id);
    setBusy(false);
    if (error) { toast.error(`No se pudo actualizar: ${error.message}`); return false; }
    qc.invalidateQueries({ queryKey: ["products"] });
    return true;
  }

  async function upload(f: File | undefined) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error("El archivo debe ser una imagen."); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error("La imagen supera 5 MB."); return; }
    setBusy(true);
    const ext = (f.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
    const safe = p.codigo.replace(/[^a-zA-Z0-9_-]/g, "_");
    const path = `${safe}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("product-photos").upload(path, f, { contentType: f.type });
    if (error) { setBusy(false); { toast.error(`No se pudo subir: ${error.message}`); return; } }
    if (!(await update({ foto_url: path }))) {
      await supabase.storage.from("product-photos").remove([path]);
      return;
    }
    if (p.foto_url) await supabase.storage.from("product-photos").remove([p.foto_url]);
    toast.success("Foto actualizada");
  }

  async function removePhoto() {
    if (!p.foto_url) return;
    if (!(await update({ foto_url: null }))) return;
    await supabase.storage.from("product-photos").remove([p.foto_url]);
    toast.success("Foto eliminada");
  }

  const src = photoSrc(p.foto_url);
  return (
    <li className="flex flex-wrap items-center gap-3 py-3">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-muted">
        {src && <img src={src} alt="" className="h-full w-full object-contain" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{p.nombre}</p>
        <p className="text-xs text-muted-foreground">Cód. {p.codigo} · {p.categoria} · {formatARS(p.precio)} · Stock {p.stock}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <label className="flex items-center gap-1.5"><Switch disabled={busy} checked={p.sin_stock_manual} onCheckedChange={(v) => update({ sin_stock_manual: v })} /> Sin stock</label>
        <label className="flex items-center gap-1.5"><Switch disabled={busy} checked={p.oculto} onCheckedChange={(v) => update({ oculto: v })} /> Oculto</label>
        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1.5 hover:bg-secondary">
          <ImagePlus className="h-4 w-4" /> {p.foto_url ? "Cambiar" : "Foto"}
          <input type="file" accept="image/*" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {p.foto_url && <button onClick={removePhoto} disabled={busy} className="rounded p-1 text-muted-foreground hover:text-destructive" aria-label="Eliminar foto"><Trash2 className="h-4 w-4" /></button>}
      </div>
    </li>
  );
}
