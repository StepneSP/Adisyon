import { storage } from "@/src/utils/storage";

const K_ROLE = "servesync.role";
const K_CODE = "servesync.code";
const K_NAME = "servesync.waiter_name";

export type Role = "tablet" | "waiter";

export const session = {
  async getRole(): Promise<Role | null> {
    const v = await storage.getItem<string>(K_ROLE, "");
    return v === "tablet" || v === "waiter" ? v : null;
  },
  setRole: (r: Role) => storage.setItem(K_ROLE, r),
  clearRole: () => storage.removeItem(K_ROLE),

  getCode: () => storage.getItem<string>(K_CODE, ""),
  setCode: (c: string) => storage.setItem(K_CODE, c),
  clearCode: () => storage.removeItem(K_CODE),

  getWaiterName: () => storage.getItem<string>(K_NAME, ""),
  setWaiterName: (n: string) => storage.setItem(K_NAME, n),

  async reset() {
    await storage.removeItem(K_ROLE);
    await storage.removeItem(K_CODE);
    await storage.removeItem(K_NAME);
  },
};
