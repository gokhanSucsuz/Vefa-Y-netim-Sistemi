import { useState } from 'react';
import { Book, CheckCircle, Info, HelpCircle, Database } from 'lucide-react';
import { dbLocal } from '../db';
import { EDIRNE_NEIGHBORHOODS } from '../types';

export default function Documentation() {
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const seedData = async () => {
    console.log('Starting seed data process...');
    setStatus('loading');
    
    try {
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 800));

      const firstNames = ['Ahmet', 'Mehmet', 'Ayşe', 'Fatma', 'Mustafa', 'Emine', 'Ali', 'Hatice', 'Hüseyin', 'Zeynep', 'Murat', 'Elif', 'İbrahim', 'Meryem', 'Hasan', 'Zehra', 'Osman', 'Özlem', 'Gökhan', 'Esra', 'Can', 'Selin', 'Burak', 'Derya', 'Deniz', 'Ebru', 'Fatih', 'Gamze', 'Hakan', 'İrem'];
      const lastNames = ['Yılmaz', 'Kaya', 'Demir', 'Şahin', 'Çelik', 'Yıldız', 'Yıldırım', 'Öztürk', 'Aydın', 'Özdemir', 'Arslan', 'Doğan', 'Kılıç', 'Aslan', 'Çetin', 'Kara', 'Koç', 'Kurt', 'Özkan', 'Şimşek', 'Polat', 'Özcan', 'Korkmaz', 'Çakır', 'Erdoğan', 'Yavuz', 'Sarı', 'Avcı', 'Yüksel', 'Aksoy'];

      const mockApplicants = Array.from({ length: 50 }).map((_, i) => ({
        name: firstNames[Math.floor(Math.random() * firstNames.length)],
        surname: lastNames[Math.floor(Math.random() * lastNames.length)],
        tcNo: (10000000000 + Math.floor(Math.random() * 90000000000)).toString(),
        phone: `05${Math.floor(100000000 + Math.random() * 900000000)}`,
        address: `Edirne Merkez, No: ${i + 1}`,
        neighborhood: EDIRNE_NEIGHBORHOODS[Math.floor(Math.random() * EDIRNE_NEIGHBORHOODS.length)],
        householdSize: Math.floor(Math.random() * 5) + 1
      }));

      const mockStaff = Array.from({ length: 6 }).map((_, i) => ({
        name: firstNames[Math.floor(Math.random() * firstNames.length)],
        surname: lastNames[Math.floor(Math.random() * lastNames.length)],
        phone: `05${Math.floor(100000000 + Math.random() * 900000000)}`
      }));

      await dbLocal.transaction('rw', dbLocal.applicants, dbLocal.staff, async () => {
        const applicantIds = await dbLocal.applicants.bulkAdd(mockApplicants, { allKeys: true });
        const staffIds = await dbLocal.staff.bulkAdd(mockStaff, { allKeys: true }) as number[];
        
        // Create 3 teams (pairs)
        if (staffIds.length >= 6) {
          await dbLocal.staff.update(staffIds[0], { partnerId: staffIds[1] });
          await dbLocal.staff.update(staffIds[1], { partnerId: staffIds[0] });
          
          await dbLocal.staff.update(staffIds[2], { partnerId: staffIds[3] });
          await dbLocal.staff.update(staffIds[3], { partnerId: staffIds[2] });
          
          await dbLocal.staff.update(staffIds[4], { partnerId: staffIds[5] });
          await dbLocal.staff.update(staffIds[5], { partnerId: staffIds[4] });
        }
      });

      console.log('Seed data process completed successfully');
      setStatus('success');
      setTimeout(() => setStatus('idle'), 5000);
    } catch (error) {
      console.error('Error seeding data:', error);
      setStatus('error');
      setTimeout(() => setStatus('idle'), 5000);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold text-gray-900 mb-4">Kullanım Kılavuzu</h2>
        <p className="text-lg text-gray-600">Edirne Merkez SYDV Vefa Yönetim Sistemi</p>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-orange-100 bg-orange-50/30 mb-8">
        <div className="flex items-center gap-4 mb-4">
          <div className="bg-orange-100 p-3 rounded-2xl">
            <Database className="text-orange-600 w-6 h-6" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-gray-900">Vefa Test Verisi Yükle</h3>
            <p className="text-gray-600 text-sm">Sistemi denemek için otomatik olarak 50 müracaatçı ve 6 personel ekleyebilirsiniz.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={seedData}
            disabled={status === 'loading'}
            className={`px-6 py-3 rounded-xl font-bold transition-all shadow-lg active:scale-95 disabled:opacity-50 ${
              status === 'success' ? 'bg-green-600 text-white shadow-green-100' : 
              status === 'error' ? 'bg-red-600 text-white shadow-red-100' : 
              'bg-orange-600 text-white shadow-orange-100 hover:bg-orange-700'
            }`}
          >
            {status === 'loading' ? 'Yükleniyor...' : 
             status === 'success' ? 'Veriler Yüklendi!' : 
             status === 'error' ? 'Hata Oluştu!' : 
             'Rastgele Veri Oluştur'}
          </button>
          {status === 'success' && <p className="text-green-600 font-medium animate-pulse">50 Müracaatçı ve 6 Personel eklendi.</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="bg-blue-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
            <CheckCircle className="text-blue-600 w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">1. Vefa Müracaatçı Kaydı</h3>
          <p className="text-gray-600 leading-relaxed">
            Hizmet alan yaşlı ve engelli vatandaşları "Müracaatçı Listesi" sekmesinden kaydedin. 
            Mahalle bilgisini doğru seçmeniz, planlamanın birbirine yakın adreslere yapılması için kritiktir.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="bg-indigo-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
            <CheckCircle className="text-indigo-600 w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">2. Vefa Personel Kaydı</h3>
          <p className="text-gray-600 leading-relaxed">
            Vefa projesi kapsamında çalışan temizlik personellerini "Personel Listesi" sekmesine ekleyin. 
            Bu personeller daha sonra müracaatçılara atanacaktır.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <div className="bg-green-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
            <CheckCircle className="text-green-600 w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">3. Akıllı Mahalle Planlama</h3>
          <p className="text-gray-600 leading-relaxed">
            "Otomatik Planla" butonuna bastığınızda sistem, müracaatçıları mahallelerine göre gruplar. 
            Böylece aynı gün gidilecek 6 müracaatçı birbirine en yakın mahallelerden seçilir.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-purple-100">
          <div className="bg-purple-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
            <CheckCircle className="text-purple-600 w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">4. Personel Atama ve Kısıtlar</h3>
          <p className="text-gray-600 leading-relaxed">
            Her müracaatçıya <b>2 temizlik görevlisi</b> atanır. Bir personel günde en fazla <b>2 farklı müracaatçıya</b> gidebilir. 
            Sistem bu kısıtları otomatik olarak denetler ve çakışmaları engeller.
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-orange-100">
          <div className="bg-orange-100 w-12 h-12 rounded-2xl flex items-center justify-center mb-6">
            <CheckCircle className="text-orange-600 w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-3">5. Program Kaydırma (Reflow)</h3>
          <p className="text-gray-600 leading-relaxed">
            İş günleri takviminden gün sildiğinizde, mevcut planlamayı bozmadan sıradaki boş günlere kaydırmak için 
            <b>"Programı Kaydır"</b> butonunu kullanabilirsiniz.
          </p>
        </div>
      </div>

      <div className="bg-blue-600 rounded-3xl p-8 text-white relative overflow-hidden shadow-xl shadow-blue-200">
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <Info className="w-6 h-6" />
            <h3 className="text-xl font-bold">Önemli Bilgiler</h3>
          </div>
          <ul className="space-y-3 opacity-90">
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
              Verileriniz tarayıcı tabanlı IndexedDB veritabanında güvenle saklanır. Sayfayı kapatsanız bile kaybolmaz.
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
              Her müracaatçı <b>ayda 2 kez</b> ziyaret edilecek şekilde planlanır.
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
              Planlama <b>Adres Bilgisine</b> göre yapılır. Mahalle ayrımı yerine adreslerin birbirine yakınlığına göre sıralama yapılır.
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
              İş günleri otomatik olarak müracaatçı sayısına göre belirlenir, ancak kullanıcı tarafından değiştirilebilir.
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
              Son gün planlamasında eksik kalan kontenjanlar (6'dan az ise) listenin başından tekrar başlanarak tamamlanır.
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
              Planlama yaparken mahalle yakınlığı önceliklendirilir, böylece ulaşım maliyeti ve zaman kaybı minimize edilir.
            </li>
            <li className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
              "Günü Kaydet ve Onayla" butonu, yaptığınız manuel değişiklikleri görsel olarak onaylamanızı sağlar.
            </li>
          </ul>
        </div>
        <HelpCircle className="absolute -bottom-8 -right-8 w-48 h-48 opacity-10" />
      </div>
    </div>
  );
}
