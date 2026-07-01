import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { theme } from "@/src/lib/theme";
import { api, type Order } from "@/src/lib/api";

type Props = {
  visible: boolean;
  onClose: () => void;
  code: string;
  order: Order | null;
};

export function KitchenTicket({ visible, onClose, code, order }: Props) {
  const [restaurantName, setRestaurantName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible || !code) return;
    api.getRoom(code).then((r) => setRestaurantName(r.name)).catch(() => {});
  }, [visible, code]);

  if (!order) return null;

  const html = buildTicketHtml(order, restaurantName);

  const share = async () => {
    setBusy(true);
    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", dialogTitle: "Ticket" });
      } else {
        Alert.alert("Saved", `PDF saved to ${uri}`);
      }
    } catch (e: any) {
      Alert.alert("Could not export", e?.message || "Try printing instead.");
    } finally {
      setBusy(false);
    }
  };

  const print = async () => {
    setBusy(true);
    try {
      await Print.printAsync({ html });
    } catch (e: any) {
      if (Platform.OS === "web") {
        // Fallback: open the HTML in a new tab so the user can Ctrl+P
        try {
          const blob = new Blob([html], { type: "text/html" });
          const url = URL.createObjectURL(blob);
          const w = window.open(url, "_blank");
          if (w) w.focus();
        } catch {
          Alert.alert("Print not available", "Save as PDF and print from your device.");
        }
      } else {
        Alert.alert("Print unavailable", e?.message || "");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop} />
      <View style={styles.wrap}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Pressable testID="ticket-close-button" onPress={onClose} style={styles.iconBtn}>
              <Feather name="x" size={22} color={theme.color.onSurface} />
            </Pressable>
            <Text style={styles.title}>Kitchen ticket</Text>
            <View style={{ width: 40 }} />
          </View>

          <ScrollView contentContainerStyle={styles.ticketWrap}>
            <View style={styles.ticket}>
              <Text style={styles.restaurant}>{restaurantName || "Restaurant"}</Text>
              <Text style={styles.divider}>* * *</Text>
              <View style={styles.rowLine}>
                <Text style={styles.k}>Table</Text>
                <Text style={styles.v}>{order.table_number}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.k}>Waiter</Text>
                <Text style={styles.v}>{order.waiter_name}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.k}>Time</Text>
                <Text style={styles.v}>{new Date(order.created_at).toLocaleString()}</Text>
              </View>
              <View style={styles.rowLine}>
                <Text style={styles.k}>Order #</Text>
                <Text style={styles.v}>{order.id.slice(0, 8).toUpperCase()}</Text>
              </View>
              <Text style={styles.dashed}>——————————————</Text>
              {order.lines.map((l, i) => (
                <View key={i} style={styles.itemRow}>
                  <Text style={styles.qty}>{l.quantity}×</Text>
                  <Text style={styles.name}>{l.name}</Text>
                  <Text style={styles.lp}>${(l.price * l.quantity).toFixed(2)}</Text>
                </View>
              ))}
              <Text style={styles.dashed}>——————————————</Text>
              {order.notes ? (
                <View style={styles.notesBlock}>
                  <Text style={styles.notesLabel}>Notes</Text>
                  <Text style={styles.notesText}>{order.notes}</Text>
                </View>
              ) : null}
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>TOTAL</Text>
                <Text style={styles.totalValue}>${order.total.toFixed(2)}</Text>
              </View>
              <Text style={styles.footerNote}>Thank you!</Text>
            </View>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              testID="ticket-share-button"
              onPress={share}
              disabled={busy}
              style={[styles.actionBtn, styles.actionSecondary]}
            >
              <Feather name="share" size={16} color={theme.color.brand} />
              <Text style={styles.actionSecondaryText}>Save as PDF</Text>
            </Pressable>
            <Pressable
              testID="ticket-print-button"
              onPress={print}
              disabled={busy}
              style={[styles.actionBtn, styles.actionPrimary]}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Feather name="printer" size={16} color="#fff" />
                  <Text style={styles.actionPrimaryText}>Print</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function buildTicketHtml(order: Order, restaurantName: string): string {
  const lines = order.lines
    .map(
      (l) => `
      <tr>
        <td class="qty">${l.quantity}×</td>
        <td class="name">${escapeHtml(l.name)}</td>
        <td class="p">$${(l.price * l.quantity).toFixed(2)}</td>
      </tr>`,
    )
    .join("");
  const notes = order.notes
    ? `<div class="notes"><div class="notes-label">Notes</div><div>${escapeHtml(order.notes)}</div></div>`
    : "";
  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c1c1e; padding: 6px; max-width: 300px; margin: 0 auto; }
  .name { text-align: center; font-size: 20px; font-weight: 800; }
  .divider { text-align: center; letter-spacing: 6px; margin: 6px 0 10px; }
  .row { display: flex; justify-content: space-between; font-size: 12px; margin: 2px 0; }
  .dashed { border-top: 1px dashed #333; margin: 8px 0; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 4px 0; vertical-align: top; font-size: 13px; }
  td.qty { width: 32px; font-weight: 700; color: #C85A40; }
  td.name { }
  td.p { text-align: right; white-space: nowrap; }
  .notes { border: 1px dashed #C85A40; border-radius: 6px; padding: 6px 8px; margin: 8px 0; font-size: 12px; }
  .notes-label { font-weight: 700; text-transform: uppercase; letter-spacing: 1px; font-size: 10px; color: #C85A40; margin-bottom: 2px; }
  .total { display: flex; justify-content: space-between; font-size: 18px; font-weight: 800; margin-top: 8px; padding-top: 6px; border-top: 2px solid #1c1c1e; }
  .footer { text-align: center; font-size: 11px; color: #666; margin-top: 10px; }
</style>
</head>
<body>
  <div class="name">${escapeHtml(restaurantName || "Restaurant")}</div>
  <div class="divider">* * *</div>
  <div class="row"><span>Table</span><b>${escapeHtml(order.table_number)}</b></div>
  <div class="row"><span>Waiter</span><b>${escapeHtml(order.waiter_name)}</b></div>
  <div class="row"><span>Time</span><span>${new Date(order.created_at).toLocaleString()}</span></div>
  <div class="row"><span>Order #</span><span>${order.id.slice(0, 8).toUpperCase()}</span></div>
  <div class="dashed"></div>
  <table>${lines}</table>
  <div class="dashed"></div>
  ${notes}
  <div class="total"><span>TOTAL</span><span>$${order.total.toFixed(2)}</span></div>
  <div class="footer">Thank you!</div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
  ticketWrap: { padding: theme.space.lg, alignItems: "center" },
  ticket: {
    width: "100%", maxWidth: 320,
    backgroundColor: "#fff",
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    borderWidth: 1, borderColor: theme.color.border,
    borderStyle: "dashed",
  },
  restaurant: { fontSize: 22, fontWeight: "800", textAlign: "center", color: theme.color.onSurface },
  divider: { textAlign: "center", letterSpacing: 8, marginVertical: theme.space.sm, color: theme.color.onSurface },
  rowLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  k: { color: theme.color.onSurfaceMuted, fontSize: theme.font.sm },
  v: { color: theme.color.onSurface, fontSize: theme.font.sm, fontWeight: "700" },
  dashed: {
    textAlign: "center",
    letterSpacing: 2,
    color: theme.color.borderStrong,
    marginVertical: theme.space.sm,
  },
  itemRow: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 2 },
  qty: { width: 32, color: theme.color.brand, fontWeight: "700" },
  name: { flex: 1, color: theme.color.onSurface },
  lp: { color: theme.color.onSurface, fontWeight: "600" },
  notesBlock: {
    borderWidth: 1, borderStyle: "dashed", borderColor: theme.color.brand,
    padding: theme.space.sm, borderRadius: theme.radius.sm, marginTop: theme.space.sm,
  },
  notesLabel: { fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: theme.color.brand, fontWeight: "700", marginBottom: 2 },
  notesText: { color: theme.color.onSurface, fontSize: theme.font.sm },
  totalRow: {
    flexDirection: "row", justifyContent: "space-between",
    marginTop: theme.space.md, paddingTop: theme.space.sm,
    borderTopWidth: 2, borderTopColor: theme.color.onSurface,
  },
  totalLabel: { fontSize: theme.font.lg, fontWeight: "800", color: theme.color.onSurface },
  totalValue: { fontSize: theme.font.lg, fontWeight: "800", color: theme.color.onSurface },
  footerNote: { textAlign: "center", marginTop: theme.space.md, color: theme.color.onSurfaceMuted, fontSize: theme.font.sm },
  actions: {
    flexDirection: "row", gap: theme.space.sm,
    padding: theme.space.lg,
    borderTopWidth: 1, borderTopColor: theme.color.border,
  },
  actionBtn: {
    flex: 1, paddingVertical: theme.space.md, borderRadius: theme.radius.md,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
  },
  actionPrimary: { backgroundColor: theme.color.brand },
  actionPrimaryText: { color: "#fff", fontWeight: "700", fontSize: theme.font.base },
  actionSecondary: { backgroundColor: theme.color.brandTint },
  actionSecondaryText: { color: theme.color.brand, fontWeight: "700", fontSize: theme.font.base },
});
