const BASE = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000";

export const API = `${BASE}/api`;

export function wsUrl(code: string): string {
  const base = BASE.replace(/^http/, "ws");
  return `${base}/api/ws/${code}`;
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  // Get token from session if available
  const token = await getAuthToken();
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };
  
  // Add Authorization header if token exists
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const fullUrl = `${API}${path}`;
  console.log(`🔵 API Request: ${opts.method || "GET"} ${fullUrl}`);
  
  try {
    const r = await fetch(fullUrl, {
      ...opts,
      headers,
    });
    
    console.log(`✅ API Response: ${opts.method || "GET"} ${path} - Status: ${r.status}`);
    
    if (!r.ok) {
      const text = await r.text().catch(() => "");
      console.error(`❌ API Error: ${r.status} - ${text}`);
      throw new Error(text || `HTTP ${r.status}`);
    }
    return r.json();
  } catch (error) {
    console.error(`❌ API Request Failed: ${opts.method || "GET"} ${path}`, error);
    throw error;
  }
}

// Helper to get auth token from storage
async function getAuthToken(): Promise<string | null> {
  try {
    const { session } = await import("./session");
    return await session.getToken();
  } catch {
    return null;
  }
}

// ==================== AUTHENTICATION ====================

export type WaiterLoginPayload = {
  nickname: string;
  gunluk_kod: string;
};

export type WaiterSessionResponse = {
  session_token: string;
  nickname: string;
  restoran_id: string;
  restoran_adi: string;
  gunluk_kod: string;
};

export type WaiterInfo = {
  nickname: string;
  restoran_id: string;
  restoran_adi: string;
  gunluk_kod: string;
};

