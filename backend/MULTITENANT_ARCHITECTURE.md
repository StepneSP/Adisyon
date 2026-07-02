# Multi-Tenant SaaS Architecture

Bu belge, ServeSync sisteminin multi-tenant (çoklu kiracılı) SaaS mimarisini açıklamaktadır.

## 📋 Genel Bakış

Sistem, her restoranın kendi verilerini izole bir şekilde yönetebileceği çoklu kiracılı bir yapıya dönüştürülmüştür.

## 🏗️ Veri Modeli

### 1. Restaurant (Tenant) Modeli

Her restoran bir "tenant" olarak kabul edilir ve benzersiz bir `restoran_id` ile tanımlanır.

```python
class Restaurant(BaseModel):
    id: str                      # Benzersiz UUID
    name: str                    # Restoran adı
    code: str                    # 4 haneli kurulum kodu (başlangıç için)
    gunluk_kod: str              # Günlük değişen 4 haneli giriş kodu
    abonelik_durumu: str         # "aktif" | "pasif"
    owner_email: Optional[str]   # SaaS sahibi email
    owner_phone: Optional[str]   # SaaS sahibi telefon
    created_at: str              # Oluşturulma tarihi
    updated_at: str              # Güncelleme tarihi
```

**Önemli Alanlar:**
- `code`: İlk kurulum için kullanılan 4 haneli kod
- `gunluk_kod`: Garsonların giriş yapmak için kullandığı, her gün değişen 4 haneli kod
- `abonelik_durumu`: Abonelik durumu (aktif/pasif)

### 2. Waiter/Session Modeli

Garsonlar şifresiz, nickname + günlük kod ile giriş yapar. Her giriş için geçici bir oturum (session) oluşturulur.

```python
class WaiterSession(BaseModel):
    id: str                      # Session UUID
    restoran_id: str             # İlişkili restoran
    nickname: str                # Garson nickname
    session_token: str           # JWT token (12 saat geçerli)
    olusturulma_tarihi: str      # Oturum oluşturma zamanı
    son_aktivite: str            # Son aktivite zamanı
```

**Önemli Özellikler:**
- Şifre yok, sadece nickname + günlük kod
- JWT token 12 saat geçerli (bir vardiya süresi)
- Her girişte yeni session oluşturulur
- `son_aktivite` takip edilir

### 3. Mevcut Modeller (Güncellenmiş)

Tüm mevcut modellere `restoran_id` eklendi:

#### Category
```python
class Category(BaseModel):
    id: str
    restoran_id: str  # ← Yeni eklendi
    name: str
    sort: int
```

#### MenuItem
```python
class MenuItem(BaseModel):
    id: str
    restoran_id: str  # ← Yeni eklendi
    name: str
    price: float
    category_id: str
    description: str
    available: bool
```

#### Order
```python
class Order(BaseModel):
    id: str
    restoran_id: str  # ← Yeni eklendi
    table_number: str
    waiter_name: str
    lines: List[OrderLine]
    notes: str
    status: str
    total: float
    created_at: str
    updated_at: str
```

## 🔐 Kimlik Doğrulama (Authentication)

### Garson Girişi (Waiter Login)

Garsonlar şifre kullanmadan giriş yapar:

1. **Giriş Bilgileri:**
   - Nickname (kullanıcı adı)
   - Günlük Kod (restorandan alınan 4 haneli kod)

2. **İşlem Akışı:**
   ```
   Garson → POST /api/auth/waiter/login
          → { "nickname": "Ahmet", "gunluk_kod": "1234" }
          → Sistem günlük kodu doğrular
          → JWT token oluşturur (12 saat)
          → Session veritabanına kaydedilir
          → Token ve kullanıcı bilgileri döndürülür
   ```

3. **JWT Token Kullanımı:**
   - Tüm korumalı endpoint'lerde `Authorization: Bearer <token>` header'ı ile gönderilir
   - Token 12 saat sonra otomatik olarak geçersiz hale gelir

### API Endpoints

#### Restaurant Management
- `POST /api/restaurants` - Yeni restoran oluştur
- `GET /api/restaurants/{restoran_id}` - Restoran bilgilerini getir
- `PUT /api/restaurants/{restoran_id}` - Restoran güncelle
- `POST /api/restaurants/{restoran_id}/regenerate-daily-code` - Günlük kodu yenile

#### Waiter Authentication
- `POST /api/auth/waiter/login` - Garson girişi
- `POST /api/auth/waiter/logout` - Garson çıkışı
- `GET /api/auth/waiter/me` - Mevcut garson bilgileri

#### Categories (Kategoriler)
- `GET /api/restaurants/{restoran_id}/categories` - Kategorileri listele
- `POST /api/restaurants/{restoran_id}/categories` - Kategori ekle
- `PUT /api/restaurants/{restoran_id}/categories/{cat_id}` - Kategori güncelle
- `DELETE /api/restaurants/{restoran_id}/categories/{cat_id}` - Kategori sil

#### Menu Items (Menü Ürünleri)
- `GET /api/restaurants/{restoran_id}/items` - Ürünleri listele
- `POST /api/restaurants/{restoran_id}/items` - Ürün ekle
- `PUT /api/restaurants/{restoran_id}/items/{item_id}` - Ürün güncelle
- `DELETE /api/restaurants/{restoran_id}/items/{item_id}` - Ürün sil

