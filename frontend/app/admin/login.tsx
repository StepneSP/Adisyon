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
import { adminApi } from "@/src/lib/api";
import { session } from "@/src/lib/session";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Check if already logged in
    (async () => {
      const token = await session.getAdminToken();
      if (token) {
        router.replace("/admin");
      }
    })();
  }, [router]);

  const login = async () => {
    const emailTrimmed = email.trim();
    const passwordTrimmed = password.trim();
    
    if (!emailTrimmed) {
      setError("Lütfen e-posta adresinizi girin.");
      return;
    }
    if (!passwordTrimmed) {
      setError("Lütfen şifrenizi girin.");
      return;
    }
    
    setBusy(true);
    setError("");
    
    try {
      // Clear any existing session data first
      await session.reset();
      
      const response = await adminApi.login({
        email: emailTrimmed,
        password: passwordTrimmed,
      });

      // Save admin session with fresh data from backend
      await session.setAdminToken(response.access_token);
      await session.setAdminEmail(response.owner_email);
      await session.setRestoranId(response.restaurant_id);
      await session.setRestoranAdi(response.restaurant_name);
      await session.setCode(response.gunluk_kod);
      await session.setRole("tablet");

      // Success feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

      // Navigate to tablet/server dashboard
      router.replace("/tablet");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Giriş başarısız";
      console.error("Admin login error:", errorMessage);
      
      if (errorMessage.includes("401") || errorMessage.includes("Invalid email or password")) {
        setError("Geçersiz e-posta veya şifre.");
      } else if (errorMessage.includes("403")) {
        setError("Restoran aboneliği aktif değil.");
      } else if (errorMessage.includes("Failed to fetch") || errorMessage.includes("NetworkError")) {
        setError("Sunucuya bağlanılamadı. Backend çalışıyor mu?");
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
            testID="admin-login-back-button"
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
          <View style={styles.logoContainer}>
            <Feather name="shield" size={64} color={theme.color.brand} />
            <Text style={styles.title}>Yönetim Paneli</Text>
            <Text style={styles.subtitle}>
              Restoran sahibi girişi
            </Text>
          </View>

          <View style={styles.form}>
            <Text style={styles.label}>E-posta</Text>
            <TextInput
              testID="admin-email-input"
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="owner@restaurant.com"
              placeholderTextColor={theme.color.onSurfaceMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />

            <Text style={styles.label}>Şifre</Text>
            <TextInput
              testID="admin-password-input"
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.color.onSurfaceMuted}
              secureTextEntry
              autoCapitalize="none"
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}
            
            <View style={styles.infoBox}>
              <Feather name="info" size={16} color={theme.color.brand} />
              <Text style={styles.infoText}>
                İlk girişte şifreniz otomatik olarak oluşturulacaktır.{"\n"}
                Daha sonra bu şifre ile giriş yapabilirsiniz.
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Pressable
            testID="admin-login-button"
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
  header: { padding: theme.space.md },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.color.surfaceTertiary,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, paddingHorizontal: theme.space.xl },
  logoContainer: {
    alignItems: "center",
    marginTop: theme.space.xxl,
    marginBottom: theme.space.xxl,
  },
  title: { 
    fontSize: 32, 
    fontWeight: "800", 
    color: theme.color.onSurface, 
    marginTop: theme.space.lg,
    letterSpacing: -0.5,
  },
  subtitle: { 
    color: theme.color.onSurfaceMuted, 
    marginTop: theme.space.sm, 
    fontSize: theme.font.lg 
  },
  form: { flex: 1 },
  label: { 
    fontSize: theme.font.base, 
    color: theme.color.onSurfaceMuted, 
    marginTop: theme.space.lg, 
    marginBottom: theme.space.sm,
    fontWeight: "600",
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
    padding: theme.space.xl,
    gap: theme.space.md,
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
  registerLink: {
    paddingVertical: theme.space.md,
    alignItems: "center",
  },
  registerText: {
    color: theme.color.brand,
    fontSize: theme.font.base,
    fontWeight: "600",
  },
});
