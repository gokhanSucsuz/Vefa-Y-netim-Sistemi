# PLAN-map-detail.md

Bu plan, API anahtarı (ücretli servisler) kullanmadan harita üzerindeki sokak isimlerini ve detaylarını artırmayı amaçlamaktadır.

## 1. ANALİZ (Phase 1)

### 1.1 Mevcut Sorun
- Mevcut harita stili olan "CartoDB Positron", minimal bir tasarıma sahiptir. Bu tasarım, haritayı sade tutmak için düşük yakınlaştırma seviyelerinde sokak isimlerini ve bina detaylarını gizler.
- Kullanıcı, herhangi bir API anahtarı (Google Cloud vb.) tanımlamadan daha detaylı bir görünüm istemektedir.

### 1.2 Çözüm Seçenekleri
1. **CartoDB Voyager**: Positron ile aynı altyapıyı kullanır ancak çok daha detaylıdır. Renkli yollar, bina silüetleri ve daha belirgin sokak isimleri sunar. API Key gerektirmez.
2. **OpenStreetMap Standard (Raster)**: Dünyanın en detaylı ücretsiz harita verisidir. Ancak "raster" (resim tabanlı) olduğu için vektör haritalar kadar pürüzsüz dönme/eğilme yapamaz. Sokak isimleri her zaman görünürdür.
3. **OSM Liberty / Bright**: MapLibre için optimize edilmiş, sokak isimlerine odaklanan açık kaynaklı vektör stilleridir.

---

## 2. PLAN (Phase 2)

### Adım 1: Harita Stilini Güncelleme
- `src/components/ApplicantList.tsx` içindeki `mapStyle` URL'ini `voyager-gl-style` ile değiştir.
- Bu değişiklik anında sokak isimlerinin ve detayların görünürlüğünü artıracaktır.

### Adım 2: Hibrit Görünüm Desteği (Opsiyonel)
- Haritaya bir stil seçici (Layer Switcher) ekle.
- Kullanıcının "Sade Görünüm" (Positron) ve "Detaylı Görünüm" (Voyager/OSM) arasında geçiş yapmasına olanak tanı.

### Adım 3: Yakınlaştırma Seviyesi (Zoom) Optimizasyonu
- Hane seçildiğinde yapılan `flyTo` işlemindeki zoom seviyesini 15'ten 17'ye çıkar. Bu, sokak isimlerinin daha net belirmesini sağlar.

---

## 3. DOĞRULAMA (Phase 3)

### Kontrol Listesi
- [ ] Yeni harita stili ile ara sokak isimleri görünüyor mu?
- [ ] Harita performansı (yüklenme hızı) korundu mu?
- [ ] API anahtarı hatası alınıyor mu? (Alınmamalı)

## 4. GÖREVLENDİRME (Phase 4)

| Görev | Sorumlu |
|-------|---------|
| Stil URL Güncellemesi | `frontend-specialist` |
| Zoom Seviyesi Ayarı | `frontend-specialist` |
| Manuel Stil Testleri | `frontend-specialist` |
