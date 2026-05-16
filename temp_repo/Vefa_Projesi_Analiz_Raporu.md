# VEFA SOSYAL YARDIM VE YÖNETİM SİSTEMİ
## Kurumsal Analiz ve Kapasite Raporu

### 1. Projenin Amacı ve Kapsamı
Vefa Sosyal Yardım ve Yönetim Sistemi, Sosyal Yardımlaşma ve Dayanışma Vakıfları (SYDV) ve belediyelerin "Vefa" (Yaşlı, engelli ve bakıma muhtaç vatandaşların evde bakım ve temizlik hizmetleri) projelerini dijital bir altyapı üzerinden profesyonelce yönetmelerini sağlayan kapsamlı bir otomasyon çözümüdür. Bu sistem; personelin sahada etkin bir şekilde koordine edilmesi, faydalanıcı (hane) verilerinin güvenle saklanıp işlenmesi, rota planlamalarının optimize edilmesi ve yapılan tüm işlemlerin şeffaf bir şekilde raporlanmasını hedefler.

### 2. Temel Modüller ve Özellikler

#### 2.1. Faydalanıcı (Hane) Yönetimi
*   **Kapsamlı Kayıt:** Vatandaşların TC Kimlik Numarası, adres, iletişim, hane büyüklüğü ve harita konumu (enlem/boylam) gibi detaylı bilgileriyle sisteme kaydedilmesi.
*   **Önceliklendirme:** İhtiyaç sahiplerinin durumlarına göre planlama öncelik sıralaması yapılarak hizmetin en acil yerlere hızla ulaştırılması.
*   **Konum Bazlı Takip:** Leaflet ve coğrafi bilgi sistemleri (CBS) entegrasyonu sayesinde hanelerin harita üzerinde görüntülenmesi ve saha ekiplerinin navigasyon ile yönlendirilmesi.

#### 2.2. Personel ve Görev Yönetimi
*   **Rol Bazlı Erişim:** Superadmin, Admin ve Saha Personeli (Staff) olmak üzere çok katmanlı yetkilendirme mimarisi.
*   **Vardiya ve Ekip Planlama:** Personellerin sabah/öğleden sonra veya tam gün şeklinde, partnerli (ekip halinde) veya yedek personellerle planlanması.
*   **Görev Türleri:** Temizlik, hasta bakım, vakıf ve idari gibi farklı görev türlerinin dinamik ataması.
*   **İzin Yönetimi:** Yıllık, mazeret, sağlık gibi personel izin süreçlerinin dijital olarak izlenmesi ve yedek planlamalarının otomatik önerilmesi.

#### 2.3. Dinamik Planlama ve İş Akışı (Program Yönetimi)
*   **Akıllı Çizelgeleme:** Belirli tarih aralıkları için toplu hizmet programları oluşturulması.
*   **Gerçek Zamanlı Durum Takibi:** Saha personelinin mobil cihazları üzerinden (PWA desteği ile) atanan görevleri tamamlaması, konum ve tarih/saat damgalı onay bildirimleri.
*   **Görev Kaydırma:** İptal olan veya yetişmeyen işlerin başka günlere veya ekiplere esnek bir şekilde devredilebilmesi.

#### 2.4. Güvenlik, Denetim ve Loglama (Audit)
*   **Audit Log (Denetim İzi):** Sistemdeki her kullanıcının yaptığı işlemler (kim, ne zaman, hangi işlemi yaptı) kesintisiz kayıt altına alınır.
*   **KVKK Uyumluluğu:** Kriptografik özetlemeler ve güvenli veritabanı kuralları (Firestore Security Rules) ile hassas kişisel verilerin korunması.
*   **Google Auth:** Kurumsal e-posta adresleri üzerinden güvenli ve tekil oturum açma (SSO) altyapısı.

#### 2.5. Raporlama ve Çıktı Üretimi
*   **Dışa Aktarım:** İstatistiklerin, günlük atama listelerinin ve hane bilgilerinin Excel, PDF formatlarında dışa aktarılabilmesi.
*   **Analitik Görünümler:** Recharts entegrasyonu ile hizmet istatistiklerinin, personel performansının ve bölgelere göre hizmet dağılımının grafiksel analizi.

### 3. Kurumlar (SYDV / Belediye) İçin Sağladığı Stratejik Faydalar

**1. Operasyonel Verimlilik ve Maliyet Tasarrufu:**
Geleneksel kağıt veya basit tablo yöntemlerine kıyasla rota ve personel optimizasyonu sağlayarak yakıt ve zaman tasarrufu sağlar. Görev çakışmalarını ve veri tekrarlarını önler.

**2. Hesap Verilebilirlik ve Şeffaflık:**
Audit logları ve personelin sahadan anlık konum bildirimi ile onay yapması, "hizmetin gerçekten adrese ulaşıp ulaşmadığı" konusundaki tüm şüpheleri ortadan kaldırır. Denetlemelerde (Sayıştay vb.) saniyeler içinde kanıta dayalı, dijital, tarih ve koordinat damgalı raporlar sunulur.

**3. Mobil Uyumlu Saha Yönetimi:**
Progresif Web Uygulaması (PWA) altyapısı sayesinde personelin sahada tablet veya telefonlarından ek uygulama kurmaya gerek kalmadan sisteme erişebilmesi, offline toleranslı veri iletimi sağlar.

**4. Veri Güvenliği ve KVKK:**
Rol bazlı mimarisiyle, personelin sadece kendi görevli olduğu haneleri görebilmesi, yöneticilerin ise tüm tabloya hakim olması sağlanır. Bu da veri mahremiyeti standartlarını en üst seviyeye taşır.

**5. Kurumsal Hafıza ve Karar Destek:**
Hangi haneye, ne sıklıkla, ne tür hizmetlerin gittiği veritabanında yıllarca güvenle birikir. Bu veri, bir sonraki yılın bütçe planlamalarında, personel istihdam ihtiyaçlarında ve sosyal politika kararlarında yönetime bilimsel bir temel sağlar.

### 4. Sonuç
Vefa Yönetim Sistemi; modern teknolojileri (React, Firebase, CBS, PWA) kullanan, tamamen resmi sosyal yardım kurumlarının iş süreçlerine göre terzi işi tasarlanmış, güçlü, güvenli ve ölçeklenebilir bir kurumsal çözümdür. Devletin şefkat elini, teknolojinin hızı ve güvenilirliği ile birleştirerek vatandaş memnuniyetini maksimuma çıkarır.
