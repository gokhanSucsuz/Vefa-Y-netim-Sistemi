# PLAN-hane-kayit-fix.md

Bu plan, hane kayıtlarındaki harita güncelleme sorunu ve Excel yüklemesindeki TC Kimlik numarası eksikliklerini gidermeyi amaçlamaktadır.

## 1. ANALİZ (Phase 1)

### 1.1 Mevcut Sorunlar
1. **Harita Güncelleme**: Harita üzerinde bir nokta seçildiğinde `formData.lat` ve `formData.lng` güncelleniyor ancak "Adres" metni değişmiyor. Kullanıcı haritada bir yer işaretlediğinde adres kutusunun da dolmasını bekliyor.
2. **Excel TC Sorunu**: Excel'den toplu yükleme yapıldığında TC numaraları kaydedilmiyor. Bunun sebebi sütun başlığı uyuşmazlığı, veri tipi hatası (sayı vs string) veya önceki AI'nın eksik bıraktığı mantıksal bir bağ olabilir.
3. **Senkronizasyon**: Harita verileri `dbLocal.applicants.update` ile yerel veritabanına gidiyor ancak sunucu senkronizasyonunda koordinatların doğru gönderildiğinden emin olunmalı.

### 1.2 Çözüm Yaklaşımı
- `geocoding.ts` servisine `reverseGeocode` fonksiyonu eklenecek.
- Harita tıklandığında veya marker sürüklendiğinde `reverseGeocode` çağrılarak `formData.address` ve `formData.neighborhood` alanları otomatik güncellenecek.
- Excel yükleme mantığında başlıklar daha esnek (trim edilmiş, küçük/büyük harf duyarsız) hale getirilecek.
- TC Kimlik numaraları her zaman string olarak işlenecek ve 11 haneye tamamlanma kontrolü yapılacak.

---

## 2. PLAN (Phase 2)

### Adım 1: Geocoding Servisi Geliştirme
- `src/services/geocoding.ts` dosyasına `reverseGeocode(lat, lng)` fonksiyonu ekle.
- Bu fonksiyon sunucu tarafındaki `/api/geocode` proxy'sini veya doğrudan Nominatim API'sini kullanacak.

### Adım 2: Harita Etkileşimi İyileştirme
- `src/components/ApplicantList.tsx` içinde harita `onClick` ve `onDragEnd` olaylarına `reverseGeocode` entegrasyonu yap.
- Haritadan koordinat değiştiğinde kullanıcının adres kutusunu manuel doldurmasına gerek kalmadan "Tespit edilen adres" önerisi sun veya doğrudan kutuyu doldur.

### Adım 3: Excel İçe Aktarma Mantığı Düzeltme
- `handleExcelImport` fonksiyonunda sütun başlığı arama mantığını `key.toLowerCase().trim()` bazlı yap.
- TC Kimlik numarası alanını `String(row[key]).replace(/\D/g, '')` ile temizle.
- `XLSX.utils.sheet_to_json` çağrısına `defval: ''` ekleyerek `undefined` hatalarını önle.

### Adım 4: UI/UX Kontrolü
- Frontend düzenini bozmadan "Konumu Bul" ve harita etkileşimini daha akıcı hale getir.
- Harita bileşeninde `initialViewState` yerine kontrollü `viewState` kullanımını değerlendir (reaktivite için).

---

## 3. DOĞRULAMA (Phase 3)

### Kontrol Listesi
- [ ] Haritaya tıklandığında koordinatlar güncelleniyor mu?
- [ ] Haritaya tıklandığında adres metni otomatik doluyor mu?
- [ ] Excel şablonu indirildiğinde TC sütunu doğru başlıkla geliyor mu?
- [ ] Excel'den yüklenen verilerde TC numaraları veritabanında (Dexie ve MongoDB) görünüyor mu?
- [ ] Frontend tasarımı (Tailwind sınıfları, layout) korundu mu?

## 4. GÖREVLENDİRME (Phase 4)

| Görev | Sorumlu |
|-------|---------|
| Geocoding Servisi Güncelleme | `backend-specialist` |
| Harita Mantığı & Adres Senkronu | `frontend-specialist` |
| Excel Import Logic Refactor | `backend-specialist` |
| UI/UX Son Kontroller | `frontend-specialist` |
