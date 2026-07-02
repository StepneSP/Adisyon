# Giriş (Login) Sorunu Giderme Rehberi

Eğer "Ahmet" kullanıcı adı ve "0000" koduyla giriş yapamıyorsanız, bu adımları takip edin:

## 🔍 Adım 1: Backend'in Çalıştığından Emin Olun

Terminal 1 - Backend başlatma:
```bash
cd backend
uvicorn server:app --reload --host 0.0.0.0 --port 8000
```

Beklenen çıktı:
```
INFO:     Uvicorn running on http://0.0.0.0:8000
INFO:     Application startup complete.
```

## 🔍 Adım 2: Migrasyonu Çalıştırın

Eğer daha önce migrasyon yapmadıysanız:

Terminal 2 - Migrasyon:
```bash
cd backend
python migrate_to_multitenant.py
```

Beklenen çıktı:
```
Starting multi-tenant migration...

1. Creating default restaurant...
✓ Created default restaurant with ID: default-restaurant-001
  - Pairing code: 1234
  - Daily code: 0000

[... migration continues ...]

✓ Migration completed successfully!
```

## 🔍 Adım 3: Backend API'yi Test Edin

Terminal 3 - curl ile test:
```bash
# Login endpoint testi
curl -X POST http://localhost:8000/api/auth/waiter/login \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Ahmet","gunluk_kod":"0000"}'
```

**Beklenen başarılı yanıt:**
```json
{
  "session_token": "eyJ0eXAiOiJKV1QiLCJhbGc...",
  "nickname": "Ahmet",
  "restoran_id": "default-restaurant-001",
  "restoran_adi": "Default Restaurant",
  "gunluk_kod": "0000"
}
```

**Eğer hata alırsanız:**

1. **401 Unauthorized:**
   ```
   {"detail":"Invalid daily code"}
   ```
   - Migrasyonu tekrar çalıştırın
   - MongoDB'de restoran var mı kontrol edin

2. **404 Not Found:**
   ```
   {"detail":"Not Found"}
   ```
   - Backend URL'si yanlış olabilir
   - Frontend'deki `EXPO_PUBLIC_BACKEND_URL` değişkenini kontrol edin

3. **Connection refused:**
   - Backend çalışmıyor demektir
   - Terminal 1'de backend'i başlatın

## 🔍 Adım 4: Frontend Konfigürasyonunu Kontrol Edin

### .env Dosyası Kontrolü

Frontend klasöründe `.env` dosyası oluşturun veya kontrol edin:

```env
EXPO_PUBLIC_BACKEND_URL=http://localhost:8000
```

