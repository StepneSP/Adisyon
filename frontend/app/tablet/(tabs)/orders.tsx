import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { theme, statusMeta } from "@/src/lib/theme";
import { api, type Order } from "@/src/lib/api";
import { session } from "@/src/lib/session";
import { useRoomSocket } from "@/src/lib/useRoomSocket";
import { SettingsSheet } from "@/src/components/SettingsSheet";
import { OrderEditor } from "@/src/components/OrderEditor";
import { KitchenTicket } from "@/src/components/KitchenTicket";
import { BillSplitter } from "@/src/components/BillSplitter";

const COLUMNS: { key: Order["status"]; title: string }[] = [
  { key: "new", title: "New" },
  { key: "preparing", title: "Preparing" },
  { key: "ready", title: "Ready" },
  { key: "served", title: "Served" },
];

const NEXT: Record<Order["status"], Order["status"] | null> = {
  new: "preparing",
  preparing: "ready",
  ready: null,        // Waiter now owns the Ready→Served transition
  served: null,
  cancelled: null,
};

export default function TabletOrders() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [restaurantName, setRestaurantName] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [ticket, setTicket] = useState<Order | null>(null);
  const [splitting, setSplitting] = useState<Order | null>(null);

  const refreshName = useCallback(async (c: string) => {
    try {
      const r = await api.getRoom(c);
      setRestaurantName(r.name);
    } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const c = await session.getCode();
      if (!c) {
        router.replace("/tablet/setup");
        return;
      }
      setCode(c);
      try {
        const [room, orderList] = await Promise.all([api.getRoom(c), api.listOrders(c, true)]);
        setRestaurantName(room.name);
        setOrders(orderList);
      } catch {}
      setLoading(false);
    })();
  }, [router]);

  const onMessage = useCallback((m: any) => {
    if (m.event === "order_created" && m.order) {
      setOrders((prev) => [m.order, ...prev.filter((o) => o.id !== m.order.id)]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } else if (m.event === "order_updated" && m.order) {
      setOrders((prev) => {
        const filtered = prev.filter((o) => o.id !== m.order.id);
        return [m.order, ...filtered];
      });
    }
  }, []);

  const { connected } = useRoomSocket(code, onMessage);

  const grouped = useMemo(() => {
    const g: Record<string, Order[]> = { new: [], preparing: [], ready: [], served: [] };
    for (const o of orders) {
      if (g[o.status]) g[o.status].push(o);
    }
    return g;
  }, [orders]);

  const advance = async (o: Order) => {
    const next = NEXT[o.status];
    if (!next || !code) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const updated = await api.updateOrderStatus(code, o.id, next);
      setOrders((prev) => prev.map((x) => (x.id === o.id ? updated : x)));
    } catch (e: any) {
      Alert.alert("Update failed", e?.message || "Try again");
    }
  };

  const cancelOrder = (o: Order) => {
    if (!code) return;
    Alert.alert("Cancel order?", `Cancel order for Table ${o.table_number}?`, [
      { text: "No", style: "cancel" },
      {
        text: "Cancel order",
        style: "destructive",
        onPress: async () => {
          try {
            const updated = await api.updateOrderStatus(code, o.id, "cancelled");
            setOrders((prev) => prev.map((x) => (x.id === o.id ? updated : x)));
          } catch {}
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.restaurantName}>{restaurantName || "Kitchen"}</Text>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: connected ? theme.color.success : theme.color.error }]} />
            <Text style={styles.statusText}>{connected ? "Live" : "Reconnecting…"}</Text>
          </View>
        </View>
        <View style={styles.codeChip}>
          <Text style={styles.codeChipLabel}>Pairing code</Text>
          <Text testID="pairing-code-text" style={styles.codeChipValue}>{code || "----"}</Text>
        </View>
        <Pressable testID="tablet-settings-button" onPress={() => setShowSettings(true)} style={styles.iconBtn}>
          <Feather name="settings" size={20} color={theme.color.onSurface} />
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={theme.color.brand} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.board}
        >
          {COLUMNS.map((col) => {
            const list = grouped[col.key] || [];
            const meta = statusMeta[col.key];
            return (
              <View key={col.key} style={styles.column}>
                <View style={styles.columnHeader}>
                  <View style={[styles.columnDot, { backgroundColor: meta.color }]} />
                  <Text style={styles.columnTitle}>{col.title}</Text>
                  <Text style={styles.columnCount}>{list.length}</Text>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
                  {list.length === 0 ? (
                    <View style={styles.emptyCol}>
                      <Text style={styles.emptyText}>—</Text>
                    </View>
                  ) : (
                    list.map((o) => (
                      <View key={o.id} style={[styles.card, { borderLeftColor: meta.color }]}>
                        <View style={styles.cardTop}>
                          <Text style={styles.tableTag}>Table {o.table_number}</Text>
                          <Text style={styles.total}>${o.total.toFixed(2)}</Text>
                        </View>
                        <Text style={styles.waiter}>by {o.waiter_name}</Text>
                        <View style={styles.lines}>
                          {o.lines.map((l, i) => (
                            <View key={i} style={styles.line}>
                              <Text style={styles.lineQty}>{l.quantity}×</Text>
                              <Text style={styles.lineName}>{l.name}</Text>
                            </View>
                          ))}
                        </View>
                        {o.notes ? <Text style={styles.notes}>Note: {o.notes}</Text> : null}

                        {/* Action buttons */}
                        {o.status !== "served" && o.status !== "cancelled" ? (
                          <View style={styles.actions}>
                            <Pressable
                              testID={`edit-order-${o.id}`}
                              onPress={() => setEditing(o)}
                              style={styles.editBtn}
                            >
                              <Feather name="edit-2" size={14} color={theme.color.onSurface} />
                              <Text style={styles.editBtnText}>Edit</Text>
                            </Pressable>
                            <Pressable
                              testID={`ticket-order-${o.id}`}
                              onPress={() => setTicket(o)}
                              style={styles.editBtn}
                            >
                              <Feather name="printer" size={14} color={theme.color.onSurface} />
                              <Text style={styles.editBtnText}>Ticket</Text>
                            </Pressable>
                            <Pressable
                              testID={`cancel-order-${o.id}`}
                              onPress={() => cancelOrder(o)}
                              style={styles.cancelBtn}
                            >
                              <Feather name="x" size={14} color={theme.color.error} />
                            </Pressable>
                          </View>
                        ) : o.status === "served" ? (
                          <View style={styles.actions}>
                            <Pressable
                              testID={`ticket-order-${o.id}`}
                              onPress={() => setTicket(o)}
                              style={styles.editBtn}
                            >
                              <Feather name="printer" size={14} color={theme.color.onSurface} />
                              <Text style={styles.editBtnText}>Ticket</Text>
                            </Pressable>
                            <Pressable
                              testID={`split-order-${o.id}`}
                              onPress={() => setSplitting(o)}
                              style={styles.editBtn}
                            >
                              <Feather name="divide" size={14} color={theme.color.onSurface} />
                              <Text style={styles.editBtnText}>Split bill</Text>
                            </Pressable>
                          </View>
                        ) : null}

                        {o.status === "ready" ? (
                          <View style={styles.waitingHint}>
                            <Feather name="clock" size={14} color={theme.color.success} />
                            <Text style={styles.waitingHintText}>Waiting for waiter to serve</Text>
                          </View>
                        ) : NEXT[o.status] ? (
                          <Pressable
                            testID={`advance-order-${o.id}`}
                            style={[styles.advanceBtn, { backgroundColor: meta.color }]}
                            onPress={() => advance(o)}
                          >
                            <Text style={styles.advanceBtnText}>
                              Mark {statusMeta[NEXT[o.status]!].label}
                            </Text>
                            <Feather name="arrow-right" size={16} color="#fff" />
                          </Pressable>
                        ) : null}
                      </View>
                    ))
                  )}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      )}

      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        variant="tablet"
        onUpdated={() => code && refreshName(code)}
      />
      <OrderEditor
        visible={!!editing}
        onClose={() => setEditing(null)}
        code={code || ""}
        order={editing}
        onSaved={(o) => setOrders((prev) => prev.map((x) => (x.id === o.id ? o : x)))}
      />
      <KitchenTicket
        visible={!!ticket}
        onClose={() => setTicket(null)}
        code={code || ""}
        order={ticket}
      />
      <BillSplitter
        visible={!!splitting}
        onClose={() => setSplitting(null)}
        order={splitting}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  topBar: {
    flexDirection: "row",
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    alignItems: "center",
    gap: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
  },
  restaurantName: { fontSize: theme.font.xl, fontWeight: "700", color: theme.color.onSurface },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted },
  codeChip: {
    backgroundColor: theme.color.brand,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.sm,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  codeChipLabel: { color: theme.color.brandTint, fontSize: 10, textTransform: "uppercase", letterSpacing: 1 },
  codeChipValue: { color: theme.color.onBrand, fontSize: 28, fontWeight: "800", letterSpacing: 4 },
  iconBtn: {
    width: 44, height: 44, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  board: { padding: theme.space.md, gap: theme.space.md },
  column: {
    width: 300,
    backgroundColor: theme.color.surfaceTertiary,
    borderRadius: theme.radius.lg,
    padding: theme.space.md,
    marginRight: theme.space.md,
  },
  columnHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.sm,
    paddingBottom: theme.space.md,
  },
  columnDot: { width: 10, height: 10, borderRadius: 5 },
  columnTitle: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface, flex: 1 },
  columnCount: {
    backgroundColor: theme.color.surfaceSecondary,
    color: theme.color.onSurfaceMuted,
    paddingHorizontal: 10, paddingVertical: 2, borderRadius: theme.radius.pill,
    fontSize: theme.font.sm, fontWeight: "600",
  },
  emptyCol: { alignItems: "center", padding: theme.space.xl },
  emptyText: { color: theme.color.borderStrong, fontSize: theme.font.xl },
  card: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    borderLeftWidth: 4,
    gap: theme.space.xs,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tableTag: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.onSurface },
  total: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.brand },
  waiter: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted },
  lines: { marginTop: theme.space.sm, gap: 2 },
  line: { flexDirection: "row", gap: theme.space.sm },
  lineQty: { color: theme.color.brand, fontWeight: "700", fontSize: theme.font.base, minWidth: 24 },
  lineName: { color: theme.color.onSurface, fontSize: theme.font.base, flex: 1 },
  notes: { color: theme.color.info, fontSize: theme.font.sm, fontStyle: "italic", marginTop: theme.space.sm },
  actions: { flexDirection: "row", gap: theme.space.sm, marginTop: theme.space.sm },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: theme.space.md, paddingVertical: 6,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.surfaceTertiary,
  },
  editBtnText: { fontSize: theme.font.sm, color: theme.color.onSurface, fontWeight: "600" },
  cancelBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "#FCE9E9",
  },
  advanceBtn: {
    marginTop: theme.space.sm,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
  },
  advanceBtnText: { color: "#fff", fontWeight: "700", fontSize: theme.font.base },
  waitingHint: {
    marginTop: theme.space.sm,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#E3EFE5",
  },
  waitingHintText: { color: theme.color.success, fontWeight: "600", fontSize: theme.font.sm },
});
