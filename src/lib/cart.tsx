import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = { codigo: string; nombre: string; precio: number; qty: number };

type CartCtx = {
  items: CartItem[];
  add: (item: Omit<CartItem, "qty">, qty?: number) => void;
  setQty: (codigo: string, qty: number) => void;
  remove: (codigo: string) => void;
  clear: () => void;
  count: number;
  total: number;
};

const Ctx = createContext<CartCtx | null>(null);
const KEY = "epm-carrito-v1";

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, loaded]);

  const value = useMemo<CartCtx>(() => ({
    items,
    add: (item, qty = 1) =>
      setItems((prev) => {
        const ex = prev.find((p) => p.codigo === item.codigo);
        if (ex) return prev.map((p) => (p.codigo === item.codigo ? { ...p, qty: p.qty + qty } : p));
        return [...prev, { ...item, qty }];
      }),
    setQty: (codigo, qty) =>
      setItems((prev) =>
        qty <= 0 ? prev.filter((p) => p.codigo !== codigo) : prev.map((p) => (p.codigo === codigo ? { ...p, qty } : p)),
      ),
    remove: (codigo) => setItems((prev) => prev.filter((p) => p.codigo !== codigo)),
    clear: () => setItems([]),
    count: items.reduce((s, i) => s + i.qty, 0),
    total: items.reduce((s, i) => s + i.qty * i.precio, 0),
  }), [items]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useCart fuera de CartProvider");
  return c;
}
