# MongoDB Atlas - Ücretsiz Cluster Kurulum Rehberi

Bu rehber, MongoDB Atlas'te ücretsiz bir cluster (veritabanı kümesi) oluşturmanızı ve bağlantı stringini almanızı adım adım açıklamaktadır.

## 📋 Gereksinimler

- MongoDB Atlas hesabı (ücretsiz)
- 5-10 dakika zaman
- Kredi kartı **GEREKMİYOR** (sadece doğrulama için istenebilir)

## 🚀 Adım 1: MongoDB Atlas Hesabı Oluşturma

1. **MongoDB Atlas web sitesine gidin:**
   ```
   https://www.mongodb.com/atlas/database
   ```

2. **"Try Free" veya "Get Started" butonuna tıklayın**

3. **Kayıt formunu doldurun:**
   - Email adresiniz
   - Şifre
   - Adınız ve soyadınız
   - Şirket adı (opsiyonel, "Individual" seçebilirsiniz)

4. **"Create your Atlas account" butonuna tıklayın**

## 🗄️ Adım 2: Ücretsiz Cluster Oluşturma

1. **"Build a Database" ekranında:**
   - **M0** seçin (ücretsiz tier - "Shared" yazıyor)
   - Sağ altta **"Create Cluster"** butonuna tıklayın

2. **Cluster ayarları:**
   - **Cloud Provider**: AWS (önerilen) veya Google Cloud
   - **Region**: En yakın bölgeyi seçin (ör: Frankfurt, London, Virginia)
   - **Cluster Name**: İsteğe bağlı (ör: `servesync-cluster`)

3. **"Create Cluster" butonuna tıklayın** (oluşturma 3-5 dakika sürer)

## 👤 Adım 3: Kullanıcı Oluşturma

1. **"Quickstart" ekranında "Create Database User" bölümüne gidin**

2. **Kullanıcı bilgilerini girin:**
   - **Username**: `servesync_user` (veya istediğiniz bir kullanıcı adı)
   - **Password**: Güçlü bir şifre oluşturun (en az 8 karakter)
   - ⚠️ **Bu bilgileri kaydedin!** Bağlantıda kullanacaksınız

3. **"Create User" butonuna tıklayın**

## 🌐 Adım 4: IP Adreslerini Yetkilendirme

1. **"IP Access List" bölümüne gidin**

2. **"Add IP Address" butonuna tıklayın**

