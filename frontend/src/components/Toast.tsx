import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { theme } from "@/src/lib/theme";

type ToastKind = "success" | "info" | "error";
type ToastMsg = { id: number; title: string; message?: string; kind: ToastKind };
type Ctx = { show: (t: Omit<ToastMsg, "id">) => void };

const ToastCtx = createContext<Ctx>({ show: () => {} });

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastMsg[]>([]);
  const idRef = useRef(1);

  const show = useCallback((t: Omit<ToastMsg, "id">) => {
    const id = idRef.current++;
    setItems((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((x) => x.id !== id));
    }, 4500);
  }, []);

  const dismiss = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));

  return (
    <ToastCtx.Provider value={{ show }}>
      {children}
      <ToastStack items={items} onDismiss={dismiss} />
    </ToastCtx.Provider>
  );
}

function ToastStack({ items, onDismiss }: { items: ToastMsg[]; onDismiss: (id: number) => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={[styles.stack, { top: insets.top + 8 }]}>
      {items.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </View>
  );
}

function ToastCard({ toast, onDismiss }: { toast: ToastMsg; onDismiss: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [anim]);

  const meta = KIND[toast.kind];
  return (
    <Animated.View
      style={[
        styles.toast,
        {
          borderLeftColor: meta.color,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) },
          ],
          opacity: anim,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: meta.bg }]}>
        <Feather name={meta.icon as any} size={18} color={meta.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{toast.title}</Text>
        {toast.message ? <Text style={styles.message}>{toast.message}</Text> : null}
      </View>
      <Pressable onPress={onDismiss} hitSlop={8}>
        <Feather name="x" size={18} color={theme.color.onSurfaceMuted} />
      </Pressable>
    </Animated.View>
  );
}

const KIND: Record<ToastKind, { color: string; bg: string; icon: string }> = {
  success: { color: theme.color.success, bg: "#E3EFE5", icon: "check-circle" },
  info: { color: theme.color.brand, bg: theme.color.brandTint, icon: "info" },
  error: { color: theme.color.error, bg: "#FCE9E9", icon: "alert-circle" },
};

const styles = StyleSheet.create({
  stack: { position: "absolute", left: 12, right: 12, gap: 8, zIndex: 1000 },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: theme.color.surfaceSecondary,
    borderRadius: theme.radius.md,
    borderLeftWidth: 4,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  iconWrap: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  title: { color: theme.color.onSurface, fontWeight: "700", fontSize: theme.font.base },
  message: { color: theme.color.onSurfaceMuted, fontSize: theme.font.sm, marginTop: 2 },
});
