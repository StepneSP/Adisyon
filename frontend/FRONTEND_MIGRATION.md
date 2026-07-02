# Frontend Multi-Tenant Migration Guide

Bu rehber, frontend uygulamasını yeni multi-tenant backend mimarisine adapte etmek için yapılan değişiklikleri açıklamaktadır.

## 📋 Yapılan Değişiklikler

### 1. Giriş Ekranı (Login Screen)

**Dosya:** `frontend/app/waiter/pair.tsx`

**Değişiklikler:**
- ✅ Eski "pairing code" (tablet kodu) sistemi kaldırıldı
- ✅ Yeni "Günün Kodu" (daily code) sistemi eklendi
- ✅ Backend'e `/api/auth/waiter/login` endpoint'i kullanılarak giriş yapılıyor
- ✅ JWT token backend'den alınıp localStorage'a kaydediliyor
- ✅ Giriş başarılı olunca waiter dashboard'a yönlendiriliyor

**Önceki Akış:**
```
Garson → 4 haneli pairing code (tablet kodu) → /api/rooms/{code}
```

**Yeni Akış:**
```
Garson → Nickname + Günün Kodu → /api/auth/waiter/login
      → JWT Token al → localStorage'a kaydet → Dashboard
```

**Kullanıcı Arayüzü:**
- Başlık: "Garson Girişi"
- 4 haneli kod girişi (Günün Kodu)
- Nickname girişi (Adınız)
- "Giriş Yap" butonu
- Bilgi kutusu: "Günlük kod her gün değişir..."

### 2. API Servis Güncellemeleri

**Dosya:** `frontend/src/lib/api.ts`

**Yeni Eklenenler:**
```typescript
// Authentication API
export const authApi = {
  login: (payload: { nickname: string; gunluk_kod: string }) => ...,
  logout: () => ...,
  getMe: () => ...,
};

// Restaurant API
export const restaurantApi = {
  create: (payload) => ...,
  get: (restoran_id) => ...,
  update: (restoran_id, payload) => ...,
  regenerateDailyCode: (restoran_id) => ...,
};

// Category API (restoran_id parametresi eklendi)
export const categoryApi = {
  list: (restoran_id) => ...,
  create: (restoran_id, name) => ...,
  update: (restoran_id, cat_id, name) => ...,
  delete: (restoran_id, cat_id) => ...,
};

// Menu Item API (restoran_id parametresi eklendi)
export const menuItemApi = {
  list: (restoran_id) => ...,
  create: (restoran_id, payload) => ...,
  update: (restoran_id, item_id, payload) => ...,
  delete: (restoran_id, item_id) => ...,
};

// Order API (restoran_id parametresi eklendi)
export const orderApi = {
  list: (restoran_id, activeOnly?) => ...,
  create: (restoran_id, payload) => ...,
  update: (restoran_id, order_id, payload) => ...,
  updateStatus: (restoran_id, order_id, status) => ...,
};

// Stats API (restoran_id parametresi eklendi)
export const statsApi = {
  get: (restoran_id) => ...,
};
```

**Önemli Değişiklikler:**
- Tüm API fonksiyonları artık `restoran_id` parametresi alıyor
- `req()` fonksiyonu otomatik olarak JWT token'ı Authorization header'ına ekliyor
- Eski `room_code` parametreleri `restoran_id` ile değiştirildi

### 3. Session Yönetimi

**Dosya:** `frontend/src/lib/session.ts`

**Yeni Eklenen Alanlar:**
```typescript
// JWT Token
const K_TOKEN = "servesync.token";
getToken: () => storage.getItem<string>(K_TOKEN, ""),
setToken: (t: string) => storage.setItem(K_TOKEN, t),
clearToken: () => storage.removeItem(K_TOKEN),

// Restaurant ID
const K_RESTORAN_ID = "servesync.restoran_id";
getRestoranId: () => storage.getItem<string>(K_RESTORAN_ID, ""),
setRestoranId: (id: string) => storage.setItem(K_RESTORAN_ID, id),
clearRestoranId: () => storage.removeItem(K_RESTORAN_ID),

// Restaurant Name
const K_RESTORAN_ADI = "servesync.restoran_adi";
getRestoranAdi: () => storage.getItem<string>(K_RESTORAN_ADI, ""),
setRestoranAdi: (ad: string) => storage.setItem(K_RESTORAN_ADI, ad),
clearRestoranAdi: () => storage.removeItem(K_RESTORAN_ADI),
```

