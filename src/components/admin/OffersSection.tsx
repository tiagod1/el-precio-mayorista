import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Pencil, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeText, type Product } from "@/lib/catalog";
import { activePromotionFor, fetchPromotions, promoDiscountPercent, promoPrice, type Promotion, type PromotionTipo } from "@/lib/promotions";
import { findMissingPromoColumns, formatARS, processPromoRows, PROMO_REQUIRED_COLUMNS, type PromoImportResult } from "@/lib/import-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const AR_TZ = "America/Argentina/Buenos_Aires";

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
};

const fromLocalInput = (value: string) => {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if ([year, month, day, hour, minute].some((n) => !Number.isFinite(n))) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  // ART = UTC-3 fijo (sin DST): la hora de pared se convierte sumando 3 h a UTC.
  const utcMs = Date.UTC(year, month - 1, day, hour + 3, minute);
  const roundTrip = toLocalInput(new Date(utcMs).toISOString());
  const expected = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
  return roundTrip === expected ? new Date(utcMs).toISOString() : null;
};

export function OffersSection({ products }: { products: Product[] }) {
  const qc = useQueryClient();
  const promotions = useQuery({ queryKey: ["promotions"], queryFn: fetchPromotions });

  // Importación Excel (principal)
  const [fileName, setFileName] = useState("");
  const [promoResult, setPromoResult] = useState<PromoImportResult | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [deleteMissing, setDeleteMissing] = useState(false);
  const [importing, setImporting] = useState(false);

  // Carga manual (alternativa)
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [tipo, setTipo] = useState<PromotionTipo>("porcentaje");
  const [valor, setValor] = useState("10");
  const [active, setActive] = useState(true);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [saving, setSaving] = useState(false);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const productByCodigo = useMemo(() => new Map(products.map((p) => [p.codigo, p])), [products]);
  const promoByProduct = useMemo(() => new Map((promotions.data ?? []).map((p) => [p.product_id, p])), [promotions.data]);
  const selectedProducts = useMemo(() => selected.map((id) => productById.get(id)).filter(Boolean) as Product[], [selected, productById]);
  const matches = useMemo(() => {
    const term = normalizeText(query);
    if (!term) return [];
    return products
      .filter((p) => !selected.includes(p.id) && normalizeText(`${p.nombre} ${p.codigo}`).includes(term))
      .slice(0, 8);
  }, [products, query, selected]);

  const promoPreview = useMemo(() => {
    if (!promoResult) return [];
    return promoResult.promotions.map((item) => {
      const product = productByCodigo.get(item.codigo);
      const existing = product ? promoByProduct.get(product.id) : undefined;
      return {
        ...item,
        product,
        isNew: !!product && !existing,
        unit: product ? promoPrice(product.precio, item) : null,
      };
    }).filter((x) => x.product);
  }, [promoResult, productByCodigo, promoByProduct]);

  function toggleProduct(p: Product) {
    const wasSelected = selected.includes(p.id);
    setSelected((prev) => prev.includes(p.id) ? prev.filter((id) => id !== p.id) : [...prev, p.id]);
    const promo = promoByProduct.get(p.id);
    if (!wasSelected && promo) {
      setTipo(promo.tipo);
      setValor(String(promo.valor));
      setActive(promo.active);
      setStartsAt(toLocalInput(promo.starts_at));
      setEndsAt(toLocalInput(promo.ends_at));
    }
  }

  function editPromo(promo: Promotion) {
    const product = productById.get(promo.product_id);
    if (!product) return;
    setSelected([product.id]);
    setTipo(promo.tipo);
    setValor(String(promo.valor));
    setActive(promo.active);
    setStartsAt(toLocalInput(promo.starts_at));
    setEndsAt(toLocalInput(promo.ends_at));
    setQuery("");
  }

  async function saveManual() {
    const n = Number(valor);
    if (!selected.length) { toast.error("Seleccioná al menos un producto."); return; }
    if (!Number.isFinite(n) || n < 0) { toast.error("Ingresá un valor válido."); return; }
    if (tipo === "porcentaje" && (n <= 0 || n >= 100)) { toast.error("El porcentaje debe ser mayor a 0 y menor a 100."); return; }
    if (tipo === "precio_fijo" && n === 0) { toast.error("El precio promocional debe ser mayor a 0."); return; }
    const starts = fromLocalInput(startsAt);
    const ends = fromLocalInput(endsAt);
    if (starts && ends && new Date(ends) <= new Date(starts)) { toast.error("La fecha final debe ser posterior a la inicial."); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("promotions").upsert(
        selected.map((product_id) => ({
          product_id,
          tipo,
          valor: n,
          starts_at: starts,
          ends_at: ends,
          active,
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "product_id" },
      );
      if (error) throw error;
      toast.success(`Promoción guardada para ${selected.length} producto${selected.length === 1 ? "" : "s"}.`);
      setSelected([]);
      setQuery("");
      qc.invalidateQueries({ queryKey: ["promotions"] });
    } catch (e) {
      toast.error(`No se pudo guardar: ${e instanceof Error ? e.message : "error desconocido"}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(promo: Promotion) {
    const { error } = await supabase.from("promotions").update({ active: !promo.active, updated_at: new Date().toISOString() }).eq("id", promo.id);
    if (error) { toast.error(`No se pudo actualizar: ${error.message}`); return; }
    qc.invalidateQueries({ queryKey: ["promotions"] });
  }

  async function remove(promo: Promotion) {
    if (!window.confirm("¿Eliminar esta promoción?")) return;
    const { error } = await supabase.from("promotions").delete().eq("id", promo.id);
    if (error) { toast.error(`No se pudo eliminar: ${error.message}`); return; }
    toast.success("Promoción eliminada.");
    qc.invalidateQueries({ queryKey: ["promotions"] });
  }

  async function onPromoFile(f: File | undefined) {
    setPromoResult(null); setFatal(null); setFileName("");
    if (!f) return;
    setFileName(f.name);
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) return setFatal("El archivo debe ser Excel (.xlsx, .xls) o .csv.");
    if (f.size > 20 * 1024 * 1024) return setFatal("El archivo supera los 20 MB.");
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const first = wb.SheetNames[0];
      const ws = first ? wb.Sheets[first] : undefined;
      if (!ws) return setFatal("El archivo no tiene hojas.");
      const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" });
      let hIdx = -1;
      for (let i = 0; i < Math.min(10, matrix.length); i++) {
        if (findMissingPromoColumns((matrix[i] ?? []).map(String)).length === 0) { hIdx = i; break; }
      }
      if (hIdx === -1) {
        const missing = findMissingPromoColumns((matrix[0] ?? []).map(String));
        return setFatal(`Faltan columnas obligatorias: ${missing.join(", ")}. Se esperan: ${PROMO_REQUIRED_COLUMNS.join(", ")} (podés usar Modalidad/Monto como alias).`);
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { range: hIdx, defval: "" });
      const existingCodes = new Set(products.map((p) => p.codigo));
      const r = processPromoRows(rows, existingCodes, hIdx + 2);
      if (r.totalRows === 0) return setFatal("No se encontraron filas en el archivo.");
      setPromoResult(r);
    } catch {
      setFatal("No se pudo leer el archivo. Verificá que no esté dañado ni protegido con contraseña.");
    }
  }

  async function confirmImport() {
    if (!promoResult) return;
    const now = new Date().toISOString();
    const rows = promoPreview.map(({ product, tipo: t, valor: v }) => {
      const existing = promoByProduct.get(product!.id);
      return {
        product_id: product!.id,
        tipo: t,
        valor: v,
        starts_at: existing?.starts_at ?? null,
        ends_at: existing?.ends_at ?? null,
        active: existing?.active ?? true,
        updated_at: now,
      };
    });
    if (!rows.length) { toast.error("No hay promociones válidas para importar."); return; }
    setImporting(true);
    try {
      const { error } = await supabase.from("promotions").upsert(rows, { onConflict: "product_id" });
      if (error) throw error;
      let deleted = 0;
      if (deleteMissing) {
        const keep = new Set(rows.map((r) => r.product_id));
        const ids = (promotions.data ?? []).filter((p) => !keep.has(p.product_id)).map((p) => p.id);
        if (ids.length) {
          const { error: delError } = await supabase.from("promotions").delete().in("id", ids);
          if (delError) throw delError;
          deleted = ids.length;
        }
      }
      toast.success(`Importación completa: ${rows.length} promociones${deleted ? `, ${deleted} eliminadas` : ""}.`);
      setPromoResult(null); setFileName(""); setDeleteMissing(false);
      qc.invalidateQueries({ queryKey: ["promotions"] });
    } catch (e) {
      toast.error(`No se pudo importar: ${e instanceof Error ? e.message : "error desconocido"}`);
    } finally {
      setImporting(false);
    }
  }

  const promoRows = (promotions.data ?? []).map((promo) => ({ promo, product: productById.get(promo.product_id) })).filter((x) => x.product);
  const nuevas = promoPreview.filter((x) => x.isNew).length;

  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <h2 className="text-lg font-black">Agregar ofertas</h2>
      <p className="mt-1 text-sm text-muted-foreground">Importá un Excel/CSV con código, tipo y valor. Los precios base y el stock no se modifican.</p>

      <div className="mt-4 rounded-xl border bg-secondary/40 p-4">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-primary" />
          <h3 className="font-bold">Importar Excel de ofertas</h3>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Columnas: <strong>Codigo</strong>, <strong>Tipo</strong> (Fijo o Porcentaje) y <strong>Valor</strong>. También acepta Modalidad/Monto como alias.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-semibold hover:bg-secondary">
            <Upload className="h-4 w-4" /> Elegir archivo
            <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => onPromoFile(e.target.files?.[0])} />
          </label>
          {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
        </div>
        {fatal && <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{fatal}</p>}

        {promoResult && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-primary/10 px-2 py-1 font-semibold text-primary">{promoPreview.length} promociones válidas</span>
              <span className="rounded-full bg-secondary px-2 py-1 font-semibold">{nuevas} nuevas · {promoPreview.length - nuevas} existentes</span>
              {promoResult.warnings.length > 0 && <span className="rounded-full bg-highlight/30 px-2 py-1 font-semibold">{promoResult.warnings.length} avisos</span>}
              {promoResult.errors.length > 0 && <span className="rounded-full bg-destructive/15 px-2 py-1 font-semibold text-destructive">{promoResult.errors.length} errores</span>}
            </div>
            {promoPreview.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-lg border">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left">
                      <th className="px-2 py-1.5">Código</th><th className="px-2 py-1.5">Producto</th><th className="px-2 py-1.5">Tipo</th><th className="px-2 py-1.5">Valor</th><th className="px-2 py-1.5">Precio promo</th><th className="px-2 py-1.5">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {promoPreview.map((x) => (
                      <tr key={x.codigo}>
                        <td className="px-2 py-1.5 font-mono">{x.codigo}</td>
                        <td className="max-w-40 truncate px-2 py-1.5">{x.product!.nombre}</td>
                        <td className="px-2 py-1.5">{x.tipo === "porcentaje" ? "Porcentaje" : "Precio fijo"}</td>
                        <td className="px-2 py-1.5">{x.tipo === "porcentaje" ? `${x.valor}%` : formatARS(x.valor)}</td>
                        <td className="px-2 py-1.5 font-semibold">{x.unit !== null ? formatARS(x.unit) : "—"}</td>
                        <td className="px-2 py-1.5">{x.isNew ? "Nueva" : "Actualiza"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {promoResult.errors.length > 0 && (
              <ul className="max-h-32 space-y-1 overflow-auto rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
                {promoResult.errors.map((e, i) => <li key={i}>Fila {e.fila}: {e.motivo}</li>)}
              </ul>
            )}
            {promoResult.warnings.length > 0 && (
              <ul className="max-h-24 space-y-1 overflow-auto rounded-lg border bg-secondary/60 p-3 text-xs text-muted-foreground">
                {promoResult.warnings.map((w, i) => <li key={i}>Fila {w.fila}: {w.motivo}</li>)}
              </ul>
            )}
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={deleteMissing} onCheckedChange={setDeleteMissing} />
              Eliminar promociones que no figuren en el archivo
            </label>
            <Button onClick={confirmImport} disabled={importing || promoPreview.length === 0}>
              {importing ? "Importando…" : `Confirmar importación (${promoPreview.length})`}
            </Button>
          </div>
        )}
      </div>

      <details className="mt-4 rounded-xl border p-4">
        <summary className="cursor-pointer text-sm font-bold">Carga manual (alternativa)</summary>
        <div className="mt-4 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="offer-search">Buscar producto</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input id="offer-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Nombre o código…" className="pl-9" />
            </div>
            {matches.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {matches.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0"><span className="block truncate font-medium">{p.nombre}</span><span className="text-xs text-muted-foreground">Cód. {p.codigo}</span></span>
                    <Button type="button" size="sm" variant="outline" onClick={() => toggleProduct(p)}><Plus className="h-4 w-4" /> Agregar</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {selectedProducts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedProducts.map((p) => (
                <button key={p.id} type="button" onClick={() => toggleProduct(p)} className="inline-flex max-w-full items-center gap-1 rounded-full bg-secondary px-3 py-1 text-xs font-semibold hover:bg-muted" title="Quitar">
                  <span className="truncate">{p.nombre}</span><X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo de oferta</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as PromotionTipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="porcentaje">Porcentaje de descuento</SelectItem>
                  <SelectItem value="precio_fijo">Precio promocional fijo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-value">{tipo === "porcentaje" ? "Descuento (%)" : "Precio promocional ($)"}</Label>
              <Input id="offer-value" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-start">Inicio (opcional)</Label>
              <Input id="offer-start" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="offer-end">Fin (opcional)</Label>
              <Input id="offer-end" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Switch checked={active} onCheckedChange={setActive} /> Promoción activa
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={saveManual} disabled={saving || !selected.length}>{saving ? "Guardando…" : "Guardar oferta"}</Button>
            {selected.length > 1 && <span className="self-center text-xs text-muted-foreground">Se aplicará a {selected.length} productos.</span>}
          </div>
        </div>
      </details>

      {promoRows.length > 0 && (
        <div className="mt-6 border-t pt-4">
          <h3 className="text-sm font-black uppercase tracking-wide text-muted-foreground">Promociones cargadas</h3>
          <ul className="mt-3 divide-y">
            {promoRows.map(({ promo, product }) => product && (
              <li key={promo.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{product.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {promo.tipo === "porcentaje" ? `${promo.valor}% de descuento` : `Precio fijo ${formatARS(promo.valor)}`}
                    {promo.starts_at || promo.ends_at ? ` · ${promo.starts_at ? new Date(promo.starts_at).toLocaleDateString("es-AR") : "…"} a ${promo.ends_at ? new Date(promo.ends_at).toLocaleDateString("es-AR") : "…"}` : " · Sin fechas"}
                    {activePromotionFor(product.id, [promo]) && promoDiscountPercent(product.precio, promoPrice(product.precio, promo)) > 0 ? ` · Ahorro ${promoDiscountPercent(product.precio, promoPrice(product.precio, promo))}%` : ""}
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs"><Switch checked={promo.active} onCheckedChange={() => toggleActive(promo)} /> Activa</label>
                <Button type="button" size="sm" variant="outline" onClick={() => editPromo(promo)}><Pencil className="h-4 w-4" /> Editar</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => remove(promo)}><Trash2 className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
