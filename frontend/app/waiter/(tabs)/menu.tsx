import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  FlatList,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import BottomSheet, { BottomSheetView } from "@gorhom/bottom-sheet";
import { theme } from "@/src/lib/theme";
import { api, type Category, type MenuItem } from "@/src/lib/api";
import { session } from "@/src/lib/session";
import { SettingsSheet } from "@/src/components/SettingsSheet";

type CartLine = { item: MenuItem; qty: number };

export default function WaiterMenu() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState<string | null>(null);
  const [waiterName, setWaiterName] = useState("");
  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [table, setTable] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showTableModal, setShowTableModal] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const sheetRef = useRef<BottomSheet>(null);

  useEffect(() => {
    (async () => {
      const c = await session.getCode();
      const n = await session.getWaiterName();
      if (!c || !n) {
        router.replace("/waiter/pair");
        return;
      }
      setCode(c);
      setWaiterName(n);
      try {
        const [cs, is] = await Promise.all([api.listCategories(c), api.listItems(c)]);
        setCats(cs);
        setItems(is);
        setSelectedCat(cs[0]?.id || null);
      } catch {
        Alert.alert("Connection error", "Could not load menu. Check pairing.");
      }
      setLoading(false);
    })();
  }, [router]);

  const filtered = useMemo(
    () => items.filter((i) => (selectedCat ? i.category_id === selectedCat : true)),
    [items, selectedCat],
  );

  const cartCount = useMemo(() => Object.values(cart).reduce((s, l) => s + l.qty, 0), [cart]);
  const cartTotal = useMemo(
    () => Object.values(cart).reduce((s, l) => s + l.qty * l.item.price, 0),
    [cart],
  );

  const addToCart = (it: MenuItem) => {
    if (!it.available) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setCart((prev) => {
      const cur = prev[it.id];
      return { ...prev, [it.id]: { item: it, qty: (cur?.qty || 0) + 1 } };
    });
  };
  const decCart = (id: string) => {
    setCart((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const next = { ...prev };
      if (cur.qty <= 1) {
        delete next[id];
      } else {
        next[id] = { ...cur, qty: cur.qty - 1 };
      }
      return next;
    });
  };

  const openCart = () => {
    if (cartCount === 0) return;
    sheetRef.current?.expand();
  };

  const submitOrder = async () => {
    if (!code || cartCount === 0) return;
    if (!table.trim()) {
      setShowTableModal(true);
      return;
    }
    setSubmitting(true);
    try {
      await api.createOrder(code, {
        table_number: table.trim(),
        waiter_name: waiterName,
        lines: Object.values(cart).map((l) => ({ item_id: l.item.id, quantity: l.qty })),
        notes: notes.trim(),
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setCart({});
      setNotes("");
      setTable("");
      sheetRef.current?.close();
      router.push("/waiter/(tabs)/orders");
    } catch (e: any) {
      Alert.alert("Send failed", e?.message || "Try again");
    } finally {
      setSubmitting(false);
    }
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
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Hi {waiterName.split(" ")[0]}</Text>
          <Pressable testID="table-selector" onPress={() => setShowTableModal(true)} style={styles.tablePick}>
            <Feather name="grid" size={14} color={theme.color.brand} />
            <Text style={styles.tablePickText}>
              {table ? `Table ${table}` : "Choose table"}
            </Text>
            <Feather name="chevron-down" size={14} color={theme.color.brand} />
          </Pressable>
        </View>
        <Pressable
          testID="waiter-settings-button"
          onPress={() => setShowSettings(true)}
          style={styles.iconBtn}
        >
          <Feather name="settings" size={18} color={theme.color.onSurfaceMuted} />
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsContent}
        >
          {cats.map((c) => {
            const active = c.id === selectedCat;
            return (
              <Pressable
                key={c.id}
                testID={`waiter-category-chip-${c.id}`}
                onPress={() => setSelectedCat(c.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ padding: theme.space.lg, paddingBottom: 120, gap: theme.space.md }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="coffee" size={40} color={theme.color.borderStrong} />
            <Text style={styles.emptyText}>No items in this category yet.</Text>
          </View>
        }
        renderItem={({ item: it }) => {
          const qty = cart[it.id]?.qty || 0;
          return (
            <View style={[styles.itemCard, !it.available && styles.itemOff]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it.name}</Text>
                {it.description ? <Text style={styles.itemDesc}>{it.description}</Text> : null}
                <Text style={styles.itemPrice}>${it.price.toFixed(2)}</Text>
                {!it.available ? <Text style={styles.oosText}>Out of stock</Text> : null}
              </View>
              {it.available ? (
                qty > 0 ? (
                  <View style={styles.stepper}>
                    <Pressable testID={`dec-${it.id}`} onPress={() => decCart(it.id)} style={styles.stepBtn}>
                      <Feather name="minus" size={16} color="#fff" />
                    </Pressable>
                    <Text style={styles.stepQty}>{qty}</Text>
                    <Pressable testID={`inc-${it.id}`} onPress={() => addToCart(it)} style={styles.stepBtn}>
                      <Feather name="plus" size={16} color="#fff" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    testID={`add-${it.id}`}
                    onPress={() => addToCart(it)}
                    style={styles.addCircle}
                  >
                    <Feather name="plus" size={22} color="#fff" />
                  </Pressable>
                )
              ) : null}
            </View>
          );
        }}
      />

      {/* Fixed cart bar */}
      {cartCount > 0 && (
        <Pressable
          testID="open-cart-button"
          style={[styles.cartBar, { bottom: 16 + insets.bottom }]}
          onPress={openCart}
        >
          <View style={styles.cartBadge}>
            <Text style={styles.cartBadgeText}>{cartCount}</Text>
          </View>
          <Text style={styles.cartBarText}>Review order</Text>
          <Text style={styles.cartBarTotal}>${cartTotal.toFixed(2)}</Text>
        </Pressable>
      )}

      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={["70%"]}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: theme.color.surfaceSecondary }}
        handleIndicatorStyle={{ backgroundColor: theme.color.borderStrong }}
      >
        <BottomSheetView style={{ flex: 1 }}>
          <View style={styles.sheetContent}>
            <Text style={styles.sheetTitle}>Order for {table ? `Table ${table}` : "…"}</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {Object.values(cart).map((l) => (
                <View key={l.item.id} style={styles.cartLine}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.cartLineName}>{l.item.name}</Text>
                    <Text style={styles.cartLinePrice}>${l.item.price.toFixed(2)} each</Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => decCart(l.item.id)} style={styles.stepBtn}>
                      <Feather name="minus" size={14} color="#fff" />
                    </Pressable>
                    <Text style={styles.stepQty}>{l.qty}</Text>
                    <Pressable onPress={() => addToCart(l.item)} style={styles.stepBtn}>
                      <Feather name="plus" size={14} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ))}
            </ScrollView>
            <TextInput
              testID="order-notes-input"
              style={styles.notes}
              value={notes}
              onChangeText={setNotes}
              placeholder="Notes for kitchen (allergies, extras…)"
              placeholderTextColor={theme.color.onSurfaceMuted}
              multiline
            />
            <View style={styles.sheetTotalRow}>
              <Text style={styles.sheetTotalLabel}>Total</Text>
              <Text style={styles.sheetTotalValue}>${cartTotal.toFixed(2)}</Text>
            </View>
            <Pressable
              testID="submit-order-button"
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              disabled={submitting}
              onPress={submitOrder}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="send" size={16} color="#fff" />
                  <Text style={styles.submitBtnText}>Send to kitchen</Text>
                </>
              )}
            </Pressable>
          </View>
        </BottomSheetView>
      </BottomSheet>

      {/* Table modal */}
      <Modal visible={showTableModal} transparent animationType="fade" onRequestClose={() => setShowTableModal(false)}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalWrap}
        >
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>Table number</Text>
            <TextInput
              testID="table-number-input"
              style={styles.tableInput}
              value={table}
              onChangeText={(v) => setTable(v.slice(0, 12))}
              placeholder="e.g. 12 or T3"
              placeholderTextColor={theme.color.borderStrong}
              keyboardType="default"
              autoCapitalize="characters"
              autoFocus
            />
            <Pressable testID="table-confirm-button" style={styles.saveBtn} onPress={() => setShowTableModal(false)}>
              <Text style={styles.saveBtnText}>Set table</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <SettingsSheet
        visible={showSettings}
        onClose={() => setShowSettings(false)}
        variant="waiter"
        onUpdated={async () => {
          const n = await session.getWaiterName();
          if (n) setWaiterName(n);
        }}
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
  greeting: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface },
  tablePick: {
    marginTop: 4,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    backgroundColor: theme.color.brandTint,
    paddingHorizontal: theme.space.md,
    paddingVertical: 6,
    borderRadius: theme.radius.pill,
  },
  tablePickText: { color: theme.color.brand, fontWeight: "600", fontSize: theme.font.sm },
  iconBtn: {
    width: 40, height: 40, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  chipsRow: { height: 56, borderBottomWidth: 1, borderBottomColor: theme.color.border, backgroundColor: theme.color.surfaceSecondary },
  chipsContent: { paddingHorizontal: theme.space.lg, gap: theme.space.sm, alignItems: "center", height: 56 },
  chip: {
    height: 36, paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    justifyContent: "center", alignItems: "center",
    flexShrink: 0,
    borderWidth: 1, borderColor: theme.color.border,
  },
  chipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  chipText: { color: theme.color.onSurface, fontWeight: "600", fontSize: theme.font.base },
  chipTextActive: { color: theme.color.onBrand },

  itemCard: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    borderWidth: 1, borderColor: theme.color.border,
  },
  itemOff: { opacity: 0.5 },
  itemName: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface },
  itemDesc: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  itemPrice: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.brand, marginTop: 6 },
  oosText: { color: theme.color.error, fontSize: theme.font.sm, marginTop: 4 },
  addCircle: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: theme.color.brand,
    alignItems: "center", justifyContent: "center",
  },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.color.brand,
    borderRadius: theme.radius.pill,
    paddingHorizontal: 4,
    height: 40,
    gap: 6,
  },
  stepBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  stepQty: { color: "#fff", fontWeight: "700", fontSize: theme.font.base, minWidth: 20, textAlign: "center" },

  empty: { alignItems: "center", padding: theme.space.xxxl, gap: theme.space.md },
  emptyText: { color: theme.color.onSurfaceMuted },

  cartBar: {
    position: "absolute", left: 16, right: 16,
    backgroundColor: theme.color.brand,
    borderRadius: theme.radius.lg,
    paddingVertical: theme.space.md,
    paddingHorizontal: theme.space.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  cartBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center",
  },
  cartBadgeText: { color: theme.color.brand, fontWeight: "800", fontSize: theme.font.base },
  cartBarText: { flex: 1, color: "#fff", fontWeight: "700", fontSize: theme.font.lg },
  cartBarTotal: { color: "#fff", fontWeight: "800", fontSize: theme.font.lg },

  sheetContent: { padding: theme.space.lg, gap: theme.space.md, flex: 1 },
  sheetTitle: { fontSize: theme.font.xl, fontWeight: "700", color: theme.color.onSurface },
  cartLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    paddingVertical: theme.space.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.color.border,
  },
  cartLineName: { fontSize: theme.font.base, fontWeight: "600", color: theme.color.onSurface },
  cartLinePrice: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  notes: {
    borderWidth: 1, borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    minHeight: 60,
    color: theme.color.onSurface,
    backgroundColor: theme.color.surface,
    textAlignVertical: "top",
  },
  sheetTotalRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: theme.space.sm,
  },
  sheetTotalLabel: { fontSize: theme.font.lg, color: theme.color.onSurfaceMuted },
  sheetTotalValue: { fontSize: theme.font.xxl, fontWeight: "800", color: theme.color.onSurface },
  submitBtn: {
    backgroundColor: theme.color.brand,
    paddingVertical: theme.space.lg,
    borderRadius: theme.radius.md,
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    gap: theme.space.sm,
  },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: theme.font.lg },

  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: theme.space.lg },
  modal: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.lg,
    padding: theme.space.xl,
    gap: theme.space.md,
  },
  modalTitle: { fontSize: theme.font.xl, fontWeight: "700", color: theme.color.onSurface },
  tableInput: {
    fontSize: 44, fontWeight: "800",
    color: theme.color.brand,
    textAlign: "center",
    borderBottomWidth: 3, borderBottomColor: theme.color.brand,
    paddingBottom: 8,
  },
  saveBtn: { backgroundColor: theme.color.brand, paddingVertical: theme.space.md, borderRadius: theme.radius.md, alignItems: "center" },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: theme.font.lg },
});