**Kaydedilen Veriler:**
- `servesync.role` - "waiter" veya "tablet"
- `servesync.code` - Günlük kod (geriye dönük uyumluluk için)
- `servesync.waiter_name` - Garson adı
- `servesync.token` - JWT session token (**YENİ**)
- `servesync.restoran_id` - Restoran ID (**YENİ**)
- `servesync.restoran_adi` - Restoran adı (**YENİ**)

### 4. Waiter Orders Screen

**Dosya:** `frontend/app/waiter/(tabs)/orders.tsx`

**Değişiklikler:**
- `code` state'i `restoranId` olarak değiştirildi
- `restaurantCode` state'i eklendi (WebSocket için)
- Tüm API çağrıları `orderApi` kullanılarak yapılıyor
- `restoranId` parametresi tüm fonksiyonlara geçiliyor
- WebSocket bağlantısı `restaurantCode` ile kuruluyor

**Örnek:**
```typescript
// Eski:
const list = await api.listOrders(code, false);
await api.updateOrderStatus(code, o.id, "served");

// Yeni:
const list = await orderApi.list(restoranId, false);
await orderApi.updateStatus(restoranId, o.id, "served");
```

### 5. Waiter Menu Screen

**Dosya:** `frontend/app/waiter/(tabs)/menu.tsx`

**Değişiklikler:**
- `code` state'i `restoranId` olarak değiştirildi
- API çağrıları `categoryApi`, `menuItemApi`, `orderApi` kullanılarak yapılıyor
- Sipariş oluşturma `orderApi.create(restoranId, ...)` ile yapılıyor

**Örnek:**
```typescript
// Eski:
const [cs, is] = await Promise.all([api.listCategories(c), api.listItems(c)]);
await api.createOrder(code, { ... });

// Yeni:
const [cs, is] = await Promise.all([
  categoryApi.list(rid),
  menuItemApi.list(rid)
]);
await orderApi.create(restoranId, { ... });
```

## 🔐 JWT Token Kullanımı

### Token Otomatik Ekleme

`api.ts` dosyasındaki `req()` fonksiyonu, her istekte otomatik olarak JWT token'ı ekliyor:

```typescript
async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> || {}),
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers,
  });
  
  // ...
}
```

### Token Saklama

Token'lar `session.ts` üzerinden localStorage'a kaydediliyor:

```typescript
// Login sonrası:
await session.setToken(response.session_token);
await session.setRestoranId(response.restoran_id);
await session.setRestoranAdi(response.restoran_adi);
```

## 📊 Veri Akışı

### Giriş Akışı

```
1. Kullanıcı açılış ekranında "I'm a Waiter" seçer
   ↓
2. pair.tsx ekranı açılır (nickname + daily code)
   ↓
3. Kullanıcı bilgileri girer ve "Giriş Yap" butonuna basar
   ↓
4. authApi.login() çağrılır → POST /api/auth/waiter/login
   ↓
5. Backend JWT token döndürür
   ↓
6. Token ve restoran bilgileri localStorage'a kaydedilir
   ↓
7. /waiter (dashboard) ekranına yönlendirilir
```

### Sipariş Akışı

```
1. Menu ekranında ürünler seçilir ve sepete eklenir
   ↓
2. "Review order" butonuna basılır
   ↓
3. Masa numarası girilir
   ↓
4. "Send to kitchen" butonuna basılır
   ↓
5. orderApi.create(restoranId, payload) çağrılır
   ↓
6. Backend otomatik olarak:
   - Siparişi veritabanına kaydeder
   - WebSocket ile tüm bağlı cihazlara bildirim gönderir
   ↓
7. Orders ekranı otomatik olarak güncellenir (WebSocket)
```

### Gerçek Zamanlı Güncellemeler

```
1. Backend'de sipariş durumu değişir
   ↓
2. WebSocket mesajı gönderilir: { event: "order_updated", order: {...} }
   ↓
3. Frontend useRoomSocket hook mesajı alır
   ↓
4. Orders listesi otomatik güncellenir
   ↓
5. Eğer kendi siparişinizse ve "ready" durumuna geçerse:
   - Haptic feedback (titreşim)
   - Toast bildirimi gösterilir
```

