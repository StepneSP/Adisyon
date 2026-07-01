const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "";

export const API = `${BASE}/api`;

export function wsUrl(code: string): string {
  const base = BASE.replace(/^http/, "ws");
  return `${base}/api/ws/${code}`;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => "");
    throw new Error(text || `HTTP ${r.status}`);
  }
  return r.json();
}

export type Room = { id: string; code: string; name: string; created_at: string };
export type Category = { id: string; room_code: string; name: string; sort: number };
export type MenuItem = {
  id: string;
  room_code: string;
  name: string;
  price: number;
  category_id: string;
  description: string;
  available: boolean;
};
export type OrderLine = {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
};
export type Order = {
  id: string;
  room_code: string;
  table_number: string;
  waiter_name: string;
  lines: OrderLine[];
  notes: string;
  status: "new" | "preparing" | "ready" | "served" | "cancelled";
  total: number;
  created_at: string;
  updated_at: string;
};

export const api = {
  createRoom: (name: string) =>
    req<Room>("/rooms", { method: "POST", body: JSON.stringify({ name }) }),
  getRoom: (code: string) => req<Room>(`/rooms/${code}`),
  updateRoom: (code: string, name: string) =>
    req<Room>(`/rooms/${code}`, { method: "PUT", body: JSON.stringify({ name }) }),
  regenerateCode: (code: string) =>
    req<Room>(`/rooms/${code}/regenerate`, { method: "POST" }),

  listCategories: (code: string) => req<Category[]>(`/rooms/${code}/categories`),
  addCategory: (code: string, name: string) =>
    req<Category>(`/rooms/${code}/categories`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  updateCategory: (code: string, id: string, name: string) =>
    req<Category>(`/rooms/${code}/categories/${id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  deleteCategory: (code: string, id: string) =>
    req<{ ok: true }>(`/rooms/${code}/categories/${id}`, { method: "DELETE" }),

  listItems: (code: string) => req<MenuItem[]>(`/rooms/${code}/items`),
  addItem: (
    code: string,
    payload: {
      name: string;
      price: number;
      category_id: string;
      description?: string;
      available?: boolean;
    },
  ) =>
    req<MenuItem>(`/rooms/${code}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateItem: (
    code: string,
    id: string,
    payload: Partial<{
      name: string;
      price: number;
      category_id: string;
      description: string;
      available: boolean;
    }>,
  ) =>
    req<MenuItem>(`/rooms/${code}/items/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteItem: (code: string, id: string) =>
    req<{ ok: true }>(`/rooms/${code}/items/${id}`, { method: "DELETE" }),

  listOrders: (code: string, activeOnly = false) =>
    req<Order[]>(`/rooms/${code}/orders${activeOnly ? "?active_only=true" : ""}`),
  createOrder: (
    code: string,
    payload: {
      table_number: string;
      waiter_name: string;
      lines: { item_id: string; quantity: number; notes?: string }[];
      notes?: string;
    },
  ) =>
    req<Order>(`/rooms/${code}/orders`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateOrderStatus: (code: string, id: string, status: Order["status"]) =>
    req<Order>(`/rooms/${code}/orders/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
  editOrder: (
    code: string,
    id: string,
    payload: {
      table_number?: string;
      notes?: string;
      lines?: { item_id: string; quantity: number; notes?: string }[];
    },
  ) =>
    req<Order>(`/rooms/${code}/orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),

  stats: (code: string) =>
    req<{
      today_orders: number;
      today_revenue: number;
      week_orders: number;
      week_revenue: number;
      top_items: { item_id: string; name: string; quantity: number; revenue: number }[];
      waiters: { name: string; orders: number; revenue: number }[];
    }>(`/rooms/${code}/stats`),
};
