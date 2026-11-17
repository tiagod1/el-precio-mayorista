import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/lib/catalog";
import { formatARS } from "@/lib/import-rules";
import { lowStockProducts, periodRange, previousPeriodRange, summarizeSales, type SalesItem, type SalesOrder, type SalesPeriod } from "@/lib/stats";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ORDER_COLS = "id,total,created_at";
const ITEM_COLS = "order_id,product_id,codigo,nombre,qty,line_total";

function iso(d: Date) { return d.toISOString(); }

export function StatsSection({ products }: { products: Product[] }) {
  const [period, setPeriod] = useState<SalesPeriod>("month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const range = useMemo(() => periodRange(period, customStart, customEnd), [period, customStart, customEnd]);
  const prevRange = useMemo(() => previousPeriodRange(range), [range]);
  const monthStart = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1), []);
  const nextMonth = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1), []);
  const todayStart = useMemo(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }, []);

  const monthOrders = useQuery({
    queryKey: ["stats-month-orders", iso(monthStart), iso(nextMonth)],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(ORDER_COLS).eq("status", "confirmed").gte("created_at", iso(monthStart)).lt("created_at", iso(nextMonth)).limit(5000);
      if (error) throw error;
      return (data ?? []) as SalesOrder[];
    },
  });
  const rangeOrders = useQuery({
    queryKey: ["stats-range-orders", iso(range.start), iso(range.end)],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(ORDER_COLS).eq("status", "confirmed").gte("created_at", iso(range.start)).lt("created_at", iso(range.end)).limit(5000);
      if (error) throw error;
      return (data ?? []) as SalesOrder[];
    },
  });
  const prevOrders = useQuery({
    queryKey: ["stats-prev-orders", iso(prevRange.start), iso(prevRange.end)],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(ORDER_COLS).eq("status", "confirmed").gte("created_at", iso(prevRange.start)).lt("created_at", iso(prevRange.end)).limit(5000);
      if (error) throw error;
      return (data ?? []) as SalesOrder[];
    },
  });
  const rangeIds = useMemo(() => (rangeOrders.data ?? []).map((o) => o.id), [rangeOrders.data]);
  const rangeItems = useQuery({
    queryKey: ["stats-range-items", rangeIds.join(",")],
    enabled: rangeIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("order_items").select(ITEM_COLS).in("order_id", rangeIds);
      if (error) throw error;
      return (data ?? []) as SalesItem[];
    },
  });

  const current = useMemo(() => summarizeSales(rangeOrders.data ?? [], rangeItems.data ?? [], products, range), [rangeOrders.data, rangeItems.data, products, range]);
  const previous = useMemo(() => summarizeSales(prevOrders.data ?? [], [], products, prevRange), [prevOrders.data, products, prevRange]);
  const today = useMemo(() => (monthOrders.data ?? []).filter((o) => new Date(o.created_at).getTime() >= todayStart.getTime()).reduce((s, o) => s + Number(o.total), 0), [monthOrders.data, todayStart]);
  const monthTotal = useMemo(() => (monthOrders.data ?? []).reduce((s, o) => s + Number(o.total), 0), [monthOrders.data]);
  const comparison = previous.total > 0 ? ((current.total - previous.total) / previous.total) * 100 : null;
  const lowStock = useMemo(() => lowStockProducts(products), [products]);
  const error = rangeOrders.isError || rangeItems.isError || monthOrders.isError || prevOrders.isError;

  return (
    <section className="rounded-xl border bg-card p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black">Estadísticas</h2>
          <p className="mt-1 text-sm text-muted-foreground">Solo ventas reales confirmadas por el administrador.</p>
        </div>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as SalesPeriod)}>
          <TabsList>
            <TabsTrigger value="day">Día</TabsTrigger>
            <TabsTrigger value="week">Semana</TabsTrigger>
            <TabsTrigger value="month">Mes</TabsTrigger>
            <TabsTrigger value="custom">Personalizado</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {period === "custom" && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label htmlFor="stats-start">Desde</Label><Input id="stats-start" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="stats-end">Hasta</Label><Input id="stats-end" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} /></div>
        </div>
      )}
      {error ? (
        <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">No se pudieron cargar las estadísticas. Verificá que la migración de base de datos esté aplicada.</p>
      ) : (
        <div className="mt-5 space-y-6">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Ventas del período" value={formatARS(current.total)} />
            <StatCard label="Pedidos" value={current.orders.toLocaleString("es-AR")} />
            <StatCard label="Unidades" value={current.units.toLocaleString("es-AR")} />
            <StatCard label="Ticket promedio" value={formatARS(current.avgTicket)} />
            <StatCard label="Ventas de hoy" value={formatARS(today)} />
            <StatCard label="Ventas del mes" value={formatARS(monthTotal)} />
            <StatCard label="Período anterior" value={formatARS(previous.total)} />
            <StatCard label="Variación" value={comparison === null ? "—" : `${comparison >= 0 ? "+" : ""}${comparison.toFixed(1)}%`} />
          </div>

          <div className="rounded-xl border p-4">
            <h3 className="text-sm font-black uppercase tracking-wide">Evolución de ventas</h3>
            {current.daily.length ? (
              <div className="mt-3 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={current.daily}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="date" tickFormatter={(d) => new Date(`${d}T00:00:00`).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })} fontSize={11} />
                    <YAxis tickFormatter={(v) => `$${Number(v).toLocaleString("es-AR")}`} fontSize={11} width={70} />
                    <Tooltip formatter={(value) => formatARS(Number(value))} labelFormatter={(label) => new Date(`${label}T00:00:00`).toLocaleDateString("es-AR", { dateStyle: "long" })} />
                    <Bar dataKey="ventas" name="Ventas" fill="var(--primary)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No hay ventas confirmadas en este período.</p>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <RankList title="Productos más vendidos" rows={current.topProducts.map((p) => ({ label: p.nombre, units: p.units, revenue: p.revenue }))} />
            <RankList title="Marcas con mayor movimiento" rows={current.topBrands.map((b) => ({ label: b.brand, units: b.units, revenue: b.revenue }))} />
          </div>

          <div className="rounded-xl border p-4">
            <h3 className="text-sm font-black uppercase tracking-wide">Productos con poco stock</h3>
            {lowStock.length ? (
              <ul className="mt-3 divide-y text-sm">
                {lowStock.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate">{p.nombre} <span className="text-xs text-muted-foreground">({p.codigo})</span></span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${p.stock === 0 ? "bg-destructive/15 text-destructive" : "bg-highlight/25 text-highlight-foreground"}`}>Stock {p.stock}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No hay productos con stock menor o igual a 5.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-secondary/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-lg font-black">{value}</p>
    </div>
  );
}

function RankList({ title, rows }: { title: string; rows: { label: string; units: number; revenue: number }[] }) {
  return (
    <div className="rounded-xl border p-4">
      <h3 className="text-sm font-black uppercase tracking-wide">{title}</h3>
      {rows.length ? (
        <ul className="mt-3 divide-y text-sm">
          {rows.map((row, i) => (
            <li key={`${row.label}-${i}`} className="flex items-center justify-between gap-3 py-2">
              <span className="min-w-0 truncate"><span className="mr-2 font-black text-muted-foreground">{i + 1}.</span>{row.label}</span>
              <span className="shrink-0 text-right"><span className="font-bold">{row.units} u.</span> <span className="text-xs text-muted-foreground">{formatARS(row.revenue)}</span></span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Sin datos confirmados.</p>
      )}
    </div>
  );
}