export const authApi = {
  login: (payload: WaiterLoginPayload) =>
    req<WaiterSessionResponse>("/auth/waiter/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  
  logout: () =>
    req<{ message: string }>("/auth/waiter/logout", { method: "POST" }),
  
  getMe: () =>
    req<WaiterInfo>("/auth/waiter/me"),
};

// ==================== ADMIN AUTHENTICATION ====================

export type AdminLoginPayload = {
  email: string;
  password: string;
};

export type AdminLoginResponse = {
  access_token: string;
  token_type: string;
  restaurant_id: string;
  restaurant_name: string;
  owner_email: string;
  gunluk_kod: string;
};

export type AdminInfo = {
  restaurant_id: string;
  owner_email: string;
  restaurant_name: string;
  gunluk_kod: string;
  abonelik_durumu: string;
  created_at: string;
};

export const adminApi = {
  login: (payload: AdminLoginPayload) =>
    req<AdminLoginResponse>("/admin/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  
  getMe: () =>
    req<AdminInfo>("/admin/me"),
  
  updateRestaurant: (restaurant_id: string, payload: {
    name?: string;
    gunluk_kod?: string;
    abonelik_durumu?: string;
  }) =>
    req<{ message: string; restaurant: any }>(`/admin/restaurant/${restaurant_id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  
  regenerateDailyCode: (restaurant_id: string) =>
    req<{ gunluk_kod: string }>(`/admin/restaurant/${restaurant_id}/regenerate-daily-code`, {
      method: "POST",
    }),
  
  getStats: (restaurant_id: string) =>
    req<{
      today_orders: number;
      today_revenue: number;
      week_orders: number;
      week_revenue: number;
      top_items: { item_id: string; name: string; quantity: number; revenue: number }[];
      waiters: { name: string; orders: number; revenue: number }[];
    }>(`/admin/restaurant/${restaurant_id}/stats`),
  
  getWaiters: (restaurant_id: string) =>
    req<{ name: string; total_orders: number }[]>(`/admin/restaurant/${restaurant_id}/waiters`),
};

// ==================== RESTAURANTS ====================

export type Restaurant = {
  id: string;
  name: string;
  code: string;
  gunluk_kod: string;
  abonelik_durumu: string;
  owner_email?: string;
  owner_phone?: string;
  created_at: string;
  updated_at: string;
};

export type RestaurantCreate = {
  name?: string;
  owner_email?: string;
  owner_phone?: string;
};

export type RestaurantUpdate = {
  name?: string;
  abonelik_durumu?: string;
  gunluk_kod?: string;
};

export const restaurantApi = {
  create: (payload: RestaurantCreate) =>
    req<Restaurant>("/restaurants", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  
  get: (restoran_id: string) =>
    req<Restaurant>(`/restaurants/${restoran_id}`),
  
  update: (restoran_id: string, payload: RestaurantUpdate) =>
    req<Restaurant>(`/restaurants/${restoran_id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  
  regenerateDailyCode: (restoran_id: string) =>
    req<Restaurant>(`/restaurants/${restoran_id}/regenerate-daily-code`, {
      method: "POST",
    }),
};

// Backward compatibility for tablet and other screens
export const api = {
  createRoom: (name: string) =>
    req<Restaurant>("/restaurants", { method: "POST", body: JSON.stringify({ name }) }),
  getRoom: (code: string) => req<Restaurant>(`/restaurants/${code}`),
  updateRoom: (code: string, name: string) =>
    req<Restaurant>(`/restaurants/${code}`, { method: "PUT", body: JSON.stringify({ name }) }),
  regenerateCode: (code: string) =>
    req<Restaurant>(`/restaurants/${code}/regenerate-daily-code`, { method: "POST" }),

  listCategories: (restoran_id: string) => req<Category[]>(`/restaurants/${restoran_id}/categories`),
  addCategory: (restoran_id: string, name: string) =>
    req<Category>(`/restaurants/${restoran_id}/categories`, { method: "POST", body: JSON.stringify({ name }) }),
  updateCategory: (restoran_id: string, cat_id: string, name: string) =>
    req<Category>(`/restaurants/${restoran_id}/categories/${cat_id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteCategory: (restoran_id: string, cat_id: string) =>
    req<{ ok: true }>(`/restaurants/${restoran_id}/categories/${cat_id}`, { method: "DELETE" }),

  listItems: (restoran_id: string) => req<MenuItem[]>(`/restaurants/${restoran_id}/items`),
  addItem: (restoran_id: string, payload: { name: string; price: number; category_id: string; description?: string; available?: boolean }) =>
    req<MenuItem>(`/restaurants/${restoran_id}/items`, { method: "POST", body: JSON.stringify(payload) }),
  updateItem: (restoran_id: string, item_id: string, payload: Partial<{ name: string; price: number; category_id: string; description: string; available: boolean }>) =>
    req<MenuItem>(`/restaurants/${restoran_id}/items/${item_id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteItem: (restoran_id: string, item_id: string) =>
    req<{ ok: true }>(`/restaurants/${restoran_id}/items/${item_id}`, { method: "DELETE" }),

  listOrders: (restoran_id: string, activeOnly = false) =>
    req<Order[]>(`/restaurants/${restoran_id}/orders${activeOnly ? "?active_only=true" : ""}`),
  createOrder: (restoran_id: string, payload: { table_number: string; waiter_name: string; lines: { item_id: string; quantity: number; notes?: string }[]; notes?: string }) =>
    req<Order>(`/restaurants/${restoran_id}/orders`, { method: "POST", body: JSON.stringify(payload) }),
  updateOrderStatus: (restoran_id: string, order_id: string, status: Order["status"]) =>
    req<Order>(`/restaurants/${restoran_id}/orders/${order_id}/status`, { method: "PUT", body: JSON.stringify({ status }) }),
  editOrder: (restoran_id: string, order_id: string, payload: { table_number?: string; notes?: string; lines?: { item_id: string; quantity: number; notes?: string }[] }) =>
    req<Order>(`/restaurants/${restoran_id}/orders/${order_id}`, { method: "PUT", body: JSON.stringify(payload) }),

  stats: (restoran_id: string) =>
    req<{ today_orders: number; today_revenue: number; week_orders: number; week_revenue: number; top_items: { item_id: string; name: string; quantity: number; revenue: number }[]; waiters: { name: string; orders: number; revenue: number }[] }>(`/restaurants/${restoran_id}/stats`),
};

// ==================== CATEGORIES ====================

export type Category = {
  id: string;
  restoran_id: string;
  name: string;
  sort: number;
};

export const categoryApi = {
  list: (restoran_id: string) =>
    req<Category[]>(`/restaurants/${restoran_id}/categories`),
  
  create: (restoran_id: string, name: string) =>
    req<Category>(`/restaurants/${restoran_id}/categories`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  
  update: (restoran_id: string, cat_id: string, name: string) =>
    req<Category>(`/restaurants/${restoran_id}/categories/${cat_id}`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),
  
  delete: (restoran_id: string, cat_id: string) =>
    req<{ ok: true }>(`/restaurants/${restoran_id}/categories/${cat_id}`, {
      method: "DELETE",
    }),
};

// ==================== MENU ITEMS ====================

export type MenuItem = {
  id: string;
  restoran_id: string;
  name: string;
  price: number;
  category_id: string;
  description: string;
  available: boolean;
};

export const menuItemApi = {
  list: (restoran_id: string) =>
    req<MenuItem[]>(`/restaurants/${restoran_id}/items`),
  
  create: (restoran_id: string, payload: {
    name: string;
    price: number;
    category_id: string;
    description?: string;
    available?: boolean;
  }) =>
    req<MenuItem>(`/restaurants/${restoran_id}/items`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  
  update: (restoran_id: string, item_id: string, payload: Partial<{
    name: string;
    price: number;
    category_id: string;
    description: string;
    available: boolean;
  }>) =>
    req<MenuItem>(`/restaurants/${restoran_id}/items/${item_id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  
  delete: (restoran_id: string, item_id: string) =>
    req<{ ok: true }>(`/restaurants/${restoran_id}/items/${item_id}`, {
      method: "DELETE",
    }),
};

// ==================== ORDERS ====================

export type OrderLine = {
  item_id: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
};

export type Order = {
  id: string;
  restoran_id: string;
  table_number: string;
  waiter_name: string;
  lines: OrderLine[];
  notes: string;
  status: "new" | "preparing" | "ready" | "served" | "cancelled";
  total: number;
  created_at: string;
  updated_at: string;
};

export type OrderCreatePayload = {
  table_number: string;
  waiter_name: string;
  lines: { item_id: string; quantity: number; notes?: string }[];
  notes?: string;
};

export type OrderUpdatePayload = {
  table_number?: string;
  notes?: string;
  lines?: { item_id: string; quantity: number; notes?: string }[];
};

export const orderApi = {
  list: (restoran_id: string, activeOnly = false) =>
    req<Order[]>(`/restaurants/${restoran_id}/orders${activeOnly ? "?active_only=true" : ""}`),
  
  create: (restoran_id: string, payload: OrderCreatePayload) =>
    req<Order>(`/restaurants/${restoran_id}/orders`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  
  update: (restoran_id: string, order_id: string, payload: OrderUpdatePayload) =>
    req<Order>(`/restaurants/${restoran_id}/orders/${order_id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  
  updateStatus: (restoran_id: string, order_id: string, status: Order["status"]) =>
    req<Order>(`/restaurants/${restoran_id}/orders/${order_id}/status`, {
      method: "PUT",
      body: JSON.stringify({ status }),
    }),
};

// ==================== STATS ====================

export type Stats = {
  today_orders: number;
  today_revenue: number;
  week_orders: number;
  week_revenue: number;
  top_items: { item_id: string; name: string; quantity: number; revenue: number }[];
  waiters: { name: string; orders: number; revenue: number }[];
};

export const statsApi = {
  get: (restoran_id: string) =>
    req<Stats>(`/restaurants/${restoran_id}/stats`),
};

// ==================== PUSH NOTIFICATIONS ====================

export type RegisterPushPayload = {
  user_id: string;
  platform: string;
  device_token: string;
};

export const pushApi = {
  register: (payload: RegisterPushPayload) =>
    req<{ status: string }>("/register-push", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};