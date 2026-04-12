import { Book, CheckCircle, Info, Shield, Database, Lock, Server, FileText } from 'lucide-react';

export default function Documentation() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center mb-12 border-b border-gray-200 pb-8">
        <div className="inline-flex items-center justify-center p-3 bg-blue-50 rounded-2xl mb-4">
          <Book className="w-8 h-8 text-blue-700" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Sistem Kullanım ve Güvenlik Kılavuzu</h2>
        <p className="text-lg text-gray-600 font-medium">T.C. Edirne Valiliği Merkez Sosyal Yardımlaşma ve Dayanışma Vakfı Vefa Yönetim Sistemi</p>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-red-100 bg-red-50/30 mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-red-100 p-3 rounded-2xl">
            <Shield className="text-red-700 w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">1. Sistem Güvenliği ve Veri Gizliliği (Kritik)</h3>
            <p className="text-gray-600 text-sm mt-1">KVKK ve Bilgi Güvenliği Standartları Kapsamında Alınan Önlemler</p>
          </div>
        </div>
        <div className="space-y-4 text-gray-700 leading-relaxed">
          <p>
            Vefa Yönetim Sistemi, vatandaşlarımıza ait hassas kişisel verileri barındırdığından dolayı en üst düzey güvenlik protokolleri ile donatılmıştır. Sistem mimarisi, yetkisiz erişimleri engellemek ve veri bütünlüğünü sağlamak üzere tasarlanmıştır.
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <b>Katı Yetkilendirme (Strict Authorization):</b> Sisteme giriş ve veri erişimi <u>sadece ve sadece</u> kurumun resmi e-posta adresi olan <b>edirnesydv@gmail.com</b> hesabı üzerinden yapılabilmektedir. Diğer tüm Google hesapları veya anonim giriş denemeleri veritabanı (Firestore) seviyesinde kesin olarak reddedilmektedir.
            </li>
            <li>
              <b>AES-256 Kriptolama:</b> Vatandaşlara ait T.C. Kimlik Numarası, Hane Numarası ve sistem şifreleri gibi kritik veriler, veritabanına kaydedilmeden önce istemci tarafında (client-side) AES-256 askeri düzey şifreleme algoritması ile şifrelenmektedir. Veritabanına doğrudan erişim sağlansa dahi bu veriler okunamamaktadır.
            </li>
            <li>
              <b>Veritabanı Kuralları (Firestore Rules):</b> Bulut veritabanı üzerinde uygulanan güvenlik kuralları, yalnızca doğrulanmış resmi kurum e-postasının okuma, yazma ve silme işlemlerine izin vermektedir. Ayrıca "Haneler" tablosuna veri eklenirken şema doğrulaması yapılarak, sisteme zararlı veya tanımlanmamış veri girişleri engellenmektedir.
            </li>
            <li>
              <b>Otomatik Yedekleme Mekanizması:</b> Olası veri kayıplarına karşı sistem, veritabanının tam yedeğini yetkili kurum hesabının (edirnesydv@gmail.com) Google Drive alanına şifreli JSON formatında aktarabilmektedir. Sisteme 10 günden fazla yedek alınmadığında resmi kullanıcıya uyarı verilmektedir.
            </li>
          </ul>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="bg-blue-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
            <Database className="text-blue-700 w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">2. Veritabanı Mimarisi</h3>
          <p className="text-gray-600 leading-relaxed text-sm">
            Sistem, Google Cloud Firestore NoSQL veritabanı altyapısını kullanmaktadır. Veriler bulut ortamında güvenle saklanırken, aynı zamanda tarayıcı önbelleğinde (IndexedDB) tutularak hızlı erişim ve çevrimdışı çalışma esnekliği sağlanmaktadır. Tüm veri akışı gerçek zamanlı (real-time) olarak senkronize edilir.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="bg-indigo-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
            <FileText className="text-indigo-700 w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">3. Hane ve Personel Yönetimi</h3>
          <p className="text-gray-600 leading-relaxed text-sm">
            Hizmet alan vatandaşların (Haneler) ve temizlik görevlilerinin (Personeller) kayıtları ilgili sekmelerden gerçekleştirilir. Kayıt esnasında girilen adres ve mahalle bilgileri, sistemin akıllı rotalama algoritması için temel teşkil eder. Toplu veri girişleri Excel içe aktarma modülü ile yapılabilmektedir.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="bg-green-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
            <Server className="text-green-700 w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">4. Akıllı Planlama Algoritması</h3>
          <p className="text-gray-600 leading-relaxed text-sm">
            "Otomatik Planla" modülü, haneleri adres yakınlıklarına ve mahalle konumlarına göre kümeleyerek iş gücü ve zaman tasarrufu sağlar. Her haneye standart olarak 2 personel atanır ve bir personelin günlük maksimum 2 hane ziyareti kısıtı sistem tarafından otomatik denetlenir.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="bg-orange-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
            <Lock className="text-orange-700 w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">5. İş Akışı ve Otomasyon</h3>
          <p className="text-gray-600 leading-relaxed text-sm">
            Sistem, günlük operasyonları kolaylaştırmak adına otonom kurallar içerir. Saat 17:30'a kadar manuel olarak "Tamamlandı" statüsüne alınmayan günlük görevler, sistem tarafından otomatik olarak onaylanır. Ayrıca 08:30'dan sonra yapılan yeni planlamalar zorunlu olarak bir sonraki iş gününden başlatılır.
          </p>
        </div>
      </div>

      <div className="bg-slate-800 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-6 border-b border-slate-700 pb-4">
            <Info className="w-6 h-6 text-blue-400" />
            <h3 className="text-xl font-bold">Operasyonel Kurallar ve Kısıtlar</h3>
          </div>
          <ul className="space-y-4 text-slate-300 text-sm">
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <div>
                <strong className="text-white block mb-1">Periyodik Ziyaret Kuralı</strong>
                Her hane, sistem algoritması tarafından standart olarak ayda 2 kez ziyaret edilecek şekilde programlanır.
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <div>
                <strong className="text-white block mb-1">Program Kaydırma (Reflow) İşlemi</strong>
                Resmi tatiller veya idari izinler sebebiyle iş günleri takviminden gün silindiğinde, mevcut planlamanın bütünlüğünü korumak amacıyla "Programı Kaydır" fonksiyonu kullanılmalıdır.
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <div>
                <strong className="text-white block mb-1">Saha Geri Bildirimleri</strong>
                Temizlik operasyonu tamamlandığında, haneye ait özel durumlar veya tespitler sistem üzerinden not olarak kayıt altına alınmalı ve "Tamamlanan Temizlikler" raporlarında arşivlenmelidir.
              </div>
            </li>
            <li className="flex items-start gap-3">
              <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5 shrink-0" />
              <div>
                <strong className="text-white block mb-1">Kontenjan Tamamlama</strong>
                Son gün planlamasında günlük kapasitenin (örneğin 6 hane) altında kalınması durumunda, sistem döngüyü tamamlamak adına listenin başındaki haneleri tekrar atayarak kapasiteyi doldurur.
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