**Önemli:** 
- `http://` ile başlamalı (https değil)
- Port 8000 olmalı (backend'in çalıştığı port)
- Sonunda `/` olmamalı

### Frontend'i Başlatma

Terminal 4 - Frontend:
```bash
cd frontend
npm start
```

## 🔍 Adım 5: Tarayıcı Konsolunu Kontrol Edin

Frontend çalışırken tarayıcının konsoluna (F12) bakın:

### Başarılı Giriş:
```
Login error: (hiçbir şey görünmemeli)
```

### Hata Durumları:

1. **Network Error:**
   ```
   Login error: Failed to fetch
   ```
   - Backend çalışmıyor veya URL yanlış

2. **401 Error:**
   ```
   Login error: Invalid daily code
   ```
   - Kod yanlış veya migrasyon yapılmamış

3. **CORS Error:**
   ```
   Access to fetch at 'http://localhost:8000/api/auth/waiter/login' 
   from origin 'http://localhost:8081' has been blocked by CORS policy
   ```
   - Backend CORS ayarlarını kontrol edin (server.py dosyasında)

## 🔍 Adım 6: MongoDB'yi Kontrol Edin

MongoDB Atlas kullanıyorsanız:

1. **Atlas Dashboard'a gidin**
2. **Browse Collections** seçin
3. `adisyon` veritabanını açın
4. `restaurants` koleksiyonunu kontrol edin

**Beklenen doküman:**
```json
{
  "_id": ObjectId("..."),
  "id": "default-restaurant-001",
  "code": "1234",
  "name": "Default Restaurant",
  "gunluk_kod": "0000",
  "abonelik_durumu": "aktif",
  "created_at": "...",
  "updated_at": "..."
}
```

Eğer `gunluk_kod` "0000" değilse, migrasyonu tekrar çalıştırın.

## 🔍 Adım 7: Detaylı Debug Bilgisi

`pair.tsx` dosyasına şu satırları ekleyin (login fonksiyonunun başına):

```typescript
const login = async () => {
  const name = nickname.trim();
  const code = dailyCode.trim();
  
  // DEBUG: Değerleri konsola yazdır
  console.log("Login attempt:", { name, code });
  console.log("Backend URL:", process.env.EXPO_PUBLIC_BACKEND_URL);
  
  // ... geri kalan kod
```

## 🔍 Adım 8: Yaygın Hatalar ve Çözümleri

### Hata 1: "Sunucuya bağlanılamadı. Backend çalışıyor mu?"

**Sebep:** Backend çalışmıyor veya yanlış port

**Çözüm:**
```bash
# Backend'i kontrol edin
curl http://localhost:8000/

# Yanıt olarak {"message":"ServeSync API","ok":true} görmelisiniz
```

### Hata 2: "Geçersiz günlük kod"

**Sebep:** 
- Migrasyon yapılmamış
- MongoDB'de restoran yok
- `gunluk_kod` değeri "0000" değil

**Çözüm:**
```bash
cd backend
python migrate_to_multitenant.py
```

### Hata 3: "Restoran aboneliği aktif değil"

**Sebep:** `abonelik_durumu` "pasif" olarak ayarlanmış

**Çözüm:** MongoDB Atlas'te restoran dokümanını düzenleyin:
```json
{
  "abonelik_durumu": "aktif"
}
```

### Hata 4: Network timeout / Connection refused

**Sebep:** 
- Backend çalışmıyor
- Firewall engeli
- Yanlış IP/port

**Çözüm:**
1. Backend'i başlatın: `uvicorn server:app --reload`
2. Port 8000'in kullanılmadığından emin olun
3. Güvenlik duvarını kontrol edin

## 🔍 Adım 9: Manuel API Testi

Postman veya curl ile manuel test:

```bash
# 1. Backend sağlık kontrolü
curl http://localhost:8000/

# 2. Login testi
curl -X POST http://localhost:8000/api/auth/waiter/login \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Ahmet","gunluk_kod":"0000"}'

# 3. Token ile korumalı endpoint
TOKEN="eyJ0eXAiOiJKV1QiLCJhbGc..."  # Yukarıdaki yanıttan alınan token
curl http://localhost:8000/api/auth/waiter/me \
  -H "Authorization: Bearer $TOKEN"
```

## 🔍 Adım 10: Tam Sistem Testi

Her şeyi birlikte test edin:

```bash
# Terminal 1: Backend
cd backend
uvicorn server:app --reload

# Terminal 2: Frontend
cd frontend
npm start

# Terminal 3: Test
curl -X POST http://localhost:8000/api/auth/waiter/login \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Ahmet","gunluk_kod":"0000"}'
```

## 📊 Kontrol Listesi

- [ ] Backend çalışıyor (http://localhost:8000)
- [ ] Migrasyon tamamlandı
- [ ] MongoDB'de restoran var (`gunluk_kod: "0000"`)
- [ ] Frontend `.env` dosyası doğru (`EXPO_PUBLIC_BACKEND_URL=http://localhost:8000`)
- [ ] curl testi başarılı
- [ ] Tarayıcı konsolunda network hatası yok
- [ ] CORS hatası yok

## 🆘 Hala Çalışmıyorsa

1. **Backend loglarını kontrol edin:**
   - Terminal 1'deki çıktıyı kontrol edin
   - Hata mesajları var mı?

2. **Frontend loglarını kontrol edin:**
   - Tarayıcı konsoluna (F12) bakın
   - Network sekmesinde isteğin durumunu kontrol edin

3. **MongoDB bağlantısını test edin:**
   ```bash
   python -c "from motor.motor_asyncio import AsyncIOMotorClient; print('MongoDB driver OK')"
   ```

4. **Tüm sistemi yeniden başlatın:**
   ```bash
   # Backend'i durdurun (Ctrl+C)
   # Frontend'i durdurun (Ctrl+C)
   
   # Tekrar başlatın
   cd backend && uvicorn server:app --reload
   cd frontend && npm start
   ```

---

**Son Güncelleme:** 2026-02-02  
**Test Edilen Versiyon:** Backend 2.0, Frontend 2.0