3. **Geliştirme için en kolay seçenek:**
   - **"Add Current IP Address"** seçin (sizin IP'niz)
   - Veya **"Allow Access from Anywhere"** seçin (0.0.0.0/0) - **Sadece geliştirme için!**

4. **"Confirm" butonuna tıklayın**

⚠️ **GÜVENLIK NOTU:** Production'da sadece güvenilir IP'leri ekleyin. "Allow Access from Anywhere" sadece test için kullanılmalıdır.

## 🔗 Adım 5: Bağlantı Stringini Alma

1. **"Database" sekmesine geri dönün**

2. **"Connect" butonuna tıklayın**

3. **"Drivers" seçeneğini seçin**

4. **Driver bilgileri:**
   - **Driver**: Python
   - **Version**: 3.12 veya sürümünüzle uyumlu olanı seçin

5. **Bağlantı stringini kopyalayın:**
   
   Format şu şekilde olacaktır:
   ```
   mongodb+srv://servesync_user:YOUR_PASSWORD@servesync-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

6. **String'i düzenleyin:**
   - `YOUR_PASSWORD` kısmına oluşturduğunuz şifreyi yazın
   - Sonuna `/adisyon` ekleyin (veritabanı adı)
   
   **Son format:**
   ```
   mongodb+srv://servesync_user:SIFRE@servesync-cluster.xxxxx.mongodb.net/adisyon?retryWrites=true&w=majority
   ```

## ⚙️ Adım 6: .env Dosyasını Güncelleme

1. **Backend klasöründe `.env` dosyasını açın**

2. **MONGO_URL satırını güncelleyin:**

   **ESKİ:**
   ```env
   MONGO_URL=mongodb://localhost:27017/adisyon
   ```

   **YENİ (Atlas bağlantı stringinizle):**
   ```env
   MONGO_URL=mongodb+srv://servesync_user:SIFRE@servesync-cluster.xxxxx.mongodb.net/adisyon?retryWrites=true&w=majority
   ```

3. **Dosyayı kaydedin**

## ✅ Adım 7: Bağlantıyı Test Edin

```bash
cd backend
python test_multitenant.py
```

Eğer bağlantı başarılı olursa, şu çıktıyı görmelisiniz:
```
✓ Found 0 restaurant(s)
⚠ No restaurants found. Run migrate_to_multitenant.py first!
```

Bu, bağlantının başarılı olduğu anlamına gelir! (Henüz migrasyon yapmadınız)

## 🎯 Adım 8: Migrasyonu Çalıştırın

```bash
cd backend
python migrate_to_multitenant.py
```

Başarılı olursa:
```
Starting multi-tenant migration...

1. Creating default restaurant...
✓ Created default restaurant with ID: default-restaurant-001
  - Pairing code: 1234
  - Daily code: 0000

[... migration continues ...]

✓ Migration completed successfully!
```

## 🔍 Bağlantı Stringi Formatı

MongoDB Atlas bağlantı stringleri şu formatta olur:

```
mongodb+srv://<username>:<password>@<cluster-url>/<database>?retryWrites=true&w=majority
```

**Örnek:**
```
mongodb+srv://servesync_user:MySecurePass123@servesync-cluster.abc12.mongodb.net/adisyon?retryWrites=true&w=majority
```

**Parçalar:**
- `mongodb+srv://` - Protokol (Atlas için SRV kullanılır)
- `servesync_user` - Kullanıcı adı
- `MySecurePass123` - Şifre
- `servesync-cluster.abc12.mongodb.net` - Cluster adresi
- `adisyon` - Veritabanı adı
- `?retryWrites=true&w=majority` - Bağlantı seçenekleri

## 🛡️ Güvenlik Önlemleri

### 1. Şifre Güvenliği
- Güçlü bir şifre kullanın (en az 12 karakter, harf + sayı + özel karakter)
- Şifreyi `.env` dosyasında saklayın, asla kodda hardcode etmeyin
- `.env` dosyasını `.gitignore`'a ekleyin

### 2. IP Whitelist
- Production'da sadece sunucu IP'sini whitelist'e ekleyin
- Geliştirme aşamasında kendi IP'nizi ekleyin

### 3. Database User Yetkileri
- Sadece gerekli yetkileri verin (readWrite)
- Admin yetkisi vermeyin

## 📊 MongoDB Atlas Dashboard Kullanımı

### Verileri Görüntüleme:
1. Atlas Dashboard → "Browse Collections"
2. `adisyon` veritabanını seçin
3. Koleksiyonları görüntüleyin: `restaurants`, `categories`, `items`, `orders`, `waiter_sessions`

### Yedekleme (Backup):
- M0 (ücretsiz) tier'da otomatik yedekleme yoktur
- Düzenli olarak export alın:
  ```bash
  mongodump --uri="mongodb+srv://servesync_user:SIFRE@cluster.xyz.mongodb.net/adisyon"
  ```

### Monitoring:
- Atlas Dashboard'da "Metrics" sekmesinden kullanımı izleyin
- Ücretsiz tier: 512 MB depolama, sınırlı RAM

## 🐛 Sorun Giderme

### Bağlantı Hatası: "Authentication failed"
- Kullanıcı adı ve şifreyi kontrol edin
- Kullanıcının doğru yetkileri olduğundan emin olun

### Bağlantı Hatası: "Network timeout"
- IP adresinizin whitelist'te olduğundan emin olun
- Firewall/antivirus ayarlarını kontrol edin

### Bağlantı Hatası: "SSL handshake failed"
- Bağlantı stringinde `+srv` olduğundan emin olun
- TLS/SSL bağlantısı gerektiğinden emin olun

### "Database not found" Hatası
- Bağlantı stringinde veritabanı adının doğru olduğundan emin olun
- İlk migrasyonu çalıştırdığınızdan emin olun

## 📈 Ücretsiz Tier Sınırları (M0)

- **Depolama**: 512 MB
- **RAM**: Sınırlı (paylaşımlı)
- **CPU**: Sınırlı (paylaşımlı)
- **Bağlantı**: 100 bağlantı
- **Uptime**: %99.9 SLA

**Not:** Küçük ve orta ölçekli restoranlar için bu yeterlidir. Büyüdüğünüzde M2 veya M5 tier'lara geçebilirsiniz.

## 🔄 Gelecekte Cluster Değişikliği

Eğer başka bir Atlas cluster'ına geçmek isterseniz:

1. Yeni cluster oluşturun
2. Verileri export edin:
   ```bash
   mongodump --uri="mongodb+srv://eski_user:eski_sifre@eski-cluster.xyz.mongodb.net/adisyon"
   ```
3. Yeni cluster'a import edin:
   ```bash
   mongorestore --uri="mongodb+srv://yeni_user:yeni_sifre@yeni-cluster.xyz.mongodb.net/adisyon" dump/adisyon
   ```
4. `.env` dosyasındaki `MONGO_URL`'yi güncelleyin

## 📞 Destek

- MongoDB Atlas Dokümantasyon: https://docs.atlas.mongodb.com/
- MongoDB Community: https://www.mongodb.com/community/forums/

---

**Son Güncelleme:** 2026-02-02  
**MongoDB Atlas Versiyon:** 5.0+