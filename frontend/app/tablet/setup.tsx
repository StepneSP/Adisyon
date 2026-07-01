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
import { theme } from "@/src/lib/theme";
import { api } from "@/src/lib/api";
import { session } from "@/src/lib/session";

export default function TabletSetup() {
  const router = useRouter();
  const [name, setName] = useState("My Restaurant");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [existingCode, setExistingCode] = useState("");

  useEffect(() => {
    (async () => {
      const code = await session.getCode();
      if (code) {
        setExistingCode(code);
      }
    })();
  }, []);

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const room = await api.createRoom(name.trim() || "My Restaurant");
      await session.setCode(room.code);
      router.replace("/tablet");
    } catch (e: any) {
      setError(e?.message || "Could not create restaurant");
    } finally {
      setBusy(false);
    }
  };

  const continueExisting = async () => {
    router.replace("/tablet");
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <View style={styles.header}>
          <Pressable
            testID="setup-back-button"
            onPress={async () => {
              await session.reset();
              router.replace("/");
            }}
            style={styles.iconBtn}
          >
            <Feather name="arrow-left" size={22} color={theme.color.onSurface} />
          </Pressable>
          <Text style={styles.title}>Set up your restaurant</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={styles.body}>
          {existingCode ? (
            <View style={styles.existingCard}>
              <Text style={styles.existingLabel}>You already have a restaurant running</Text>
              <Text style={styles.existingCode}>{existingCode}</Text>
              <Pressable testID="continue-existing-button" style={styles.primaryBtn} onPress={continueExisting}>
                <Text style={styles.primaryBtnText}>Continue</Text>
              </Pressable>
              <Text style={styles.orText}>— or start fresh —</Text>
            </View>
          ) : null}

          <Text style={styles.label}>Restaurant name</Text>
          <TextInput
            testID="restaurant-name-input"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Trattoria Rosa"
            placeholderTextColor={theme.color.onSurfaceMuted}
            autoCapitalize="words"
          />

          <Text style={styles.hint}>
            We&apos;ll generate a 4-digit pairing code that waiters use to connect their phones to this
            device.
          </Text>

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>

        <View style={styles.footer}>
          <Pressable
            testID="create-restaurant-button"
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={create}
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create restaurant</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.md,
  },
  iconBtn: {
    width: 40, height: 40, borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: theme.font.lg, fontWeight: "600", color: theme.color.onSurface },
  body: { flex: 1, paddingHorizontal: theme.space.xl, paddingTop: theme.space.lg },
  label: { fontSize: theme.font.base, color: theme.color.onSurfaceMuted, marginBottom: theme.space.sm },
  input: {
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1, borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.lg,
    fontSize: theme.font.lg, color: theme.color.onSurface,
  },
  hint: { color: theme.color.onSurfaceMuted, fontSize: theme.font.sm, marginTop: theme.space.md, lineHeight: 20 },
  error: { color: theme.color.error, marginTop: theme.space.md },
  footer: { padding: theme.space.xl },
  primaryBtn: {
    backgroundColor: theme.color.brand,
    paddingVertical: theme.space.lg,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  primaryBtnText: { color: theme.color.onBrand, fontSize: theme.font.lg, fontWeight: "700" },
  existingCard: {
    padding: theme.space.lg, backgroundColor: theme.color.brandTint,
    borderRadius: theme.radius.lg, marginBottom: theme.space.xl,
    alignItems: "center", gap: theme.space.sm,
  },
  existingLabel: { color: theme.color.onSurface, fontSize: theme.font.base },
  existingCode: { fontSize: 44, fontWeight: "800", color: theme.color.brand, letterSpacing: 8 },
  orText: { color: theme.color.onSurfaceMuted, marginTop: theme.space.sm },
});
