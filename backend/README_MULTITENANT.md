# Multi-Tenant Migration - Quick Start Guide

Bu rehber, ServeSync sistemini multi-tenant SaaS mimarisine dönüştürmek için adım adım talimatlar içerir.

## 📦 Adım 1: Bağımlılıkların Yüklenmesi

```bash
cd backend
pip install -r requirements.txt
```

Tüm gerekli paketler zaten yüklü:
- ✅ `python-jose` - JWT token işlemleri
- ✅ `passlib` - Şifre hashleme
- ✅ `bcrypt` - Hash algoritması
- ✅ Diğer tüm bağımlılıklar

## 🗄️ Adım 2: Veritabanı Migrasyonu

Mevcut veritabanını multi-tenant yapıya dönüştürün:

```bash
cd backend
python migrate_to_multitenant.py
```

Bu script şunları yapar:
- ✅ Varsayılan bir restoran oluşturur
- ✅ Mevcut tüm verilere `restoran_id` ekler
- ✅ Gerekli index'leri oluşturur
- ✅ Veri izolasyonunu sağlar

**Çıktı:**
```
Starting multi-tenant migration...

1. Creating default restaurant...
✓ Created default restaurant with ID: default-restaurant-001
  - Pairing code: 1234
  - Daily code: 0000

2. Checking for existing rooms...
  No existing rooms found

3. Adding restoran_id to categories...
  ✓ Updated X categories

4. Adding restoran_id to items...
  ✓ Updated X items

5. Adding restoran_id to orders...
  ✓ Updated X orders

6. Creating indexes...
  ✓ Created indexes for restaurants
  ✓ Created indexes for waiter_sessions
  ✓ Created indexes for categories
  ✓ Created indexes for items
  ✓ Created indexes for orders

============================================================
✓ Migration completed successfully!
============================================================
```

## ⚙️ Adım 3: Ortam Değişkenleri

1. `.env.example` dosyasını kopyalayın:
   ```bash
   cp .env.example .env
   ```

2. `.env` dosyasını düzenleyin ve gerekli değerleri girin:
   ```env
   # MongoDB
   MONGO_URL=mongodb://localhost:27017
   DB_NAME=servesync
   
   # JWT (PRODUCTION'DA MUTLAKA DEĞİŞTİRİN!)
   JWT_SECRET_KEY=your-super-secret-key-change-in-production-minimum-32-characters
   
   # Push Notifications
   EMERGENT_PUSH_KEY=your-push-notification-key-here
   ```

## 🧪 Adım 4: Test

Migrasyonun başarılı olup olmadığını test edin:

```bash
python test_multitenant.py
```

**Beklenen Çıktı:**
```
============================================================
Testing Multi-Tenant Architecture
============================================================

1. Testing restaurants collection...
   ✓ Found 1 restaurant(s)
   ✓ Restaurant: Default Restaurant
   ✓ ID: default-restaurant-001
   ✓ Daily Code: 0000
   ✓ Status: aktif

2. Testing categories...
   ✓ Found X categories for this restaurant

3. Testing menu items...
   ✓ Found X items for this restaurant

4. Testing orders...
   ✓ Found X orders for this restaurant

5. Testing data isolation...
   ✓ All items have restoran_id (data is isolated)

6. Testing JWT authentication...
   ✓ Created JWT token: eyJ0eXAiOiJKV1QiLCJhbGc...
   ✓ Decoded token: {'sub': 'test-session-123', ...}
   ✓ JWT token validation successful

7. Testing database indexes...
   ✓ Restaurants collection has X indexes
   ✓ Categories collection has X indexes
   ✓ Items collection has X indexes
   ✓ Orders collection has X indexes

============================================================
✓ All tests passed!
============================================================

✅ Multi-tenant architecture is working correctly!
```

## 🚀 Adım 5: Sunucuyu Başlatma

```bash
# Development mode
uvicorn server:app --reload --host 0.0.0.0 --port 8000

# Production mode
uvicorn server:app --host 0.0.0.0 --port 8000 --workers 4
```

## 📱 Adım 6: Frontend Entegrasyonu

### Giriş Akışı

