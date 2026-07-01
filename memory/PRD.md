# ServeSync — Restaurant Order-Taking MVP

## Overview
Dual-role Expo app: tablet acts as the "server" (kitchen display + admin), phones act as waiter order-taking clients. They connect via a 4-digit pairing code and communicate in real time via WebSocket over the shared backend.

## User roles
- **Tablet (Server)** — creates the restaurant, holds the pairing code, edits the menu, receives orders live, advances order status, sees history & reports.
- **Waiter (Phone)** — enters the pairing code + name, picks a table (alphanumeric), browses menu, sends orders, tracks status, can edit their own active orders.

## Screens
1. `/` Role Picker
2. `/tablet/setup` — restaurant creation (name → 4-digit code)
3. `/tablet/(tabs)/orders` — live Kanban board (New/Preparing/Ready/Served) with Edit, Cancel, Finish buttons per order + Settings gear
4. `/tablet/(tabs)/menu` — categories chips + items with price / availability toggle, add / edit / delete
5. `/tablet/(tabs)/history` — today + weekly revenue, top items, waiter breakdown, all orders
6. `/waiter/pair` — enter 4-digit code + waiter name
7. `/waiter/(tabs)/menu` — table selector (alphanumeric), category chips, item cards with quick-add stepper, cart bottom sheet, send-to-kitchen
8. `/waiter/(tabs)/orders` — my active + past orders, tap to edit while active, toast+haptic when kitchen marks the order Ready/Finished

## Backend (FastAPI + MongoDB + WebSocket)
All under `/api`:
- `POST /rooms` create room (auto-seeds 4 categories, 13 default items)
- `GET  /rooms/{code}` get room
- `PUT  /rooms/{code}` rename restaurant
- `POST /rooms/{code}/regenerate` new pairing code (cascades)
- CRUD categories, items
- `GET/POST /rooms/{code}/orders`
- `PUT /rooms/{code}/orders/{id}` edit lines / table / notes
- `PUT /rooms/{code}/orders/{id}/status` advance status
- `GET /rooms/{code}/stats` daily/weekly revenue + top items + waiter breakdown
- `WS  /ws/{code}` broadcasts `order_created`, `order_updated`

## Frontend architecture
- Expo Router file-based (Stack + Tabs)
- Storage keys: `servesync.role`, `servesync.code`, `servesync.waiter_name`
- Design tokens in `/src/lib/theme.ts` (warm terracotta palette)
- Shared: `SettingsSheet`, `OrderEditor`, `Toast` provider
- WebSocket hook with exponential-backoff reconnection

## Not built (future)
- Multi-tenant auth (currently pairing-code only per requirements)
- Kitchen printing to a physical thermal printer (currently uses `expo-print` → OS print dialog or PDF share)

## Iteration 2 additions
- **Expo Push (iOS)** via Emergent-managed relay: `POST /api/register-push`, backend triggers on order → ready/served with per-waiter `user_id = {room_code}:{waiter_name}`. Non-blocking — order status still returns 200 if relay unavailable. Preview key is `placeholder`; auto-swapped at deploy. Requires a deployed iOS build to actually fire (does NOT work in Expo Go / preview browser).
- **Kitchen ticket** — receipt-styled preview accessible from Order card ("Ticket" button) on both tablet and waiter. Uses `expo-print`+`expo-sharing` for Save-as-PDF and OS print dialog.
- **Bill splitter** — Equal (people + tip %) and By-items (assign each line to P1/P2/… with unassigned warning + proportional tip redistribution). Accessible on served orders from tablet + waiter Orders cards.
