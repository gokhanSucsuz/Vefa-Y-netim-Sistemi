# PLAN-manual-planner.md

Bu plan, Manuel Planlama (Özel Planlama) modundaki hane listesinin kullanımını kolaylaştırmayı, arama ve sıralama özellikleri eklemeyi amaçlamaktadır.

## 1. ANALİZ (Phase 1)

### 1.1 Mevcut Sorunlar
1. **Sıralama Hatası**: Mevcut kodda öncelik sırası büyükten küçüğe (P10 -> P1) doğru yapılmaktadır. Ancak sistemde P1 en yüksek önceliği temsil etmektedir.
2. **Arama Eksikliği**: Çok sayıda hane olduğunda manuel planlamada hane bulmak zordur. İsim veya TC ile arama yapılması gerekmektedir.
3. **Sıralama Seçenekleri**: Kullanıcı haneleri sadece önceliğe göre değil, isim veya mahalleye göre de sıralamak isteyebilir.

### 1.2 Çözüm Yaklaşımı
- `ManualSchedulePlanner.tsx` dosyasına `searchTerm` ve `sortBy` state'leri eklenecek.
- Hane havuzu kısmına (sağ taraf) şık bir arama kutusu ve sıralama dropdown'ı eklenecek.
- `applicantAvailability` useMemo bloğu, arama ve sıralama tercihlerini kapsayacak şekilde güncellenecek.
- Öncelik sıralaması varsayılan olarak P1'den başlayacak şekilde düzeltilecek.

---

## 2. PLAN (Phase 2)

### Adım 1: State Yönetimi
- `searchTerm` (string) ve `sortBy` (string: 'priority' | 'name' | 'neighborhood') state'lerini ekle.

### Adım 2: Arama ve Sıralama UI
- Hane havuzu başlık kısmına bir `Search` ikonu ile beraber input alanı ekle.
- Yanına bir `ArrowUpDown` ikonu ile sıralama seçenekleri ekle.
- Tasarımı bozmamak için `ScheduleView` veya `ApplicantList` içindeki arama kutusu stillerini kullan.

### Adım 3: Filtreleme ve Sıralama Mantığı
- `applicantAvailability` hesaplanırken:
  1. Önce `searchTerm` ile filtrele (isim, soyisim veya TC No).
  2. Sonra `isAvailable` durumuna göre grupla (aktif olanlar üstte).
  3. Grup içinde `sortBy` değerine göre sırala (Örn: `priority` için `a - b`).

---

## 3. DOĞRULAMA (Phase 3)

### Kontrol Listesi
- [ ] Arama kutusuna isim yazıldığında listede sadece ilgili haneler kalıyor mu?
- [ ] TC Kimlik numarası ile arama yapılabiliyor mu?
- [ ] Haneler varsayılan olarak P1, P2, P3... şeklinde sıralanıyor mu?
- [ ] Kullanıcı "İsim (A-Z)" seçtiğinde liste güncelleniyor mu?
- [ ] Mobil ve masaüstü görünümde layout bozulması var mı?

## 4. GÖREVLENDİRME (Phase 4)

| Görev | Sorumlu |
|-------|---------|
| Search & Sort Logic Implementation | `frontend-specialist` |
| UI Components (SearchBox, SortMenu) | `frontend-specialist` |
| Final Audit (Frontend Integrity) | `frontend-specialist` |