## 🧪 Test

### Manuel Test Adımları

1. **Backend'i başlatın:**
   ```bash
   cd backend
   uvicorn server:app --reload
   ```

2. **Migrasyonu çalıştırın:**
   ```bash
   python migrate_to_multitenant.py
   ```

3. **Frontend'i başlatın:**
   ```bash
   cd frontend
   npm start
   ```

4. **Test senaryosu:**
   - Açılış ekranında "I'm a Waiter" seçin
   - Nickname girin: "Ahmet"
   - Günlük kod girin: `0000` (migrasyon sonrası varsayılan)
   - "Giriş Yap" butonuna basın
   - Menu ekranında ürünleri görün
   - Sipariş oluşturun
   - Orders ekranında siparişi görün

### API Test (curl ile)

```bash
# Login testi
curl -X POST http://localhost:8000/api/auth/waiter/login \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Ahmet","gunluk_kod":"0000"}'

# Yanıt:
{
  "session_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "nickname": "Ahmet",
  "restoran_id": "default-restaurant-001",
  "restoran_adi": "Default Restaurant",
  "gunluk_kod": "0000"
}

# Token ile korumalı endpoint'i test etme
curl http://localhost:8000/api/restaurants/default-restaurant-001/categories \
  -H "Authorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGc..."
```

## 🔄 Geriye Dönük Uyumluluk

### Eski Veriler

Mevcut veriler `migrate_to_multitenant.py` ile otomatik olarak güncellenir:
- Tüm `categories` → `restoran_id` eklenir
- Tüm `items` → `restoran_id` eklenir
- Tüm `orders` → `restoran_id` eklenir
- Varsayılan bir restoran oluşturulur

### Tablet Ekranı

Tablet ekranları (`frontend/app/tablet/`) **değiştirilmemiştir**. Onlar ayrı bir akışı yönetir ve bu migration'dan etkilenmez.

## 📝 Önemli Notlar

1. **Günlük Kod Yönetimi:**
   - Günlük kod her gün değiştirilmeli
   - Restoran yöneticisi tarafından backend API üzerinden güncellenmeli
   - `POST /api/restaurants/{id}/regenerate-daily-code` endpoint'i kullanılabilir

2. **JWT Token Geçerliliği:**
   - Token'lar 12 saat geçerli
   - Süre sonunda kullanıcı tekrar giriş yapmalı
   - Token'lar localStorage'da saklanıyor

3. **WebSocket Bağlantısı:**
   - WebSocket hala `restaurant code` (4 haneli kurulum kodu) ile çalışıyor
   - Bu kod değişmez, sadece günlük giriş kodu değişiyor

4. **Hata Yönetimi:**
   - 401: Geçersiz günlük kod
   - 403: Restoran aboneliği aktif değil
   - 404: Restoran bulunamadı

## 🚀 Gelecek Geliştirmeler

1. **Token Yenileme (Refresh Token):**
   - 12 saat sonra otomatik token yenileme
   - Kullanıcıyı otomatik olarak girişte tutma

2. **Çoklu Giriş:**
   - Aynı garson farklı cihazlardan girebilmeli
   - Session yönetimi iyileştirilmeli

3. **Offline Mod:**
   - İnternet yokken siparişleri kaydetme
   - Bağlantı geri geldiğinde senkronize etme

4. **Push Bildirimleri:**
   - Sipariş durumu değişikliklerinde push notification
   - "Siparişiniz hazır" bildirimleri

## 📚 İlgili Dosyalar

- `backend/server.py` - Multi-tenant backend
- `backend/migrate_to_multitenant.py` - Veritabanı migrasyonu
- `frontend/src/lib/api.ts` - Güncellenen API servisleri
- `frontend/src/lib/session.ts` - Güncellenen session yönetimi
- `frontend/app/waiter/pair.tsx` - Yeni giriş ekranı
- `frontend/app/waiter/(tabs)/orders.tsx` - Güncellenen siparişler ekranı
- `frontend/app/waiter/(tabs)/menu.tsx` - Güncellenen menu ekranı

---

**Son Güncelleme:** 2026-02-02  
**Frontend Versiyon:** 2.0.0 (Multi-Tenant)