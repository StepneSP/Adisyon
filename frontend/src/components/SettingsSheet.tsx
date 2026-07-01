import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { theme } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { session } from "@/src/lib/session";

type Props = {
  visible: boolean;
  onClose: () => void;
  variant: "tablet" | "waiter";
  onUpdated?: () => void;
};

export function SettingsSheet({ visible, onClose, variant, onUpdated }: Props) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!visible) {
      setEditing(false);
      return;
    }
    (async () => {
      const c = await session.getCode();
      setCode(c || "");
      if (variant === "tablet") {
        try {
          const room = await api.getRoom(c || "");
          setName(room.name);
        } catch {}
      } else {
        const n = await session.getWaiterName();
        setName(n || "");
      }
    })();
  }, [visible, variant]);

  const saveName = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (variant === "tablet") {
        await api.updateRoom(code, name.trim());
      } else {
        await session.setWaiterName(name.trim());
      }
      setEditing(false);
      onUpdated?.();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message || "Try again");
    } finally {
      setBusy(false);
    }
  };

  const switchRole = () => {
    Alert.alert(
      "Switch device role?",
      "This device will disconnect from the current restaurant. You can reconnect later using the pairing code.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          style: "destructive",
          onPress: async () => {
            await session.reset();
            onClose();
            router.replace("/");
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.wrap}
        pointerEvents="box-none"
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Settings</Text>

          <View style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>
                  {variant === "tablet" ? "Restaurant name" : "Your name"}
                </Text>
                {editing ? (
                  <TextInput
                    testID="settings-name-input"
                    style={styles.input}
                    value={name}
                    onChangeText={setName}
                    autoFocus
                    placeholder={variant === "tablet" ? "Restaurant" : "Your name"}
                    placeholderTextColor={theme.color.onSurfaceMuted}
                  />
                ) : (
                  <Text style={styles.value}>{name || "—"}</Text>
                )}
              </View>
              {editing ? (
                <Pressable
                  testID="settings-save-name-button"
                  onPress={saveName}
                  style={styles.saveBtn}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save</Text>}
                </Pressable>
              ) : (
                <Pressable
                  testID="settings-edit-name-button"
                  onPress={() => setEditing(true)}
                  style={styles.editBtn}
                >
                  <Feather name="edit-2" size={16} color={theme.color.brand} />
                  <Text style={styles.editBtnText}>Edit</Text>
                </Pressable>
              )}
            </View>
          </View>

          {variant === "tablet" ? (
            <View style={styles.card}>
              <Text style={styles.label}>Pairing code</Text>
              <Text style={styles.pairing}>{code}</Text>
              <Text style={styles.hint}>Waiters use this to connect their phones.</Text>
            </View>
          ) : null}

          <Pressable testID="settings-switch-role-button" onPress={switchRole} style={styles.dangerRow}>
            <Feather name="repeat" size={18} color={theme.color.brand} />
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerTitle}>Switch device role</Text>
              <Text style={styles.dangerSub}>
                {variant === "tablet"
                  ? "Turn this device into a waiter phone, or reconnect to a different restaurant."
                  : "Turn this device into a kitchen tablet, or connect to a different restaurant."}
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={theme.color.borderStrong} />
          </Pressable>

          <Pressable testID="settings-close-button" onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>Done</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
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
    padding: theme.space.lg,
    paddingBottom: theme.space.xxxl,
    gap: theme.space.md,
  },
  handle: {
    alignSelf: "center",
    width: 42, height: 5, borderRadius: 3,
    backgroundColor: theme.color.borderStrong,
    marginBottom: theme.space.sm,
  },
  title: { fontSize: theme.font.xl, fontWeight: "700", color: theme.color.onSurface },
  card: {
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    padding: theme.space.lg,
    borderWidth: 1, borderColor: theme.color.border,
    gap: theme.space.xs,
  },
  row: { flexDirection: "row", alignItems: "center", gap: theme.space.md },
  label: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, textTransform: "uppercase", letterSpacing: 1 },
  value: { fontSize: theme.font.lg, fontWeight: "700", color: theme.color.onSurface, marginTop: 4 },
  input: {
    marginTop: 4,
    borderWidth: 1, borderColor: theme.color.border, borderRadius: theme.radius.sm,
    paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm,
    fontSize: theme.font.lg, color: theme.color.onSurface,
    backgroundColor: theme.color.surface,
  },
  editBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: theme.space.md, paddingVertical: theme.space.sm },
  editBtnText: { color: theme.color.brand, fontWeight: "700" },
  saveBtn: { backgroundColor: theme.color.brand, paddingHorizontal: theme.space.lg, paddingVertical: theme.space.sm, borderRadius: theme.radius.md },
  saveBtnText: { color: "#fff", fontWeight: "700" },
  pairing: { fontSize: 40, fontWeight: "800", letterSpacing: 8, color: theme.color.brand, marginTop: 2 },
  hint: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.space.md,
    padding: theme.space.lg,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderWidth: 1, borderColor: theme.color.border,
  },
  dangerTitle: { fontSize: theme.font.base, fontWeight: "700", color: theme.color.onSurface },
  dangerSub: { fontSize: theme.font.sm, color: theme.color.onSurfaceMuted, marginTop: 2 },
  closeBtn: {
    backgroundColor: theme.color.brand,
    paddingVertical: theme.space.md,
    borderRadius: theme.radius.md,
    alignItems: "center",
    marginTop: theme.space.sm,
  },
  closeBtnText: { color: "#fff", fontWeight: "700", fontSize: theme.font.base },
});
