# PLAN-reschedule-fix.md

Bu plan, hane kaydırma (reschedule) işlemi sırasında günlük hane sayısının azalmasına neden olan hatayı gidermeyi ve her güne tam kapasite hane atanmasını sağlamayı amaçlamaktadır.

## 1. ANALİZ (Phase 1)

### 1.1 Mevcut Sorun
- `performShiftAssignment` fonksiyonu, bir hane kaydırıldığında hedef günün hane sayısını mevcut sayının 1 eksiği olarak hesaplamaktadır.
- Bu durum, her kaydırma işleminde o günün boş kalmasına ve kapasitenin altında çalışılmasına neden olmaktadır.
- Kullanıcı, bir hane kaydırılsa dahi tüm günlerin `dailyLimit` (varsayılan 6) kadar hane ile dolu olmasını (sonraki günlerden öne çekilerek) istemektedir.

### 1.2 Çözüm Yaklaşımı
- `performShiftAssignment` içindeki özel "mevcut gün" (-1) mantığı kaldırılacak.
- Tüm günler için hedef hane sayısı `dailyLimit - tamamlananZiyaretSayısı` olarak sabitlenecek.
- Böylece havuzda hane olduğu sürece her gün tam kapasite dolacaktır.
- `handleCancelDay` (Gün İptali) fonksiyonu da benzer şekilde, eğer gün tamamen iptal edilmiyorsa (sadece shift iptali gibi), boşalan yerlerin havuzdan doldurulmasını sağlayacak şekilde gözden geçirilecek.

---

## 2. PLAN (Phase 2)

### Adım 1: performShiftAssignment Düzeltmesi
- `ScheduleView.tsx` içindeki `performShiftAssignment` fonksiyonunu bul.
- `targetUncompletedCount` hesaplamasındaki `if (s.date === date)` bloklarını kaldır veya `dailyLimit` kullanacak şekilde güncelle.
- Bu sayede kaydırılan hanenin yerine bir sonraki günün ilk hanesi otomatik olarak yerleşecektir.

### Adım 2: Havuz Senkronizasyonu
- Yeniden dağıtım sırasında `tagAssignmentsWithShift` fonksiyonunun kullanıldığından emin ol (Sabah/Öğle etiketlerinin doğru basılması için).

### Adım 3: Temizlik Görevi Kontrolü
- Kaydırma işlemi sonunda `cleanupOverloadedSchedules()` çağrısının yapıldığından emin ol (Zaten mevcut ancak kontrol edilecek).

---

## 3. DOĞRULAMA (Phase 3)

### Kontrol Listesi
- [ ] Bir haneyi sonraki güne kaydırdığımda, mevcut günün hane sayısı hala 6 mı? (Sonraki günlerden hane çekildi mi?)
- [ ] Havuzdaki tüm haneler bitene kadar her gün 6 hane ile dolu mu?
- [ ] "Yönetici olarak tamamla" ile tamamlanan kayıtlar bu kaydırma işleminden etkilenmiyor mu? (Tamamlananlar sabit kalmalı).

## 4. GÖREVLENDİRME (Phase 4)

| Görev | Sorumlu |
|-------|---------|
| Logic Update (Reschedule) | `backend-specialist` |
| Capacity Verification | `backend-specialist` |
