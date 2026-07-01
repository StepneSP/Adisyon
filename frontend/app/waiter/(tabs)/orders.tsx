import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { useToast } from "@/src/components/Toast";

export default function WaiterOrders() {
  const [code, setCode] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [editing, setEditing] = useState<Order | null>(null);
  const [ticket, setTicket] = useState<Order | null>(null);
  const [splitting, setSplitting] = useState<Order | null>(null);

  const toast = useToast();
  const statusMap = useRef<Record<string, string>>({});

  const load = useCallback(async (c: string) => {
    const list = await api.listOrders(c, false);
    setOrders(list);
    statusMap.current = Object.fromEntries(list.map((o) => [o.id, o.status]));
  }, []);

  useEffect(() => {
    (async () => {
      const c = await session.getCode();
      const n = await session.getWaiterName();
      if (!c) return;
      setCode(c);
      setName(n || "");
      await load(c);
      setLoading(false);
    })();
  }, [load]);

  const onMessage = useCallback(
    (m: any) => {
      if ((m.event === "order_created" || m.event === "order_updated") && m.order) {
        const o = m.order as Order;
        const prevStatus = statusMap.current[o.id];
        // Fire toast if MY order transitions into ready or served
        if (o.waiter_name === name && prevStatus && prevStatus !== o.status) {
          if (o.status === "ready") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            toast.show({
              kind: "success",
              title: `Table ${o.table_number} · Ready for pickup`,
              message: "The kitchen has your order ready.",
            });
          } else if (o.status === "served") {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            toast.show({
              kind: "success",
              title: `Table ${o.table_number} · Order finished`,
              message: "Marked served by the kitchen.",
            });
          }
        }
        statusMap.current[o.id] = o.status;
        setOrders((prev) => {
          const filtered = prev.filter((x) => x.id !== o.id);
          return [o, ...filtered];
        });
      }
    },
    [name, toast],
  );

  useRoomSocket(code, onMessage);

  const onRefresh = async () => {
    if (!code) return;
    setRefreshing(true);
    await load(code);
    setRefreshing(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={theme.color.brand} />
      </SafeAreaView>
    );
  }

  const mine = orders.filter((o) => o.waiter_name === name);
  const active = mine.filter((o) => ["new", "preparing", "ready"].includes(o.status));
  const past = mine.filter((o) => ["served", "cancelled"].includes(o.status));

  const renderCard = (o: Order, isPast = false) => {
    const meta = statusMeta[o.status];
    const canEdit = !isPast;
    return (
      <Pressable
        key={o.id}
        testID={`waiter-order-card-${o.id}`}
        onPress={() => canEdit && setEditing(o)}
        style={[styles.card, isPast && { opacity: 0.85 }]}
      >
        <View style={styles.cardTop}>
          <Text style={styles.tableTag}>Table {o.table_number}</Text>
          <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
          </View>
        </View>
        <View style={styles.lines}>
          {o.lines.map((l, i) => (
            <View key={i} style={styles.line}>
              <Text style={styles.lineQty}>{l.quantity}×</Text>
              <Text style={styles.lineName}>{l.name}</Text>
              <Text style={styles.linePrice}>${(l.price * l.quantity).toFixed(2)}</Text>
            </View>
          ))}
        </View>
        <View style={styles.actionsRow}>
          <Pressable
            testID={`waiter-ticket-${o.id}`}
            onPress={() => setTicket(o)}
            style={styles.smallBtn}
          >
            <Feather name="printer" size={14} color={theme.color.brand} />
            <Text style={styles.smallBtnText}>Ticket</Text>
          </Pressable>
          <Pressable
            testID={`waiter-split-${o.id}`}
            onPress={() => setSplitting(o)}
            style={styles.smallBtn}
          >
            <Feather name="divide" size={14} color={theme.color.brand} />
            <Text style={styles.smallBtnText}>Split bill</Text>
          </Pressable>
          {canEdit ? (
            <Pressable
              testID={`waiter-edit-${o.id}`}
              onPress={() => setEditing(o)}
              style={styles.smallBtn}
            >
              <Feather name="edit-2" size={14} color={theme.color.brand} />
              <Text style={styles.smallBtnText}>Edit</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.cardBottom}>
          <Text style={styles.time}>
            {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </Text>
          <Text style={styles.total}>${o.total.toFixed(2)}</Text>
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>My orders</Text>
          <Text style={styles.subtitle}>
            {active.length} active · {past.length} past
          </Text>
        </View>
        <Pressable
          testID="waiter-orders-settings-button"
          onPress={() => setShowSettings(true)}
          style={styles.iconBtn}
        >
          <Feather name="settings" size={18} color={theme.color.onSurfaceMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.md, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.color.brand} />}
      >
        {active.length > 0 && (
          <>
            <Text style={styles.section}>Active</Text>
            {active.map((o) => renderCard(o))}
          </>
        )}

        {past.length > 0 && (
          <>
            <Text style={[styles.section, { marginTop: theme.space.lg }]}>Past</Text>
            {past.map((o) => renderCard(o, true))}
          </>
        )}

        {mine.length === 0 && (
          <View style={styles.empty}>
            <Feather name="inbox" size={40} color={theme.color.borderStrong} />
            <Text style={styles.emptyText}>No orders yet. Take one from the Menu tab.</Text>
          </View>
        )}
      </ScrollView>

      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        variant="waiter"
        onUpdated={async () => {
          const n = await session.getWaiterName();
          if (n) setName(n);
        }}
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
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  header: {
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: theme.font.xxl, fontWeight: "700", color: theme.color.onSurface },
  subtitle: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  section: {
    fontSize: theme.font.sm, fontWeight: "700",
    color: theme.color.onSurfaceMuted, textTransform: "uppercase",
    letterSpacing: 1, marginBottom: theme.space.sm,
  },
  card: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    borderWidth: 1, borderColor: theme.color.border,
    marginBottom: theme.space.sm,
  },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  tableTag: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface },
  statusPill: { paddingHorizontal: theme.space.sm, paddingVertical: 4, borderRadius: theme.radius.pill },
  statusText: { fontSize: theme.font.sm, fontWeight: "700" },
  lines: { marginTop: theme.space.md, gap: 4 },
  line: { flexDirection: "row", gap: theme.space.sm, alignItems: "center" },
  lineQty: { color: theme.color.brand, fontWeight: "700", minWidth: 24 },
  lineName: { color: theme.color.onSurface, flex: 1, fontSize: theme.font.base },
  linePrice: { color: theme.color.onSurfaceMuted, fontSize: theme.font.sm },
  cardBottom: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    marginTop: theme.space.md, paddingTop: theme.space.md,
    borderTopWidth: 1, borderTopColor: theme.color.border,
    gap: theme.space.md,
  },
  time: { color: theme.color.onSurfaceMuted, fontSize: theme.font.sm },
  editHint: { flexDirection: "row", alignItems: "center", gap: 4, flex: 1, justifyContent: "center" },
  editHintText: { color: theme.color.brand, fontSize: theme.font.sm, fontWeight: "600" },
  total: { color: theme.color.brand, fontWeight: "800", fontSize: theme.font.lg },
  actionsRow: {
    flexDirection: "row",
    gap: theme.space.sm,
    marginTop: theme.space.md,
    flexWrap: "wrap",
  },
  smallBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.space.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.brandTint,
  },
  smallBtnText: { color: theme.color.brand, fontWeight: "700", fontSize: theme.font.sm },
  empty: { alignItems: "center", padding: theme.space.xxxl, gap: theme.space.md },
  emptyText: { color: theme.color.onSurfaceMuted, textAlign: "center" },
});
