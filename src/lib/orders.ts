import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

export type OrderPayloadItem = {
  product_id: string;
  promotion_id?: string | null;
  codigo: string;
  nombre: string;
  qty: number;
  precio_base: number;
  precio_unitario: number;
};

export type CustomerOrderItem = {
  product_id: string | null;
  codigo: string;
  nombre: string;
  qty: number;
  precio_unitario: number;
};

export type CustomerOrder = {
  id: string;
  created_at: string;
  total: number;
  items: CustomerOrderItem[];
};

export type CreatedOrder = {
  order_id: string;
  access_token: string;
};

export type BestSeller = {
  codigo: string;
  nombre: string;
  units: number;
};

export function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "");
}

export function customerTokenKey(phone: string, name: string) {
  return `epm-cliente-${normalizePhone(phone)}-${name.trim().toLowerCase()}`;
}

export function getStoredCustomerToken(phone: string, name: string) {
  try {
    return localStorage.getItem(customerTokenKey(phone, name)) ?? "";
  } catch {
    return "";
  }
}

export function storeCustomerToken(phone: string, name: string, token: string) {
  try {
    localStorage.setItem(customerTokenKey(phone, name), token);
  } catch {
    // localStorage no disponible
  }
}

export async function createPendingOrder(customerName: string, customerPhone: string, items: OrderPayloadItem[], token = ""): Promise<CreatedOrder> {
  const { data, error } = await supabase.rpc("create_customer_order", {
    p_name: customerName.trim(),
    p_phone: normalizePhone(customerPhone),
    p_items: items as unknown as Json,
    p_token: token,
  });
  if (error) throw error;
  const row = data as { order_id?: string; access_token?: string } | null;
  if (!row?.order_id || !row.access_token) throw new Error("Respuesta inválida al registrar el pedido");
  return { order_id: row.order_id, access_token: row.access_token };
}

export async function fetchCustomerOrderHistory(customerName: string, customerPhone: string, token: string): Promise<CustomerOrder[]> {
  const { data, error } = await supabase.rpc("get_customer_order_history", {
    p_name: customerName.trim(),
    p_phone: normalizePhone(customerPhone),
    p_token: token.trim(),
  });
  if (error) throw error;
  return Array.isArray(data) ? (data as CustomerOrder[]) : [];
}

export async function fetchBestSellers(limit = 12): Promise<BestSeller[]> {
  const { data, error } = await supabase.rpc("get_best_sellers", { p_limit: limit });
  if (error) throw error;
  return Array.isArray(data) ? (data as BestSeller[]) : [];
}

export async function confirmOrder(orderId: string) {
  const { error } = await supabase.rpc("confirm_order", { p_order_id: orderId });
  if (error) throw error;
}

export async function cancelOrder(orderId: string, restock: boolean) {
  const { error } = await supabase.rpc("cancel_order", { p_order_id: orderId, p_restock: restock });
  if (error) throw error;
}
