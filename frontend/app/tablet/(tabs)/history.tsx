import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme, statusMeta } from "@/src/lib/theme";
import { api, type Order } from "@/src/lib/api";
import { session } from "@/src/lib/session";

type Stats = Awaited<ReturnType<typeof api.stats>>;

export default function TabletHistory() {
  const router = useRouter();
  const [code, setCode] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (c: string) => {
    const [s, o] = await Promise.all([api.stats(c), api.listOrders(c, false)]);
    setStats(s);
    setOrders(o);
  }, []);

  useEffect(() => {
    (async () => {
      const c = await session.getCode();
      if (!c) return;
      setCode(c);
      await load(c);
      setLoading(false);
    })();
  }, [load]);

  const onRefresh = async () => {
    if (!code) return;
    setRefreshing(true);
    await load(code);
    setRefreshing(false);
  };

  const switchRole = async () => {
    Alert.alert(
      "Switch device role?",
      "This will disconnect this device from the current restaurant. You'll be able to reconnect using the pairing code.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          style: "destructive",
          onPress: async () => {
            await session.reset();
            router.replace("/");
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={theme.color.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.title}>History</Text>
        <Pressable testID="switch-role-button" onPress={switchRole} style={styles.roleBtn}>
          <Feather name="log-out" size={18} color={theme.color.onSurfaceMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.color.brand} />}
      >
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Today</Text>
            <Text style={styles.statValue}>${stats?.today_revenue.toFixed(2)}</Text>
            <Text style={styles.statSub}>{stats?.today_orders} orders</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>This week</Text>
            <Text style={styles.statValue}>${stats?.week_revenue.toFixed(2)}</Text>
            <Text style={styles.statSub}>{stats?.week_orders} orders</Text>
          </View>
        </View>

        {stats && stats.top_items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top items today</Text>
            {stats.top_items.map((t, i) => (
              <View key={t.item_id} style={styles.rowItem}>
                <Text style={styles.rowRank}>#{i + 1}</Text>
                <Text style={styles.rowName}>{t.name}</Text>
                <Text style={styles.rowQty}>{t.quantity}×</Text>
                <Text style={styles.rowRevenue}>${t.revenue.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        {stats && stats.waiters.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Waiters today</Text>
            {stats.waiters.map((w) => (
              <View key={w.name} style={styles.rowItem}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{w.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.rowName}>{w.name}</Text>
                <Text style={styles.rowQty}>{w.orders} orders</Text>
                <Text style={styles.rowRevenue}>${w.revenue.toFixed(2)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All orders</Text>
          {orders.length === 0 ? (
            <Text style={styles.empty}>No orders yet.</Text>
          ) : (
            orders.map((o) => {
              const meta = statusMeta[o.status];
              return (
                <View key={o.id} style={styles.orderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.orderTable}>Table {o.table_number}</Text>
                    <Text style={styles.orderMeta}>
                      {o.waiter_name} · {new Date(o.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {o.lines.length} items
                    </Text>
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: meta.bg }]}>
                    <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
                  </View>
                  <Text style={styles.orderTotal}>${o.total.toFixed(2)}</Text>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
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
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
    backgroundColor: theme.color.surfaceSecondary,
  },
  title: { fontSize: theme.font.xxl, fontWeight: "700", color: theme.color.onSurface },
  roleBtn: {
    width: 40, height: 40, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  statsRow: { flexDirection: "row", gap: theme.space.md, padding: theme.space.lg },
  statCard: {
    flex: 1, padding: theme.space.lg,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.lg,
    borderWidth: 1, borderColor: theme.color.border,
    gap: theme.space.xs,
  },
  statLabel: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 1 },
  statValue: { fontSize: 28, fontWeight: "800", color: theme.color.onSurface },
  statSub: { fontSize: theme.font.sm, color: theme.color.brand, fontWeight: "600" },
  section: { paddingHorizontal: theme.space.lg, paddingTop: theme.space.lg, gap: theme.space.sm },
  sectionTitle: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface, marginBottom: theme.space.sm },
  rowItem: {
    flexDirection: "row", alignItems: "center", gap: theme.space.md,
    paddingVertical: theme.space.md, paddingHorizontal: theme.space.md,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border,
    marginBottom: theme.space.sm,
  },
  rowRank: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.brand, width: 32 },
  rowName: { flex: 1, fontSize: theme.font.base, color: theme.color.onSurface, fontWeight: "600" },
  rowQty: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted },
  rowRevenue: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.onSurface, minWidth: 70, textAlign: "right" },
  avatar: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: theme.color.brandTint,
    alignItems: "center", justifyContent: "center",
  },
  avatarText: { color: theme.color.brand, fontWeight: "700" },
  orderRow: {
    flexDirection: "row", alignItems: "center", gap: theme.space.md,
    paddingVertical: theme.space.md, paddingHorizontal: theme.space.md,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border,
    marginBottom: theme.space.sm,
  },
  orderTable: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.onSurface },
  orderMeta: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  orderTotal: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.brand, minWidth: 70, textAlign: "right" },
  statusPill: { paddingHorizontal: theme.space.sm, paddingVertical: 4, borderRadius: theme.radius.pill },
  statusText: { fontSize: theme.font.sm, fontWeight: "700" },
  empty: { color: theme.color.onSurfaceMuted, paddingVertical: theme.space.lg, textAlign: "center" },
});
