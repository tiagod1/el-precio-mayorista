import { describe, expect, it } from "vitest";
import { findMissingColumns, normalizeCategoria, parseNumber, processRows } from "./import-rules";

const row = (o: Partial<Record<string, unknown>>) => ({
  Codigo: "1", Nombre: "Producto", Familia: "ALMACEN", "Proveedor principal": "P", "Precio final": 100, Stock: 5, ...o,
});

describe("reglas de importación", () => {
  it("unifica cigarrillos en CIGARRILLOS", () => {
    expect(normalizeCategoria("Cigarrillos Nobleza")).toBe("CIGARRILLOS");
    expect(normalizeCategoria("CIGARRILLO MASSALIN")).toBe("CIGARRILLOS");
  });
  it("excluye artículos Jumbo Pack", () => {
    const r = processRows([row({ Nombre: "Papas JUMBO PACK 500g" }), row({ Codigo: "2" })]);
    expect(r.excluded).toBe(1);
    expect(r.products.map((p) => p.codigo)).toEqual(["2"]);
  });
  it("excluye categorías descartadas", () => {
    const r = processRows([row({ Familia: "Bazar" })], ["BAZAR"]);
    expect(r.products).toHaveLength(0);
  });
  it("detecta columnas faltantes", () => {
    expect(findMissingColumns(["Codigo", "Nombre", "Familia", "Proveedor principal", "Stock"])).toEqual(["Precio final"]);
  });
  it("rechaza precio inválido", () => {
    expect(processRows([row({ "Precio final": "abc" })]).errors).toHaveLength(1);
  });
  it("interpreta precios argentinos", () => {
    expect(parseNumber("1.234,56")).toBe(1234.56);
    expect(parseNumber("$ 2.500")).toBe(2500);
  });
});
