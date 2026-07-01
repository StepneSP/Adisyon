import { useEffect, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { theme } from "@/src/lib/theme";
import type { Order } from "@/src/lib/api";

type Mode = "equal" | "items";

type Props = {
  visible: boolean;
  onClose: () => void;
  order: Order | null;
};

const COLORS = ["#C85A40", "#4A7C59", "#D99B48", "#5C6B73", "#8A311A", "#3A3A3C"];

export function BillSplitter({ visible, onClose, order }: Props) {
  const [mode, setMode] = useState<Mode>("equal");
  const [people, setPeople] = useState<number>(2);
  const [tipPct, setTipPct] = useState<number>(0);
  // assignments: per line index → array of person indexes (share equally among them)
  const [assign, setAssign] = useState<Record<number, number[]>>({});

  useEffect(() => {
    if (!visible) return;
    setMode("equal");
    setPeople(2);
    setTipPct(0);
    setAssign({});
  }, [visible]);

  const subtotal = order?.total || 0;
  const tip = useMemo(() => Math.round(subtotal * tipPct) / 100, [subtotal, tipPct]);
  const grandTotal = subtotal + tip;

  const equalShare = people > 0 ? grandTotal / people : 0;

  const itemTotals = useMemo(() => {
    if (!order) return [] as number[];
    const totals: number[] = new Array(people).fill(0);
    order.lines.forEach((l, idx) => {
      const assignedTo = assign[idx] && assign[idx].length > 0 ? assign[idx] : [];
      if (assignedTo.length === 0) return;
      const lineTotal = l.price * l.quantity;
      const per = lineTotal / assignedTo.length;
      assignedTo.forEach((p) => {
        if (p < people) totals[p] += per;
      });
    });
    // Distribute tip proportionally to each person's item subtotal
    const itemsSubtotal = totals.reduce((a, b) => a + b, 0);
    if (itemsSubtotal > 0 && tip > 0) {
      for (let i = 0; i < totals.length; i++) {
        totals[i] += (totals[i] / itemsSubtotal) * tip;
      }
    }
    return totals;
  }, [order, assign, people, tip]);

  const unassignedTotal = useMemo(() => {
    if (!order) return 0;
    return order.lines.reduce((sum, l, idx) => {
      const assignedTo = assign[idx] || [];
      if (assignedTo.length === 0) return sum + l.price * l.quantity;
      return sum;
    }, 0);
  }, [order, assign]);

  const togglePersonOnLine = (lineIdx: number, personIdx: number) => {
    setAssign((prev) => {
      const cur = prev[lineIdx] ? [...prev[lineIdx]] : [];
      const at = cur.indexOf(personIdx);
      if (at >= 0) cur.splice(at, 1);
      else cur.push(personIdx);
      return { ...prev, [lineIdx]: cur };
    });
  };

  if (!order) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop} />
      <View style={styles.wrap}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable testID="split-close-button" onPress={onClose} style={styles.iconBtn}>
              <Feather name="x" size={22} color={theme.color.onSurface} />
            </Pressable>
            <Text style={styles.title}>Split bill · Table {order.table_number}</Text>
            <View style={{ width: 40 }} />
          </View>

          <View style={styles.modeRow}>
            <Pressable
              testID="split-mode-equal"
              onPress={() => setMode("equal")}
              style={[styles.modeBtn, mode === "equal" && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, mode === "equal" && styles.modeTextActive]}>
                Equal
              </Text>
            </Pressable>
            <Pressable
              testID="split-mode-items"
              onPress={() => setMode("items")}
              style={[styles.modeBtn, mode === "items" && styles.modeBtnActive]}
            >
              <Text style={[styles.modeText, mode === "items" && styles.modeTextActive]}>
                By items
              </Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: theme.space.lg, gap: theme.space.md, paddingBottom: 40 }}>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.k}>Subtotal</Text>
                <Text style={styles.v}>${subtotal.toFixed(2)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.k}>Tip</Text>
                <View style={styles.tipRow}>
                  {[0, 10, 15, 20].map((t) => (
                    <Pressable
                      key={t}
                      testID={`tip-${t}`}
                      onPress={() => setTipPct(t)}
                      style={[styles.tipChip, tipPct === t && styles.tipChipActive]}
                    >
                      <Text style={[styles.tipChipText, tipPct === t && styles.tipChipTextActive]}>
                        {t === 0 ? "None" : `${t}%`}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <View style={[styles.row, { paddingTop: theme.space.sm, borderTopWidth: 1, borderTopColor: theme.color.border, marginTop: theme.space.sm }]}>
                <Text style={styles.totalK}>Total</Text>
                <Text style={styles.totalV}>${grandTotal.toFixed(2)}</Text>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.label}>People</Text>
              <View style={styles.stepper}>
                <Pressable
                  testID="split-dec-people"
                  onPress={() => setPeople(Math.max(1, people - 1))}
                  style={styles.stepBtn}
                >
                  <Feather name="minus" size={18} color="#fff" />
                </Pressable>
                <TextInput
                  testID="split-people-input"
                  value={String(people)}
                  onChangeText={(v) => setPeople(Math.max(1, parseInt(v || "1", 10) || 1))}
                  style={styles.peopleInput}
                  keyboardType="number-pad"
                />
                <Pressable
                  testID="split-inc-people"
                  onPress={() => setPeople(people + 1)}
                  style={styles.stepBtn}
                >
                  <Feather name="plus" size={18} color="#fff" />
                </Pressable>
              </View>
            </View>

            {mode === "equal" ? (
              <View style={styles.card}>
                <Text style={styles.label}>Each person pays</Text>
                <Text style={styles.equalAmount}>${equalShare.toFixed(2)}</Text>
                <Text style={styles.hint}>${(equalShare).toFixed(2)} × {people} = ${grandTotal.toFixed(2)}</Text>
              </View>
            ) : (
              <>
                <Text style={styles.sectionTitle}>Tap items to assign to people</Text>
                {order.lines.map((l, idx) => {
                  const assigned = assign[idx] || [];
                  return (
                    <View key={idx} style={styles.itemBlock}>
                      <View style={styles.itemHead}>
                        <Text style={styles.itemName}>
                          {l.quantity}× {l.name}
                        </Text>
                        <Text style={styles.itemPrice}>${(l.price * l.quantity).toFixed(2)}</Text>
                      </View>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={styles.personChips}
                      >
                        {Array.from({ length: people }).map((_, p) => {
                          const active = assigned.includes(p);
                          const c = COLORS[p % COLORS.length];
                          return (
                            <Pressable
                              key={p}
                              testID={`assign-${idx}-${p}`}
                              onPress={() => togglePersonOnLine(idx, p)}
                              style={[
                                styles.personChip,
                                { borderColor: c },
                                active && { backgroundColor: c },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.personChipText,
                                  { color: active ? "#fff" : c },
                                ]}
                              >
                                P{p + 1}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  );
                })}

                {unassignedTotal > 0.001 ? (
                  <View style={styles.warn}>
                    <Feather name="alert-triangle" size={16} color={theme.color.warning} />
                    <Text style={styles.warnText}>
                      ${unassignedTotal.toFixed(2)} of items not assigned to anyone.
                    </Text>
                  </View>
                ) : null}

                <View style={styles.card}>
                  <Text style={styles.label}>Per person</Text>
                  {itemTotals.map((amount, p) => {
                    const c = COLORS[p % COLORS.length];
                    return (
                      <View key={p} style={styles.personRow}>
                        <View style={[styles.personDot, { backgroundColor: c }]}>
                          <Text style={styles.personDotText}>P{p + 1}</Text>
                        </View>
                        <Text style={styles.personAmount}>${amount.toFixed(2)}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.5)" },
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
  modeRow: { flexDirection: "row", padding: theme.space.md, gap: theme.space.sm },
  modeBtn: {
    flex: 1, paddingVertical: theme.space.md,
    borderRadius: theme.radius.md, alignItems: "center",
    backgroundColor: theme.color.surfaceTertiary,
  },
  modeBtnActive: { backgroundColor: theme.color.brand },
  modeText: { fontWeight: "700", color: theme.color.onSurfaceMuted },
  modeTextActive: { color: "#fff" },
  card: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    borderWidth: 1, borderColor: theme.color.border,
    gap: theme.space.sm,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  k: { fontSize: theme.font.base, color: theme.color.onSurfaceMuted },
  v: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.onSurface },
  totalK: { fontSize: theme.font.lg, color: theme.color.onSurface, fontWeight: "700" },
  totalV: { fontSize: theme.font.xxl, color: theme.color.brand, fontWeight: "800" },
  tipRow: { flexDirection: "row", gap: 6 },
  tipChip: {
    paddingHorizontal: theme.space.sm, paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
  },
  tipChipActive: { backgroundColor: theme.color.brand },
  tipChipText: { fontWeight: "600", color: theme.color.onSurface, fontSize: theme.font.sm },
  tipChipTextActive: { color: "#fff" },
  label: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 1 },
  stepper: { flexDirection: "row", alignItems: "center", gap: theme.space.md, alignSelf: "flex-start", marginTop: theme.space.sm },
  stepBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: theme.color.brand,
    alignItems: "center", justifyContent: "center",
  },
  peopleInput: {
    fontSize: 28, fontWeight: "800", color: theme.color.onSurface,
    minWidth: 60, textAlign: "center",
  },
  equalAmount: { fontSize: 40, fontWeight: "800", color: theme.color.brand, marginTop: theme.space.sm },
  hint: { color: theme.color.onSurfaceMuted, fontSize: theme.font.sm },
  sectionTitle: { fontSize: theme.font.sm, fontWeight: "700", color: theme.color.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 1 },
  itemBlock: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.space.md,
    borderWidth: 1, borderColor: theme.color.border,
    gap: theme.space.sm,
  },
  itemHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  itemName: { fontSize: theme.font.base, fontWeight: "600", color: theme.color.onSurface },
  itemPrice: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.brand },
  personChips: { gap: 8 },
  personChip: {
    height: 36, minWidth: 44, paddingHorizontal: 12,
    borderRadius: 18, borderWidth: 2,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  personChipText: { fontWeight: "700" },
  personRow: {
    flexDirection: "row", alignItems: "center", gap: theme.space.md,
    paddingVertical: theme.space.sm,
    borderBottomWidth: 1, borderBottomColor: theme.color.border,
  },
  personDot: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: "center", justifyContent: "center",
  },
  personDotText: { color: "#fff", fontWeight: "800", fontSize: 12 },
  personAmount: { flex: 1, fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface, textAlign: "right" },
  warn: {
    flexDirection: "row", alignItems: "center", gap: theme.space.sm,
    padding: theme.space.md, backgroundColor: "#FBEED8",
    borderRadius: theme.radius.md,
  },
  warnText: { color: theme.color.warning, fontWeight: "600", flex: 1 },
});
