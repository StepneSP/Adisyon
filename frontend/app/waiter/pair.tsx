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
import { authApi } from "@/src/lib/api";
import { session } from "@/src/lib/session";
import { registerForPush } from "@/src/lib/push";

export default function WaiterPair() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [dailyCode, setDailyCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const saved = await session.getWaiterName();
      if (saved) setNickname(saved);
    })();
  }, []);

  const login = async () => {
    const name = nickname.trim();
    const code = dailyCode.trim();
    
    if (code.length !== 4 || !/^\d{4}$/.test(code)) {
      setError("Lütfen 4 haneli günün kodunu girin.");
      return;
    }
    if (!name) {
      setError("Lütfen adınızı girin.");
      return;
    }
    
    setBusy(true);
    setError("");
    
    // Debug: Log the backend URL
    const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL || "http://localhost:8000";
    console.log("🔵 Login attempt:", { name, code, backendUrl });
    console.log("🔵 Full URL will be:", `${backendUrl}/api/auth/waiter/login`);
    
    try {
      // Call the new login endpoint
      const response = await authApi.login({
        nickname: name,
        gunluk_kod: code,
      });
      
      console.log("✅ Login successful:", response);

      // Save session data
      await session.setToken(response.session_token);
      await session.setRestoranId(response.restoran_id);
      await session.setRestoranAdi(response.restoran_adi);
      await session.setCode(response.gunluk_kod);
      await session.setWaiterName(name);
      await session.setRole("waiter");

      // Register for push notifications (best-effort)
      registerForPush(response.restoran_id, name).catch(() => {});

      // Success feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // Navigate to waiter dashboard
      router.replace("/waiter");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Giriş başarısız";
      console.error("❌ Login error:", errorMessage);
      
      if (errorMessage.includes("401") || errorMessage.includes("Invalid daily code")) {
        setError("Geçersiz günlük kod. Lütfen restoran yöneticisine danışın.");
      } else if (errorMessage.includes("403")) {
        setError("Restoran aboneliği aktif değil.");
      } else if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        setError("Sunucuya bağlanılamadı. Backend çalışıyor mu?");
      } else if (errorMessage.includes("<!DOCTYPE") || errorMessage.includes("Unexpected token")) {
        setError("Yanlış adrese bağlanılıyor. Backend URL'sini kontrol edin.");
      } else {
        setError(`Giriş yapılamadı: ${errorMessage}`);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={{ flex: 1 }}
      >
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
          <Text style={styles.title}>Garson Girişi</Text>
          <Text style={styles.subtitle}>
            Restoran yöneticisinden aldığınız günlük kodu ve adınızı girin.
          </Text>

          <View style={styles.codeInputWrap}>
            <TextInput
              testID="daily-code-input"
              style={styles.codeInput}
              value={dailyCode}
              onChangeText={(v) => setDailyCode(v.replace(/\D/g, "").slice(0, 4))}
              placeholder="0000"
              placeholderTextColor={theme.color.borderStrong}
              keyboardType="number-pad"
              maxLength={4}
              autoFocus
            />
            <Text style={styles.codeLabel}>Günün Kodu</Text>
          </View>

          <Text style={styles.label}>Adınız</Text>
          <TextInput
            testID="waiter-name-input"
            style={styles.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="Örn: Ahmet"
            placeholderTextColor={theme.color.onSurfaceMuted}
            autoCapitalize="words"
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}
          
          <View style={styles.infoBox}>
            <Feather name="info" size={16} color={theme.color.brand} />
            <Text style={styles.infoText}>
              Günlük kod her gün değişir. Yöneticinizden güncel kodu alın.
            </Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            testID="login-button"
            style={[styles.primaryBtn, busy && { opacity: 0.6 }]}
            disabled={busy}
            onPress={login}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryBtnText}>Giriş Yap</Text>
            )}
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
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, paddingHorizontal: theme.space.xl, paddingTop: theme.space.lg },
  title: { 
    fontSize: 28, 
    fontWeight: "800", 
    color: theme.color.onSurface, 
    letterSpacing: -0.5 
  },
  subtitle: { 
    color: theme.color.onSurfaceMuted, 
    marginTop: theme.space.sm, 
    fontSize: theme.font.lg, 
    lineHeight: 22 
  },
  codeInputWrap: { 
    alignItems: "center", 
    marginTop: theme.space.xxl 
  },
  codeInput: {
    fontSize: 56,
    fontWeight: "800",
    letterSpacing: 16,
    color: theme.color.brand,
    textAlign: "center",
    minWidth: 240,
    borderBottomWidth: 3,
    borderBottomColor: theme.color.brand,
    paddingBottom: 8,
  },
  codeLabel: {
    fontSize: theme.font.sm,
    color: theme.color.onSurfaceMuted,
    marginTop: theme.space.sm,
  },
  label: { 
    fontSize: theme.font.base, 
    color: theme.color.onSurfaceMuted, 
    marginTop: theme.space.xxl, 
    marginBottom: theme.space.sm 
  },
  input: {
    backgroundColor: theme.color.surfaceSecondary,
    borderWidth: 1,
    borderColor: theme.color.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.space.lg,
    paddingVertical: theme.space.lg,
    fontSize: theme.font.lg,
    color: theme.color.onSurface,
  },
  error: { 
    color: theme.color.error, 
    marginTop: theme.space.lg, 
    textAlign: "center" 
  },
  infoBox: {
    flexDirection: "row",
    backgroundColor: theme.color.brandTint,
    padding: theme.space.md,
    borderRadius: theme.radius.md,
    marginTop: theme.space.xl,
    gap: theme.space.sm,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: theme.font.sm,
    color: theme.color.onSurface,
    lineHeight: 18,
  },
  footer: { 
    padding: theme.space.xl 
  },
  primaryBtn: {
    backgroundColor: theme.color.brand,
    paddingVertical: theme.space.lg,
    borderRadius: theme.radius.md,
    alignItems: "center",
  },
  primaryBtnText: { 
    color: "#fff", 
    fontWeight: "700", 
    fontSize: theme.font.lg 
  },
});