#### Orders (Siparişler)
- `GET /api/restaurants/{restoran_id}/orders` - Siparişleri listele
- `POST /api/restaurants/{restoran_id}/orders` - Sipariş oluştur
- `PUT /api/restaurants/{restoran_id}/orders/{order_id}` - Sipariş düzenle
- `PUT /api/restaurants/{restoran_id}/orders/{order_id}/status` - Sipariş durumu güncelle

#### Stats (İstatistikler)
- `GET /api/restaurants/{restoran_id}/stats` - Restoran istatistikleri

#### WebSocket
- `WS /api/ws/{restaurant_code}` - Gerçek zamanlı güncellemeler

## 🔄 Veri İzolasyonu

Her restoranın verileri diğerlerinden **tamamen izole** edilmiştir:

- Tüm sorgular `restoran_id` ile filtrelenir
- WebSocket bağlantıları restoran koduna göre yönetilir
- Push bildirimleri restoran içinde çalışır

## 📊 Veritabanı Koleksiyonları

### Yeni Koleksiyonlar
1. **restaurants** - Restoran/tenant bilgileri
2. **waiter_sessions** - Garson oturumları

### Güncellenen Koleksiyonlar
1. **categories** - `restoran_id` eklendi
2. **items** - `restoran_id` eklendi
3. **orders** - `restoran_id` eklendi

## 🚀 Kurulum ve Migrasyon

### 1. Gerekli Paketler

```bash
pip install -r backend/requirements.txt
```

Gerekli paketler zaten `requirements.txt`'de mevcuttur:
- `python-jose[cryptography]` - JWT token işlemleri
- `passlib[bcrypt]` - Şifre hashleme (gelecek kullanım için)
- Diğer tüm bağımlılıklar

### 2. Migrasyon

Mevcut veritabanını multi-tenant yapıya dönüştürmek için:

```bash
cd backend
python migrate_to_multitenant.py
```

Bu script:
- Varsayılan bir restoran oluşturur
- Mevcut tüm verilere `restoran_id` ekler
- Gerekli index'leri oluşturur

### 3. Ortam Değişkenleri

`.env` dosyasına eklemeniz gerekenler:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=servesync
JWT_SECRET_KEY=your-super-secret-key-change-in-production
EMERGENT_PUSH_KEY=your-push-notification-key
```

**ÖNEMLİ:** `JWT_SECRET_KEY` production'da güçlü bir değerle değiştirin!

## 🔑 Güvenlik

### Günlük Kod Yönetimi

- Günlük kod her gün değiştirilmeli
- Sadece restoran sahibi/müdürü kodu bilir
- Kod 4 haneli rakamdan oluşur
- Cron job ile otomatik değiştirilebilir

### JWT Token Güvenliği

- Token'lar 12 saat geçerli
- Her girişte yeni token oluşturulur
- Token'lar HTTPS üzerinden iletilmeli
- `son_aktivite` ile oturum takibi yapılır

### Abonelik Kontrolü

- `abonelik_durumu = "pasif"` olan restoranlar API'ye erişemez
- Ödeme durumu kontrolü eklenebilir

## 📱 Frontend Entegrasyonu

### Giriş Akışı

```typescript
// 1. Garson girişi
const login = async (nickname: string, dailyCode: string) => {
  const response = await fetch('/api/auth/waiter/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nickname, gunluk_kod: dailyCode })
  });
  
  const data = await response.json();
  // data.session_token → kaydet
  // data.restoran_id → kaydet
  // data.restoran_adi → göster
};

// 2. Korumalı istekler
const fetchOrders = async (restaurantId: string, token: string) => {
  const response = await fetch(`/api/restaurants/${restaurantId}/orders`, {
    headers: { 
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
  return response.json();
};
```

## 🔄 WebSocket Kullanımı

```typescript
// WebSocket bağlantısı
const ws = new WebSocket(`ws://your-api.com/api/ws/${restaurantCode}`);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  if (data.event === 'order_created') {
    // Yeni sipariş bildirimi
    showNotification('Yeni sipariş!', data.order);
  }
  
  if (data.event === 'order_updated') {
    // Sipariş güncelleme bildirimi
    updateOrderUI(data.order);
  }
};
```

## 📈 Ölçeklendirme

### Çoklu Restoran Desteği

- Her restoran kendi veritabanı koleksiyonlarını paylaşır ama `restoran_id` ile ayrılır
- Yeni restoran eklemek için sadece `restaurants` koleksiyonuna yeni doküman eklenir
- Veriler otomatik olarak izole edilir

### Performans İyileştirmeleri

- Index'ler tüm `restoran_id` alanlarına uygulandı
- Sık kullanılan sorgular optimize edildi
- WebSocket bağlantıları restoran bazlı yönetilir

## 🧪 Test

```bash
# Backend testleri
cd backend
pytest tests/

# Migration testi
python migrate_to_multitenant.py
```

## 📝 Gelecek Geliştirmeler

1. **SaaS Admin Paneli**
   - Tüm restoranları yönetme
   - Abonelik takibi
   - Ödeme entegrasyonu

2. **Rol-based Access Control (RBAC)**
   - Admin, Müdür, Garson rolleri
   - Farklı yetki seviyeleri

3. **Gelişmiş Özellikler**
   - Otomatik günlük kod değişimi (cron job)
   - Detaylı raporlama
   - Çoklu dil desteği

## 🆘 Destek

Sorularınız için:
- GitHub Issues: https://github.com/StepneSP/Adisyon/issues
- Email: support@servesync.com

---

**Son Güncelleme:** 2026-02-02
**Versiyon:** 1.0.0