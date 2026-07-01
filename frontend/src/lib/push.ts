import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { API } from "./api";

/**
 * Register the current device for push notifications and map it to the
 * (room_code, waiter_name) user identity on the backend.
 *
 * No-op on web and in Expo Go — Expo push requires a native dev/production build.
 * Failures are swallowed silently so nothing blocks the primary flow.
 */
export async function registerForPush(roomCode: string, waiterName: string): Promise<void> {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    if (!tokenResp?.data) return;

    const userId = `${roomCode}:${waiterName.trim().toLowerCase()}`;
    await fetch(`${API}/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        platform: Platform.OS,
        device_token: tokenResp.data,
      }),
    });
  } catch {
    // Swallow — push is best-effort; in-app toast still fires via WebSocket.
  }
}
