import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { theme } from "@/src/lib/theme";

export default function WaiterTabs() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.color.brand,
        tabBarInactiveTintColor: theme.color.onSurfaceMuted,
        tabBarStyle: {
          backgroundColor: theme.color.surfaceSecondary,
          borderTopColor: theme.color.border,
          height: 64,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
      }}
    >
      <Tabs.Screen
        name="menu"
        options={{
          title: "Menu",
          tabBarIcon: ({ color, size }) => <Feather name="book-open" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: "My orders",
          tabBarIcon: ({ color, size }) => <Feather name="clipboard" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
