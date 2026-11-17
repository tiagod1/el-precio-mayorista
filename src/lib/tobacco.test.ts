import { describe, expect, it } from "vitest";
import { isCigaretteProduct, isCashOnlyProduct } from "./tobacco";

const prod = (categoria: string, proveedor: string | null) => ({ categoria, proveedor });

describe("detección de cigarrillos", () => {
  it("incluye cigarrillos de los cuatro proveedores aunque la categoría sea la marca", () => {
    expect(isCigaretteProduct(prod("MARLBORO", "MASSALIN PARTICULARES S.R.L"))).toBe(true);
    expect(isCigaretteProduct(prod("LUCKY STRIKE", "NOBLEZA"))).toBe(true);
    expect(isCigaretteProduct(prod("KIEL", "TABACOS DON JUAN"))).toBe(true);
    expect(isCigaretteProduct(prod("MELBOURNE", "ESPERT S.A"))).toBe(true);
  });

  it("incluye la categoría CIGARRILLOS sin importar el proveedor", () => {
    expect(isCigaretteProduct(prod("CIGARRILLOS", "MASSALIN PARTICULARES S.R.L"))).toBe(true);
    expect(isCigaretteProduct(prod("Cigarrillos Nobleza", null))).toBe(true);
  });

  it("excluye artículos que no son cigarrillos de esos proveedores", () => {
    expect(isCigaretteProduct(prod("TABACOS", "NOBLEZA"))).toBe(false);
    expect(isCigaretteProduct(prod("TABACOS", "ESPERT S.A"))).toBe(false);
    expect(isCigaretteProduct(prod("NICOTINA", "MASSALIN PARTICULARES S.R.L"))).toBe(false);
    expect(isCigaretteProduct(prod("PAPELES", "ESPERT S.A"))).toBe(false);
    expect(isCigaretteProduct(prod("98 - COMBOS", "MASSALIN PARTICULARES S.R.L"))).toBe(false);
    expect(isCigaretteProduct(prod("HABANOS & PUROS", "TABACALERA SARANDI S.A."))).toBe(false);
  });

  it("excluye productos de otros proveedores", () => {
    expect(isCigaretteProduct(prod("GASEOSAS", "DISTRIBUIDORA X"))).toBe(false);
    expect(isCigaretteProduct(prod("LUCKY STRIKE", "OTRO PROVEEDOR"))).toBe(false);
    expect(isCigaretteProduct(prod("TABACOS", null))).toBe(false);
  });
});

describe("detección SOLO EFECTIVO", () => {
  it("marca productos de Massalin y Nobleza", () => {
    expect(isCashOnlyProduct({ proveedor: "MASSALIN PARTICULARES S.R.L" })).toBe(true);
    expect(isCashOnlyProduct({ proveedor: "Massalin Partientes" })).toBe(true);
    expect(isCashOnlyProduct({ proveedor: "NOBLEZA" })).toBe(true);
    expect(isCashOnlyProduct({ proveedor: "nobleza tabacalera" })).toBe(true);
  });

  it("no marca Tabacos Don Juan ni Espert", () => {
    expect(isCashOnlyProduct({ proveedor: "TABACOS DON JUAN" })).toBe(false);
    expect(isCashOnlyProduct({ proveedor: "ESPERT S.A" })).toBe(false);
    expect(isCashOnlyProduct({ proveedor: null })).toBe(false);
    expect(isCashOnlyProduct({ proveedor: "DISTRIBUIDORA X" })).toBe(false);
  });
});
