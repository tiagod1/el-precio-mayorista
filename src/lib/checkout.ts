import { z } from "zod";
import { buildWhatsAppMessage } from "./import-rules";
import { isCashOnly } from "./catalog-rules";

export const customerSchema = z.object({
  customerNumber: z.string().trim().min(1, "Completá el número de cliente.").max(50, "Máximo 50 caracteres.").regex(/^[\p{L}\p{N} ._/-]+$/u, "Número de cliente inválido."),
  fullName: z.string().trim().min(1, "Completá el nombre y apellido.").max(150, "Máximo 150 caracteres."),
  phone: z.string().trim().min(1, "Completá el número de teléfono.").max(30, "Máximo 30 caracteres.").regex(/^\+?[\d\s().-]+$/, "Ingresá un teléfono válido.").refine((value) => value.replace(/\D/g, "").length >= 6 && value.replace(/\D/g, "").length <= 15, "Ingresá un teléfono válido."),
  deliveryAddress: z.string().trim().min(1, "Completá la dirección de entrega.").max(300, "Máximo 300 caracteres."),
});

export type CustomerData = z.infer<typeof customerSchema>;
export const emptyCustomer: CustomerData = { customerNumber: "", fullName: "", phone: "", deliveryAddress: "" };

const orderItemsSchema = z.array(z.object({
  codigo: z.string().trim().min(1).max(100),
  nombre: z.string().trim().min(1).max(1000),
  precio: z.number().finite().nonnegative(),
  qty: z.number().int().positive(),
  proveedor: z.string().nullable().optional(),
})).min(1);

export function prepareCustomerOrder(customerInput: CustomerData, itemInput: z.input<typeof orderItemsSchema>) {
  const customer = customerSchema.parse(customerInput);
  const items = orderItemsSchema.parse(itemInput);
  const details = [
    `Número de cliente: ${customer.customerNumber}`,
    `Nombre y apellido: ${customer.fullName}`,
    `Número de teléfono: ${customer.phone}`,
    `Dirección de entrega: ${customer.deliveryAddress}`,
  ].join("\n");
  const message = `${details}\n\n${buildWhatsAppMessage(items.map((item) => ({ ...item, nombre: isCashOnly(item) ? `${item.nombre} (SOLO EFECTIVO)` : item.nombre })))}`;
  return { customer, items, total: items.reduce((total, item) => total + item.precio * item.qty, 0), message };
}