```typescript
// 1. Garson girişi
const login = async (nickname: string, dailyCode: string) => {
  const response = await fetch('/api/auth/waiter/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ 
      nickname, 
      gunluk_kod: dailyCode 
    })
  });
  
  const data = await response.json();
  
  // Token'ı kaydet
  localStorage.setItem('session_token', data.session_token);
  localStorage.setItem('restoran_id', data.restoran_id);
  localStorage.setItem('nickname', data.nickname);
  
  return data;
};

// 2. Korumalı API istekleri
const getOrders = async (restoranId: string) => {
  const token = localStorage.getItem('session_token');
  
  const response = await fetch(
    `/api/restaurants/${restoranId}/orders`,
    {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    }
  );
  
  return response.json();
};

// 3. WebSocket bağlantısı
const connectWebSocket = (restaurantCode: string) => {
  const ws = new WebSocket(
    `ws://your-domain.com/api/ws/${restaurantCode}`
  );
  
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    
    switch (data.event) {
      case 'order_created':
        showNewOrderNotification(data.order);
        break;
      case 'order_updated':
        updateOrderUI(data.order);
        break;
    }
  };
  
  return ws;
};
```

## 🔑 Önemli Bilgiler

### Varsayılan Giriş Bilgileri

Migrasyon sonrası varsayılan restoran:
- **Restaurant ID:** `default-restaurant-001`
- **Pairing Code:** `1234` (kurulum için)
- **Daily Code:** `0000` (garson girişi için)

⚠️ **GÜVENLİK UYARISI:** Production'da mutlaka:
1. Günlük kodu her gün değiştirin
2. JWT_SECRET_KEY'yi güçlü bir değerle değiştirin
3. HTTPS kullanın

### API Endpoints

#### Authentication
- `POST /api/auth/waiter/login` - Garson girişi
- `POST /api/auth/waiter/logout` - Garson çıkışı
- `GET /api/auth/waiter/me` - Mevcut kullanıcı bilgileri

#### Restaurant Management
- `POST /api/restaurants` - Yeni restoran oluştur
- `GET /api/restaurants/{restoran_id}` - Restoran bilgileri
- `PUT /api/restaurants/{restoran_id}` - Restoran güncelle
- `POST /api/restaurants/{restoran_id}/regenerate-daily-code` - Günlük kodu yenile

#### Categories
- `GET /api/restaurants/{restoran_id}/categories` - Kategorileri listele
- `POST /api/restaurants/{restoran_id}/categories` - Kategori ekle
- `PUT /api/restaurants/{restoran_id}/categories/{cat_id}` - Kategori güncelle
- `DELETE /api/restaurants/{restoran_id}/categories/{cat_id}` - Kategori sil

#### Menu Items
- `GET /api/restaurants/{restoran_id}/items` - Ürünleri listele
- `POST /api/restaurants/{restoran_id}/items` - Ürün ekle
- `PUT /api/restaurants/{restoran_id}/items/{item_id}` - Ürün güncelle
- `DELETE /api/restaurants/{restoran_id}/items/{item_id}` - Ürün sil

#### Orders
- `GET /api/restaurants/{restoran_id}/orders` - Siparişleri listele
- `POST /api/restaurants/{restoran_id}/orders` - Sipariş oluştur
- `PUT /api/restaurants/{restoran_id}/orders/{order_id}` - Sipariş düzenle
- `PUT /api/restaurants/{restoran_id}/orders/{order_id}/status` - Durum güncelle

#### Stats
- `GET /api/restaurants/{restoran_id}/stats` - İstatistikler

#### WebSocket
- `WS /api/ws/{restaurant_code}` - Gerçek zamanlı güncellemeler

## 🛡️ Güvenlik Kontrol Listesi

- [ ] JWT_SECRET_KEY production'da değiştirildi
- [ ] HTTPS kullanılıyor
- [ ] Günlük kod her gün değiştiriliyor
- [ ] MongoDB erişimi sadece localhost'tan veya VPN üzerinden
- [ ] CORS sadece güvenilir origin'lere ayarlandı
- [ ] Rate limiting eklendi (opsiyonel ama önerilir)
- [ ] API key koruması eklendi (opsiyonel)

## 🐛 Sorun Giderme

### Migrasyon çalışmıyor
```bash
# MongoDB'nin çalıştığından emin olun
mongod --version

# Bağlantıyı test edin
python -c "from motor.motor_asyncio import AsyncIOMotorClient; print('MongoDB driver OK')"
```

### JWT token hatası
- `.env` dosyasında `JWT_SECRET_KEY` ayarlandığından emin olun
- Token'ın 12 saat içinde kullanıldığından emin olun

### Veriler görünmüyor
- Migrasyon scriptini tekrar çalıştırın
- `restoran_id` alanlarının dolu olduğunu doğrulayın

## 📚 Ek Belgeler

- [MULTITENANT_ARCHITECTURE.md](MULTITENANT_ARCHITECTURE.md) - Detaylı mimari dokümantasyon
- [migrate_to_multitenant.py](migrate_to_multitenant.py) - Migrasyon scripti
- [test_multitenant.py](test_multitenant.py) - Test scripti

## 🆘 Yardım

Sorun yaşıyorsanız:
1. Log'ları kontrol edin
2. MongoDB bağlantısını test edin
3. `.env` dosyasını kontrol edin
4. Test scriptini çalıştırın: `python test_multitenant.py`

---

**Son Güncelleme:** 2026-02-02  
**Versiyon:** 1.0.0