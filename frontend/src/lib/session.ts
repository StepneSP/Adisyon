import { storage } from "@/src/utils/storage";

const K_ROLE = "servesync.role";
const K_CODE = "servesync.code";
const K_NAME = "servesync.waiter_name";
const K_TOKEN = "servesync.token";
const K_RESTORAN_ID = "servesync.restoran_id";
const K_RESTORAN_ADI = "servesync.restoran_adi";

// Admin session keys
const K_ADMIN_TOKEN = "servesync.admin_token";
const K_ADMIN_EMAIL = "servesync.admin_email";

export type Role = "tablet" | "waiter" | "admin";

export const session = {
  async getRole(): Promise<Role | null> {
    const v = await storage.getItem<string>(K_ROLE, "");
    return v === "tablet" || v === "waiter" || v === "admin" ? v : null;
  },
  setRole: (r: Role) => storage.setItem(K_ROLE, r),
  clearRole: () => storage.removeItem(K_ROLE),

  getCode: () => storage.getItem<string>(K_CODE, ""),
  setCode: (c: string) => storage.setItem(K_CODE, c),
  clearCode: () => storage.removeItem(K_CODE),

  getWaiterName: () => storage.getItem<string>(K_NAME, ""),
  setWaiterName: (n: string) => storage.setItem(K_NAME, n),

  getToken: () => storage.getItem<string>(K_TOKEN, ""),
  setToken: (t: string) => storage.setItem(K_TOKEN, t),
  clearToken: () => storage.removeItem(K_TOKEN),

  getRestoranId: () => storage.getItem<string>(K_RESTORAN_ID, ""),
  setRestoranId: (id: string) => storage.setItem(K_RESTORAN_ID, id),
  clearRestoranId: () => storage.removeItem(K_RESTORAN_ID),

  getRestoranAdi: () => storage.getItem<string>(K_RESTORAN_ADI, ""),
  setRestoranAdi: (ad: string) => storage.setItem(K_RESTORAN_ADI, ad),
  clearRestoranAdi: () => storage.removeItem(K_RESTORAN_ADI),

  // Admin session methods
  getAdminToken: () => storage.getItem<string>(K_ADMIN_TOKEN, ""),
  setAdminToken: (t: string) => storage.setItem(K_ADMIN_TOKEN, t),
  clearAdminToken: () => storage.removeItem(K_ADMIN_TOKEN),

  getAdminEmail: () => storage.getItem<string>(K_ADMIN_EMAIL, ""),
  setAdminEmail: (e: string) => storage.setItem(K_ADMIN_EMAIL, e),
  clearAdminEmail: () => storage.removeItem(K_ADMIN_EMAIL),

  async reset() {
    await storage.removeItem(K_ROLE);
    await storage.removeItem(K_CODE);
    await storage.removeItem(K_NAME);
    await storage.removeItem(K_TOKEN);
    await storage.removeItem(K_RESTORAN_ID);
    await storage.removeItem(K_RESTORAN_ADI);
    await storage.removeItem(K_ADMIN_TOKEN);
    await storage.removeItem(K_ADMIN_EMAIL);
  },
};