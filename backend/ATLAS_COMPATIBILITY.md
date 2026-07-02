# MongoDB Atlas Uyumluluk Bilgisi

## ✅ Kod Zaten Atlas ile Uyumlu!

İyi haber: `server.py` ve `migrate_to_multitenant.py` dosyaları **hem yerel MongoDB hem de MongoDB Atlas ile çalışacak şekilde tasarlanmıştır.** Herhangi bir kod değişikliği gerektirmez.

## 🔍 Neden Uyumlu?

### 1. Motor Sürücüsü (Motor Driver)

Proje, `motor` kütüphanesini kullanır:
```python
from motor.motor_asyncio import AsyncIOMotorClient

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]
```

**Motor**, hem yerel hem de Atlas bağlantılarını otomatik olarak destekler:
- Yerel: `mongodb://localhost:27017/adisyon`
- Atlas: `mongodb+srv://user:pass@cluster.mongodb.net/adisyon`

### 2. Bağlantı Stringleri Ortam Değişkenlerinden Geliyor

Tüm bağlantı bilgileri `.env` dosyasından okunur:
```python
mongo_url = os.environ['MONGO_URL']  # Burada Atlas veya local olabilir
db_name = os.environ['DB_NAME']      # Veritabanı adı
```

Bu sayede:
- ✅ Kodda hiçbir değişiklik yapmadan
- ✅ Sadece `.env` dosyasını güncelleyerek
- ✅ Atlas'e geçiş yapabilirsiniz

## 📋 Gerekli Adımlar

### Sadece .env Dosyasını Güncelleyin

**Adım 1:** MongoDB Atlas'ten bağlantı stringini alın (MONGODB_ATLAS_SETUP.md rehberini takip edin)

**Adım 2:** `.env` dosyasını açın ve `MONGO_URL`'yi güncelleyin:

```env
# Eski (yerel):
MONGO_URL=mongodb://localhost:27017/adisyon

# Yeni (Atlas):
MONGO_URL=mongodb+srv://servesync_user:SIFRE@servesync-cluster.abc12.mongodb.net/adisyon?retryWrites=true&w=majority
```

**Adım 3:** Test edin:
```bash
python test_multitenant.py
```

## 🔄 Bağlantı Türleri Arasında Geçiş

### Yerel → Atlas Geçişi

1. Atlas cluster'ını oluşturun
2. `.env` dosyasındaki `MONGO_URL`'yi güncelleyin
3. Migrasyonu çalıştırın:
   ```bash
   python migrate_to_multitenant.py
   ```
4. Sunucuyu başlatın:
   ```bash
   uvicorn server:app --reload
   ```

### Atlas → Yerel Geçişi

1. `.env` dosyasındaki `MONGO_URL`'yi localhost olarak güncelleyin
2. Adım 3 ve 4'ü tekrarlayın

## 🆚 Teknik Karşılaştırma

| Özellik | Yerel MongoDB | MongoDB Atlas |
|---------|--------------|---------------|
| Bağlantı Protokolü | `mongodb://` | `mongodb+srv://` |
| SSL/TLS | Opsiyonel | Zorunlu (Atlas tarafından) |
| DNS SRV Kayıtları | Hayır | Evet (otomatik) |
| Bağlantı Stringi | Basit | Biraz daha uzun |
| Kod Değişikliği | - | Gerekli değil |
| .env Değişikliği | - | Gerekli |

## ✅ Kontok Listesi

Kodun Atlas ile uyumlu olduğunu doğrulayın:

- [x] `AsyncIOMotorClient` kullanılıyor (hem local hem Atlas destekler)
- [x] Bağlantı stringi `.env` dosyasından okunuyor
- [x] Veritabanı adı `.env` dosyasından okunuyor
- [x] Hiçbir yerde hardcoded bağlantı yok
- [x] SSL/TLS bağlantısı otomatik (Atlas tarafından sağlanıyor)
- [x] Tüm sorgular `restoran_id` ile filtreliyor (multi-tenant güvenli)

## 🎯 Örnek .env Dosyaları

### Yerel MongoDB için:
```env
MONGO_URL=mongodb://localhost:27017/adisyon
DB_NAME=adisyon
JWT_SECRET_KEY=your-secret-key-here
```

### MongoDB Atlas için:
```env
MONGO_URL=mongodb+srv://servesync_user:MySecurePass123@servesync-cluster.abc12.mongodb.net/adisyon?retryWrites=true&w=majority
DB_NAME=adisyon
JWT_SECRET_KEY=your-secret-key-here
```

## 🚨 Önemli Notlar

1. **Veritabanı Adı (DB_NAME):**
   - Atlas'te veritabanı adını bağlantı stringinde belirtiyorsunuz
   - `.env` dosyasındaki `DB_NAME` değişkeni yine de gerekli (kodda kullanılıyor)
   - Her ikisi de aynı olmalı: `adisyon`

2. **SSL/TLS:**
   - Atlas bağlantıları otomatik olarak SSL/TLS kullanır
   - Ekstra konfigürasyon gerekmez

3. **Firewall/Network:**
   - Atlas'te IP whitelist eklemeniz gerekir
   - Geliştirme için: "Allow Access from Anywhere" (0.0.0.0/0)
   - Production için: Sadece sunucu IP'si

4. **Bağlantı Timeout:**
   - Atlas bağlantıları biraz daha yavaş olabilir (internet üzerinden)
   - Timeout değerlerini artırmak gerekebilir (isteğe bağlı)

## 📊 Performans İpuçları

### Atlas M0 (Ücretsiz) Tier İçin:
- Bağlantı havuzunu ayarlayın (isteğe bağlı)
- Sık kullanılan sorguları index'leyin (migrasyon scripti bunu yapıyor)
- WebSocket bağlantılarını sınırlayın

### Daha Yüksek Tier'lar İçin:
- M2+ tier'larda daha iyi performans alırsınız
- Connection pooling önemli hale gelir
- Read preferences ayarlayabilirsiniz

## 🧪 Test Sonucu

Bağlantı başarılı olduğunda `test_multitenant.py` çıktısı:
```
============================================================
Testing Multi-Tenant Architecture
============================================================

1. Testing restaurants collection...
   ✓ Found 0 restaurant(s)
   ⚠ No restaurants found. Run migrate_to_multitenant.py first!

[... diğer testler ...]

✅ Multi-tenant architecture is working correctly!
```

Bu çıktı, bağlantının başarılı olduğunu gösterir. Henüz migrasyon yapmadığınız için restoran sayısı 0 görünür.

## 📝 Özet

**Kodda herhangi bir değişiklik yapmanıza gerek YOKTUR.**

Sadece:
1. `.env` dosyasındaki `MONGO_URL`'yi Atlas bağlantı stringinizle güncelleyin
2. Migrasyonu çalıştırın: `python migrate_to_multitenant.py`
3. Sunucuyu başlatın: `uvicorn server:app --reload`

Hepsi bu kadar! 🎉

---

**Son Güncelleme:** 2026-02-02  
**Durum:** ✅ Tamamen Atlas uyumlu