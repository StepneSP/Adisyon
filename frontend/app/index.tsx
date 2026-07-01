import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, ActivityIndicator } from "react-native";
import { Feather } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { theme } from "@/src/lib/theme";
import { session } from "@/src/lib/session";

export default function Index() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const role = await session.getRole();
      const code = await session.getCode();
      if (role === "tablet" && code) {
        router.replace("/tablet");
      } else if (role === "waiter" && code) {
        router.replace("/waiter");
      } else {
        setChecking(false);
      }
    })();
  }, [router]);

  if (checking) {
    return (
      <SafeAreaView style={styles.loading}>
        <ActivityIndicator color={theme.color.brand} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Text style={styles.brand}>ServeSync</Text>
        <Text style={styles.tagline}>Order taking, made effortless.</Text>
      </View>

      <View style={styles.cards}>
        <Pressable
          testID="role-tablet-button"
          style={({ pressed }) => [styles.card, styles.cardBrand, pressed && styles.pressed]}
          onPress={async () => {
            await session.setRole("tablet");
            router.replace("/tablet/setup");
          }}
        >
          <View style={styles.iconWrap}>
            <Feather name="monitor" size={44} color={theme.color.onBrand} />
          </View>
          <Text style={[styles.cardTitle, { color: theme.color.onBrand }]}>This is the Server</Text>
          <Text style={[styles.cardSub, { color: theme.color.brandTint }]}>
            Tablet · Kitchen display · Menu editor
          </Text>
        </Pressable>

        <Pressable
          testID="role-waiter-button"
          style={({ pressed }) => [styles.card, styles.cardLight, pressed && styles.pressed]}
          onPress={async () => {
            await session.setRole("waiter");
            router.replace("/waiter/pair");
          }}
        >
          <View style={[styles.iconWrap, { backgroundColor: theme.color.brandTint }]}>
            <Feather name="smartphone" size={44} color={theme.color.brand} />
          </View>
          <Text style={[styles.cardTitle, { color: theme.color.onSurface }]}>I&apos;m a Waiter</Text>
          <Text style={[styles.cardSub, { color: theme.color.onSurfaceMuted }]}>
            Phone · Take orders · Send to kitchen
          </Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>Pick once — you can switch anytime from Settings.</Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, backgroundColor: theme.color.surface, alignItems: "center", justifyContent: "center" },
  container: { flex: 1, backgroundColor: theme.color.surface, paddingHorizontal: theme.space.xl },
  header: { marginTop: theme.space.xxl, marginBottom: theme.space.xl },
  brand: { fontSize: 32, fontWeight: "800", color: theme.color.brand, letterSpacing: -0.5 },
  tagline: { fontSize: theme.font.lg, color: theme.color.onSurfaceMuted, marginTop: theme.space.xs },
  cards: { flex: 1, justifyContent: "center", gap: theme.space.lg },
  card: {
    padding: theme.space.xl,
    borderRadius: theme.radius.lg,
    gap: theme.space.md,
  },
  cardBrand: { backgroundColor: theme.color.brand },
  cardLight: { backgroundColor: theme.color.surfaceSecondary, borderWidth: 1, borderColor: theme.color.border },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  iconWrap: {
    width: 72, height: 72, borderRadius: theme.radius.lg,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  cardTitle: { fontSize: theme.font.xxl, fontWeight: "700" },
  cardSub: { fontSize: theme.font.base },
  footer: { textAlign: "center", color: theme.color.onSurfaceMuted, marginBottom: theme.space.md, fontSize: theme.font.sm },
});
