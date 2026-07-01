import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { theme } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { session } from "@/src/lib/session";
import { registerForPush } from "@/src/lib/push";

export default function WaiterPair() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const saved = await session.getWaiterName();
      if (saved) setName(saved);
    })();
  }, []);

  const connect = async () => {
    const c = code.trim();
    const n = name.trim();
    if (c.length !== 4 || !/^\d{4}$/.test(c)) {
      setError("Enter the 4-digit code from the tablet.");
      return;
    }
    if (!n) {
      setError("Enter your name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.getRoom(c);
      await session.setCode(c);
      await session.setWaiterName(n);
      // Best-effort push registration — silently no-ops in Expo Go / web.
      registerForPush(c, n).catch(() => {});
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.replace("/waiter");
    } catch {
      setError("Code not found. Check with the tablet.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <View style={styles.header}>
          <Pressable
            testID="pair-back-button"
            onPress={async () => {
              await session.reset();
              router.replace("/");
            }}
            style={styles.iconBtn}
          >
            <Feather name="arrow-left" size={22} color={theme.color.onSurface} />
          </Pressable>
        </View>

        <View style={styles.body}>
          <Text style={styles.title}>Connect to kitchen</Text>
          <Text style={styles.subtitle}>Enter the 4-digit code shown on the restaurant&apos;s tablet.</Text>

          <View style={styles.codeInputWrap}>
            <TextInput
              testID="pairing-code-input"
              style={styles.codeInput}
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              placeholderTextColor={theme.color.borderStrong}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
            />
          </View>

          <Text style={styles.label}>Your name</Text>
          <TextInput
            testID="waiter-name-input"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Sofia"
            placeholderTextColor={theme.color.onSurfaceMuted}
            autoCapitalize="words"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            testID="pair-connect-button"
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={connect}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Connect</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: { padding: theme.space.md, flexDirection: "row" },
  iconBtn: {
    width: 40, height: 40, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  body: { flex: 1, paddingHorizontal: theme.space.xl, paddingTop: theme.space.lg },
  title: { fontSize: 28, fontWeight: "800", color: theme.color.onSurface, letterSpacing: -0.5 },
  subtitle: { color: theme.color.onSurfaceMuted, marginTop: theme.space.sm, fontSize: theme.font.lg, lineHeight: 22 },
  codeInputWrap: { alignItems: "center", marginTop: theme.space.xxl },
  codeInput: {
    fontSize: 56, fontWeight: "800", letterSpacing: 16,
    color: theme.color.brand,
    textAlign: "center", minWidth: 240,
    borderBottomWidth: 3, borderBottomColor: theme.color.brand,
    paddingBottom: 8,
  },
  label: { fontSize: theme.font.base, color: theme.color.onSurfaceMuted, marginTop: theme.space.xxl, marginBottom: theme.space.sm },
  input: {
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.lg, paddingVertical: theme.space.lg,
    fontSize: theme.font.lg, color: theme.color.onSurface,
  },
  error: { color: theme.color.error, marginTop: theme.space.lg, textAlign: "center" },
  footer: { padding: theme.space.xl },
  primaryBtn: {
    backgroundColor: theme.color.brand,
    paddingVertical: theme.space.lg,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: theme.font.lg },
});
