# PLAN-google-maps.md

Bu plan, mevcut MapLibre harita sistemini Google Maps (ücretsiz kota kapsamındaki sürüm) ile değiştirmeyi amaçlamaktadır. Bu sayede sokak isimlerinin eksikliği ve detay yetersizliği giderilecektir.

## 1. ANALİZ (Phase 1)

### 1.1 Mevcut Durum
- Sistem şu an `react-map-gl/maplibre` ve `MapLibre GL` kullanıyor.
- Harita sağlayıcısı olarak CartoDB'nin "Positron" stili kullanılıyor (OpenStreetMap tabanlı).
- Bazı ara sokaklar ve güncel isimler bu veri setinde eksik olabiliyor.

### 1.2 Google Maps Entegrasyonu
- **Ücretlendirme**: Google Maps, aylık 200$ değerinde ücretsiz kredi sunar. Bu, düşük ve orta ölçekli projeler için genellikle "ücretsiz" kullanım demektir. Ancak Google Cloud Console üzerinden bir API Key oluşturulması ve bir ödeme yöntemi (kredi kartı) tanımlanması zorunludur.
- **Kütüphane**: `@react-google-maps/api` kütüphanesi en güncel ve kararlı React entegrasyonunu sunmaktadır.

---

## 2. PLAN (Phase 2)

### Adım 1: API Hazırlığı (Kullanıcı Tarafında)
- Google Cloud Console üzerinden bir proje oluşturulmalı.
- "Maps JavaScript API" ve "Places API" (isteğe bağlı) etkinleştirilmeli.
- Bir API Key oluşturulmalı.

### Adım 2: Bağımlılıkların Güncellenmesi
- `@react-google-maps/api` kütüphanesini projeye ekle.
- Gereksizleşen `maplibre-gl` ve `react-map-gl` bağımlılıklarını (varsa) temizle veya pasife al.

### Adım 3: Harita Bileşeninin Yeniden Yazılması
- `src/components/ApplicantList.tsx` içindeki `Map` bileşenini Google Maps bileşeni ile değiştir.
- `LocationPicker` mantığını Google Maps marker ve event yapısına (onClick, onDragEnd) uyarla.

### Adım 4: Geocoding Entegrasyonu
- Google'ın kendi Geocoding servisini kullanarak daha isabetli sonuçlar al (isteğe bağlı, Nominatim ile de devam edilebilir ancak Google Maps ile Google Geocoding daha uyumludur).

---

## 3. DOĞRULAMA (Phase 3)

### Kontrol Listesi
- [ ] Google Maps haritası hatasız yükleniyor mu?
- [ ] Sokak isimleri ve detaylar yeterli mi?
- [ ] Marker (işaretçi) sürükleme ve tıklama ile koordinat güncelleme çalışıyor mu?
- [ ] API Key güvenli bir şekilde `.env` dosyasında tutuluyor mu?

## 4. GÖREVLENDİRME (Phase 4)

| Görev | Sorumlu |
|-------|---------|
| API Key & Cloud Kurulum Rehberi | `project-planner` |
| Google Maps Kütüphane Kurulumu | `frontend-specialist` |
| Marker & Tıklama Mantığı Göçü | `frontend-specialist` |
| UI/UX Uyumlaştırma | `frontend-specialist` |
