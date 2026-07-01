import { useEffect, useMemo, useState } from "react";
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
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { theme } from "@/src/lib/theme";
import { api, type MenuItem, type Order, type Category } from "@/src/lib/api";

type EditLine = { item_id: string; name: string; price: number; quantity: number };

type Props = {
  visible: boolean;
  onClose: () => void;
  code: string;
  order: Order | null;
  onSaved?: (o: Order) => void;
  showFinish?: boolean;
  onFinish?: () => void;
};

export function OrderEditor({ visible, onClose, code, order, onSaved, showFinish, onFinish }: Props) {
  const [lines, setLines] = useState<EditLine[]>([]);
  const [table, setTable] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAdd, setShowAdd] = useState(false);

  const [cats, setCats] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !order) return;
    setLines(order.lines.map((l) => ({ item_id: l.item_id, name: l.name, price: l.price, quantity: l.quantity })));
    setTable(order.table_number);
    setNotes(order.notes || "");
    (async () => {
      try {
        const [cs, is] = await Promise.all([api.listCategories(code), api.listItems(code)]);
        setCats(cs);
        setItems(is);
        setSelectedCat(cs[0]?.id || null);
      } catch {}
    })();
  }, [visible, order, code]);

  const total = useMemo(() => lines.reduce((s, l) => s + l.price * l.quantity, 0), [lines]);

  const inc = (id: string) =>
    setLines((prev) => prev.map((l) => (l.item_id === id ? { ...l, quantity: l.quantity + 1 } : l)));
  const dec = (id: string) =>
    setLines((prev) =>
      prev
        .map((l) => (l.item_id === id ? { ...l, quantity: l.quantity - 1 } : l))
        .filter((l) => l.quantity > 0),
    );

  const addItem = (it: MenuItem) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.item_id === it.id);
      if (existing) {
        return prev.map((l) => (l.item_id === it.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { item_id: it.id, name: it.name, price: it.price, quantity: 1 }];
    });
  };

  const save = async () => {
    if (!order) return;
    if (lines.length === 0) {
      Alert.alert("Empty order", "Add at least one item.");
      return;
    }
    if (!table.trim()) {
      Alert.alert("Missing table", "Enter a table number.");
      return;
    }
    setBusy(true);
    try {
      const updated = await api.editOrder(code, order.id, {
        table_number: table.trim(),
        notes: notes,
        lines: lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity })),
      });
      onSaved?.(updated);
      onClose();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Try again");
    } finally {
      setBusy(false);
    }
  };

  if (!order) return null;

  const availableToAdd = items.filter(
    (i) => i.available && (selectedCat ? i.category_id === selectedCat : true),
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrap}
      >
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable testID="editor-close-button" onPress={onClose} style={styles.iconBtn}>
              <Feather name="x" size={22} color={theme.color.onSurface} />
            </Pressable>
            <Text style={styles.title}>Edit order</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.md }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Table</Text>
                <TextInput
                  testID="editor-table-input"
                  style={styles.tableInput}
                  value={table}
                  onChangeText={(v) => setTable(v.slice(0, 12))}
                  placeholder="e.g. 12 or T3"
                  placeholderTextColor={theme.color.borderStrong}
                  keyboardType="default"
                  autoCapitalize="characters"
                />
              </View>
            </View>

            <Text style={styles.sectionTitle}>Items</Text>
            {lines.length === 0 ? (
              <Text style={styles.empty}>No items. Tap “Add item” below.</Text>
            ) : (
              lines.map((l) => (
                <View key={l.item_id} style={styles.lineRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.lineName}>{l.name}</Text>
                    <Text style={styles.linePrice}>
                      ${l.price.toFixed(2)} × {l.quantity} = ${(l.price * l.quantity).toFixed(2)}
                    </Text>
                  </View>
                  <View style={styles.stepper}>
                    <Pressable testID={`edit-dec-${l.item_id}`} onPress={() => dec(l.item_id)} style={styles.stepBtn}>
                      <Feather name="minus" size={14} color="#fff" />
                    </Pressable>
                    <Text style={styles.stepQty}>{l.quantity}</Text>
                    <Pressable testID={`edit-inc-${l.item_id}`} onPress={() => inc(l.item_id)} style={styles.stepBtn}>
                      <Feather name="plus" size={14} color="#fff" />
                    </Pressable>
                  </View>
                </View>
              ))
            )}

            <Pressable testID="editor-add-item-button" onPress={() => setShowAdd(true)} style={styles.addRow}>
              <Feather name="plus-circle" size={18} color={theme.color.brand} />
              <Text style={styles.addRowText}>Add item</Text>
            </Pressable>

            <Text style={styles.label}>Notes</Text>
            <TextInput
              testID="editor-notes-input"
              style={styles.notesInput}
              value={notes}
              onChangeText={setNotes}
              placeholder="Kitchen notes (allergies, extras…)"
              placeholderTextColor={theme.color.onSurfaceMuted}
              multiline
            />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>${total.toFixed(2)}</Text>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            {showFinish && onFinish ? (
              <Pressable testID="editor-finish-button" onPress={onFinish} style={styles.finishBtn}>
                <Feather name="check-circle" size={18} color="#fff" />
                <Text style={styles.finishBtnText}>Finish order</Text>
              </Pressable>
            ) : null}
            <Pressable
              testID="editor-save-button"
              onPress={save}
              style={[styles.saveBtn, busy && { opacity: 0.6 }]}
              disabled={busy}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Add-item picker */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <View style={styles.pickerWrap}>
          <View style={styles.pickerSheet}>
            <View style={styles.header}>
              <Pressable onPress={() => setShowAdd(false)} style={styles.iconBtn}>
                <Feather name="x" size={22} color={theme.color.onSurface} />
              </Pressable>
              <Text style={styles.title}>Add item</Text>
              <View style={{ width: 40 }} />
            </View>
            <View style={styles.chipsRow}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
                {cats.map((c) => {
                  const active = c.id === selectedCat;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => setSelectedCat(c.id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{c.name}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
            <ScrollView contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.sm }}>
              {availableToAdd.map((it) => (
                <Pressable
                  key={it.id}
                  testID={`editor-pick-${it.id}`}
                  onPress={() => {
                    addItem(it);
                    setShowAdd(false);
                  }}
                  style={styles.pickRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickName}>{it.name}</Text>
                    <Text style={styles.pickPrice}>${it.price.toFixed(2)}</Text>
                  </View>
                  <Feather name="plus-circle" size={22} color={theme.color.brand} />
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.4)" },
  wrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
  },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: theme.space.md, paddingTop: theme.space.md, paddingBottom: theme.space.sm,
    borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface },
  row: { flexDirection: "row", gap: theme.space.md, alignItems: "flex-end" },
  label: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  tableInput: {
    borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md, paddingVertical: theme.space.md,
    fontSize: theme.font.xl, fontWeight: "700", color: theme.color.brand,
    backgroundColor: theme.color.surfaceSecondary,
  },
  sectionTitle: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.onSurface, marginTop: theme.space.sm },
  empty: { color: theme.color.onSurfaceMuted, fontStyle: "italic" },
  lineRow: {
    flexDirection: "row", alignItems: "center", gap: theme.space.md,
    backgroundColor: theme.color.surfaceSecondary,
    padding: theme.space.md, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border,
  },
  lineName: { fontSize: theme.font.base, fontWeight: "600", color: theme.color.onSurface },
  linePrice: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  stepper: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: theme.color.brand, borderRadius: theme.radius.pill,
    paddingHorizontal: 4, height: 36, gap: 6,
  },
  stepBtn: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepQty: { color: "#fff", fontWeight: "700", minWidth: 20, textAlign: "center" },
  addRow: {
    flexDirection: "row", alignItems: "center", gap: theme.space.sm,
    paddingVertical: theme.space.md, justifyContent: "center",
    borderWidth: 1, borderStyle: "dashed", borderColor: theme.color.brand,
    borderRadius: theme.radius.md,
  },
  addRowText: { color: theme.color.brand, fontWeight: "700" },
  notesInput: {
    borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.md, paddingVertical: theme.space.md,
    minHeight: 60, textAlignVertical: "top",
    color: theme.color.onSurface, backgroundColor: theme.color.surfaceSecondary,
  },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: theme.space.md },
  totalLabel: { color: theme.color.onSurfaceMuted, fontSize: theme.font.lg },
  totalValue: { color: theme.color.brand, fontWeight: "800", fontSize: theme.font.xxl },
  footer: {
    padding: theme.space.lg, gap: theme.space.sm,
    borderTopWidth: 1, borderTopColor: theme.color.border,
  },
  saveBtn: {
    backgroundColor: theme.color.brand,
    paddingVertical: theme.space.md, borderRadius: theme.radius.md,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: theme.space.sm,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: theme.font.lg },
  finishBtn: {
    backgroundColor: theme.color.success,
    paddingVertical: theme.space.md, borderRadius: theme.radius.md,
    alignItems: "center", flexDirection: "row", justifyContent: "center", gap: theme.space.sm,
  },
  finishBtnText: { color: "#fff", fontWeight: "700", fontSize: theme.font.lg },

  pickerWrap: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.4)" },
  pickerSheet: { backgroundColor: theme.color.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "80%" },
  chipsRow: { height: 56, borderBottomWidth: 1, borderBottomColor: theme.color.border },
  chipsContent: { paddingHorizontal: theme.space.lg, gap: theme.space.sm, alignItems: "center", height: 56 },
  chip: {
    height: 36, paddingHorizontal: theme.space.lg,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    justifyContent: "center", alignItems: "center", flexShrink: 0,
    borderWidth: 1, borderColor: theme.color.border,
  },
  chipActive: { backgroundColor: theme.color.brand, borderColor: theme.color.brand },
  chipText: { color: theme.color.onSurface, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  pickRow: {
    flexDirection: "row", alignItems: "center", gap: theme.space.md,
    backgroundColor: theme.color.surfaceSecondary,
    padding: theme.space.lg, borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border,
  },
  pickName: { fontSize: theme.font.base, fontWeight: "600", color: theme.color.onSurface },
  pickPrice: { fontSize: theme.font.sm, color: theme.color.brand, fontWeight: "700", marginTop: 2 },
});
