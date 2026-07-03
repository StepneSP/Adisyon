import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/lib/theme";
import { adminApi, type Stats } from "@/src/lib/api";
import { session } from "@/src/lib/session";

export default function AdminDashboard() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restaurantName, setRestaurantName] = useState("");
  const [dailyCode, setDailyCode] = useState("");
  const [restaurantId, setRestaurantId] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");

  const loadData = async () => {
    try {
      const rid = await session.getRestoranId();
      if (!rid) {
        setError("Restoran bilgisi bulunamadı.");
        return;
      }

      const [adminInfo, statsData] = await Promise.all([
        adminApi.getMe(),
        adminApi.getStats(rid),
      ]);
      
      setRestaurantName(adminInfo.restaurant_name);
      setDailyCode(adminInfo.gunluk_kod);
      setStats(statsData);
      setError("");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Veri yüklenemedi";
      console.error("Dashboard error:", errorMessage);
      setError("Veri yüklenemedi. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    (async () => {
      const token = await session.getAdminToken();
      const rid = await session.getRestoranId();
      
      if (!token || !rid) {
        router.replace("/admin/login");
        return;
      }
      
      await loadData();
    })();
  }, [router]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const regenerateCode = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const response = await adminApi.regenerateDailyCode(restaurantId);
      setDailyCode(response.gunluk_kod);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err) {
      console.error("Regenerate code error:", err);
    }
  };

  const logout = async () => {
    await session.clearAdminToken();
    await session.clearAdminEmail();
    await session.clearRole();
    await session.reset();
    router.replace("/");
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={theme.color.brand} size="large" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.color.brand} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.greeting}>Hoş geldiniz</Text>
            <Text style={styles.restaurantName}>{restaurantName}</Text>
          </View>
          <Pressable onPress={logout} style={styles.logoutBtn}>
            <Feather name="log-out" size={20} color={theme.color.error} />
          </Pressable>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* Daily Code Card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.cardIcon}>
              <Feather name="key" size={24} color={theme.color.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>Günün Kodu</Text>
              <Text style={styles.cardSubtitle}>Garsonların girişi için kullanılır</Text>
            </View>
          </View>
          
          <View style={styles.codeContainer}>
            <Text style={styles.codeText}>{dailyCode}</Text>
          </View>
          
          <Pressable
            testID="regenerate-code-button"
            style={styles.regenerateBtn}
            onPress={regenerateCode}
          >
            <Feather name="refresh-cw" size={16} color="#fff" />
            <Text style={styles.regenerateBtnText}>Yeni Kod Oluştur</Text>
          </Pressable>
        </View>

        {/* Stats Cards */}
        {stats && (
          <>
            {/* Today's Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { flex: 1 }]}>
                <Feather name="shopping-bag" size={24} color={theme.color.brand} />
                <Text style={styles.statValue}>{stats.today_orders}</Text>
                <Text style={styles.statLabel}>Bugünkü Sipariş</Text>
              </View>
              <View style={[styles.statCard, { flex: 1 }]}>
                <Feather name="dollar-sign" size={24} color={theme.color.success} />
                <Text style={styles.statValue}>${stats.today_revenue.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Bugünkü Kazanç</Text>
              </View>
            </View>

            {/* Week Stats */}
            <View style={styles.statsRow}>
              <View style={[styles.statCard, { flex: 1 }]}>
                <Feather name="calendar" size={24} color={theme.color.brand} />
                <Text style={styles.statValue}>{stats.week_orders}</Text>
                <Text style={styles.statLabel}>Haftalık Sipariş</Text>
              </View>
              <View style={[styles.statCard, { flex: 1 }]}>
                <Feather name="trending-up" size={24} color={theme.color.success} />
                <Text style={styles.statValue}>${stats.week_revenue.toFixed(2)}</Text>
                <Text style={styles.statLabel}>Haftalık Kazanç</Text>
              </View>
            </View>

            {/* Top Items */}
            {stats.top_items.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Feather name="award" size={24} color={theme.color.brand} />
                  <Text style={styles.cardTitle}>En Çok Satanlar</Text>
                </View>
                {stats.top_items.slice(0, 5).map((item, index) => (
                  <View key={item.item_id} style={styles.listItem}>
                    <View style={styles.rankBadge}>
                      <Text style={styles.rankText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{item.name}</Text>
                      <Text style={styles.itemSubtitle}>{item.quantity} adet satıldı</Text>
                    </View>
                    <Text style={styles.itemRevenue}>${item.revenue.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Waiters Performance */}
            {stats.waiters.length > 0 && (
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <Feather name="users" size={24} color={theme.color.brand} />
                  <Text style={styles.cardTitle}>Garson Performansı</Text>
                </View>
                {stats.waiters.slice(0, 10).map((waiter) => (
                  <View key={waiter.name} style={styles.listItem}>
                    <View style={styles.waiterAvatar}>
                      <Text style={styles.waiterInitial}>
                        {waiter.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.itemName}>{waiter.name}</Text>
                      <Text style={styles.itemSubtitle}>{waiter.orders} sipariş</Text>
                    </View>
                    <Text style={styles.itemRevenue}>${waiter.revenue.toFixed(2)}</Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.color.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: theme.space.lg,
    gap: theme.space.md,
  },
  greeting: { fontSize: theme.font.base, color: theme.color.onSurfaceMuted },
  restaurantName: { fontSize: theme.font.xxl, fontWeight: "800", color: theme.color.onSurface, marginTop: 4 },
  logoutBtn: {
    width: 44,
    height: 44,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { color: theme.color.error, textAlign: "center", marginBottom: theme.space.lg },
  
  card: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    marginBottom: theme.space.lg,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    marginBottom: theme.space.lg,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.color.brandTint,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface },
  cardSubtitle: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  
  codeContainer: {
    backgroundColor: theme.color.brand,
    borderRadius: theme.radius.md,
    padding: theme.space.xl,
    alignItems: "center",
    marginBottom: theme.space.md,
  },
  codeText: { fontSize: 48, fontWeight: "800", color: "#fff", letterSpacing: 8 },
  
  regenerateBtn: {
    backgroundColor: theme.color.brand,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.space.sm,
  },
  regenerateBtnText: { color: "#fff", fontWeight: "700", fontSize: theme.font.base },
  
  statsRow: {
    flexDirection: "row",
    gap: theme.space.md,
    marginBottom: theme.space.md,
  },
  statCard: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.lg,
    padding: theme.space.lg,
    alignItems: "center",
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  statValue: { fontSize: theme.font.xxl, fontWeight: "800", color: theme.color.onSurface, marginTop: theme.space.sm },
  statLabel: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 4, textAlign: "center" },
  
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    paddingVertical: theme.space.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  rankBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  rankText: { color: "#fff", fontWeight: "800", fontSize: theme.font.sm },
  waiterAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.color.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  waiterInitial: { color: "#fff", fontWeight: "700", fontSize: theme.font.lg },
  itemName: { fontSize: theme.font.base, fontWeight: "600", color: theme.color.onSurface },
  itemSubtitle: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  itemRevenue: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.success },
});