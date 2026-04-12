import React, { useState } from 'react';
import { 
  Book, CheckCircle, Info, Shield, Database, Lock, Server, FileText, 
  Users, Briefcase, Calendar, ClipboardList, TrendingUp, History, 
  Download, AlertTriangle, ChevronRight, HelpCircle, Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Documentation() {
  const [activeSection, setActiveSection] = useState<string>('intro');

  const sections = [
    { id: 'intro', label: 'Giriş ve Genel Bakış', icon: Book },
    { id: 'security', label: 'Güvenlik ve Gizlilik', icon: Shield },
    { id: 'auth', label: 'Erişim ve Yetkilendirme', icon: Lock },
    { id: 'management', label: 'Veri Yönetimi', icon: Database },
    { id: 'planning', label: 'Planlama ve Program', icon: Calendar },
    { id: 'operations', label: 'Operasyonel İşlemler', icon: ClipboardList },
    { id: 'reporting', label: 'Raporlama ve Analiz', icon: TrendingUp },
    { id: 'audit', label: 'Denetim ve Yedekleme', icon: History },
  ];

  const renderSectionContent = () => {
    switch (activeSection) {
      case 'intro':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-blue-50 p-6 rounded-3xl border border-blue-100">
              <h3 className="text-xl font-bold text-blue-900 mb-4 flex items-center gap-2">
                <Info className="w-6 h-6" />
                Sistem Hakkında
              </h3>
              <p className="text-blue-800 leading-relaxed">
                Edirne Merkez Vefa Modülü, Edirne Merkez Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı bünyesinde yürütülen 
                "Vefa Projesi" operasyonlarının dijitalleşmesi, verimliliğinin artırılması ve denetlenebilirliğinin sağlanması 
                amacıyla geliştirilmiş kapsamlı bir yönetim sistemidir.
              </p>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <h4 className="font-bold text-gray-900 mb-2">Temel Amaç</h4>
                <p className="text-sm text-gray-600">Yaşlı ve engelli vatandaşlarımızın ev temizliği hizmetlerinin düzenli, adil ve takip edilebilir bir şekilde planlanması.</p>
              </div>
              <div className="p-5 bg-white rounded-2xl border border-gray-100 shadow-sm">
                <h4 className="font-bold text-gray-900 mb-2">Hedef Kitle</h4>
                <p className="text-sm text-gray-600">Vakıf personeli, saha görevlileri ve hizmet alan dezavantajlı vatandaşlarımız.</p>
              </div>
            </div>
          </motion.div>
        );
      case 'security':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-red-50 p-6 rounded-3xl border border-red-100">
              <h3 className="text-xl font-bold text-red-900 mb-4 flex items-center gap-2">
                <Shield className="w-6 h-6" />
                KVKK ve Bilgi Güvenliği
              </h3>
              <p className="text-red-800 text-sm mb-4">
                Sistem, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) standartlarına tam uyumlu olarak tasarlanmıştır.
              </p>
              <ul className="space-y-3">
                {[
                  { title: 'Veri Şifreleme', desc: 'T.C. Kimlik No ve şifreler SHA-256 ve AES-256 algoritmaları ile şifrelenerek saklanır.' },
                  { title: 'İzlenebilirlik', desc: 'Sistemdeki her işlem (okuma, yazma, silme) kullanıcı bazlı olarak loglanır.' },
                  { title: 'Filigran Koruması', desc: 'Tüm raporlar, raporu alan personelin ismiyle filigranlanarak veri sızıntılarına karşı korunur.' },
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-red-900 block text-sm">{item.title}</span>
                      <span className="text-red-800 text-xs">{item.desc}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        );
      case 'auth':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Lock className="w-6 h-6 text-indigo-600" />
                Çok Aşamalı Giriş Sistemi
              </h3>
              <div className="space-y-4">
                <div className="flex gap-4 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center font-bold text-indigo-600 shrink-0">1</div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">Kurumsal Google Girişi</h4>
                    <p className="text-xs text-gray-500">Sadece "edirnesydv@gmail.com" hesabı ile sisteme erişim sağlanabilir.</p>
                  </div>
                </div>
                <div className="flex gap-4 p-4 bg-gray-50 rounded-2xl">
                  <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center font-bold text-indigo-600 shrink-0">2</div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">Personel Seçimi ve Şifre</h4>
                    <p className="text-xs text-gray-500">Google girişinden sonra ilgili personel seçilir ve kişisel şifresi ile oturum açılır.</p>
                  </div>
                </div>
                <div className="p-4 bg-amber-50 border border-amber-100 rounded-2xl flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-800 font-medium">
                    Google hesabından çıkış yapıldığında sistem otomatik olarak personel oturumunu da kapatır ve tam güvenlik sağlar.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 'management':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
                <h4 className="font-bold text-gray-900 mb-2">Hane (Vatandaş) Yönetimi</h4>
                <ul className="text-xs text-gray-500 space-y-2 list-disc pl-4">
                  <li><b>Kayıt:</b> T.C. Kimlik No, Ad-Soyad, Telefon, Adres ve Mahalle bilgileri zorunludur.</li>
                  <li><b>Excel İçe Aktarma:</b> Mevcut listeler toplu olarak sisteme yüklenebilir.</li>
                  <li><b>Akıllı Adres:</b> Girilen adres metninden mahalle bilgisi otomatik olarak ayrıştırılır.</li>
                  <li><b>Hizmet Geçmişi:</b> Her hanenin geçmişte aldığı tüm temizlik hizmetleri ve notları görüntülenebilir.</li>
                </ul>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
                <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center mb-4">
                  <Briefcase className="w-6 h-6 text-green-600" />
                </div>
                <h4 className="font-bold text-gray-900 mb-2">Personel (Görevli) Yönetimi</h4>
                <ul className="text-xs text-gray-500 space-y-2 list-disc pl-4">
                  <li><b>Kayıt:</b> Personel iletişim ve kimlik bilgileri güvenli bir şekilde saklanır.</li>
                  <li><b>Performans Takibi:</b> Personelin aylık/yıllık tamamladığı görev sayısı ve çalışma istatistikleri tutulur.</li>
                  <li><b>Görev Geçmişi:</b> Personelin hangi tarihte hangi haneye hizmet verdiği izlenebilir.</li>
                </ul>
              </div>
            </div>
          </motion.div>
        );
      case 'planning':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Calendar className="w-6 h-6 text-purple-600" />
                Akıllı Programlama ve Kısıtlar
              </h3>
              <div className="space-y-4">
                <div className="p-4 border border-gray-100 rounded-2xl">
                  <h4 className="font-bold text-gray-900 text-sm mb-2">Planlama Kuralları</h4>
                  <ul className="text-xs text-gray-500 space-y-2">
                    <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-purple-600" /> Her haneye standart olarak 2 personel atanır.</li>
                    <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-purple-600" /> Bir personel günde en fazla 2 farklı hane ziyaret edebilir.</li>
                    <li className="flex items-center gap-2"><ChevronRight className="w-3 h-3 text-purple-600" /> Planlama, mahalle bazlı kümeleme yaparak yol süresini minimize eder.</li>
                  </ul>
                </div>
                <div className="p-4 bg-purple-50 border border-purple-100 rounded-2xl">
                  <h4 className="font-bold text-purple-900 text-sm mb-1">Zaman Kısıtları</h4>
                  <p className="text-xs text-purple-700">
                    Saat <b>08:30</b>'dan sonra yapılan yeni planlamalar, operasyonel hazırlık süreci nedeniyle zorunlu olarak bir sonraki iş gününden başlatılır.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 'operations':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <ClipboardList className="w-6 h-6 text-orange-600" />
                Günlük Operasyon Akışı
              </h3>
              <div className="space-y-4">
                <div className="flex gap-4 p-4 bg-orange-50 rounded-2xl">
                  <div className="w-8 h-8 bg-orange-100 rounded-full flex items-center justify-center font-bold text-orange-600 shrink-0">!</div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-sm">Otomatik Onaylama (17:30 Kuralı)</h4>
                    <p className="text-xs text-gray-500">Saha personeli tarafından manuel onaylanmayan günlük işler, mesai bitimi olan 17:30'da sistem tarafından otomatik olarak onaylanır.</p>
                  </div>
                </div>
                <div className="p-4 border border-gray-100 rounded-2xl">
                  <h4 className="font-bold text-gray-900 text-sm mb-2">Gelişmiş Gün İptali</h4>
                  <p className="text-xs text-gray-500 mb-2">Hava muhalefeti veya idari izinlerde kullanılan bu özellik:</p>
                  <ul className="text-xs text-gray-500 space-y-1 list-disc pl-4">
                    <li>Seçilen gündeki tüm işleri iptal eder.</li>
                    <li>İptal edilen işleri bir sonraki iş gününe veya özel bir tarihe kaydırır.</li>
                    <li>Takip eden tüm programı otomatik olarak ileriye öteler (Reflow).</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>
        );
      case 'reporting':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-green-600" />
                İstatistik ve Raporlama Standartları
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <Download className="w-4 h-4 text-gray-600" />
                    <span className="font-bold text-sm">Resmi PDF Raporlar</span>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    Kurum logolu, "Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı" filigranlı ve yetkili personel imzalı resmi belgeler üretilir. 
                    Tarih formatları standart olarak <b>dd.MM.yyyy</b> (Örn: 12.04.2026) şeklindedir.
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-gray-600" />
                    <span className="font-bold text-sm">Detaylı Analiz</span>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    Hane bazlı hizmet geçmişi ve personel bazlı çalışma performansı raporları tek tıkla alınabilir. 
                    Tüm veriler Excel formatında dışa aktarılabilir.
                  </p>
                </div>
              </div>
              <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-2xl">
                <h4 className="font-bold text-blue-900 text-xs mb-1">Görsel İstatistikler</h4>
                <p className="text-[10px] text-blue-700">Genel Durum panelinde mahalle bazlı dağılım, aylık hizmet sayıları ve personel verimliliği grafiklerle anlık olarak takip edilir.</p>
              </div>
            </div>
          </motion.div>
        );
      case 'audit':
        return (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
              <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                <History className="w-6 h-6 text-slate-600" />
                Denetim, Yedekleme ve Kurtarma
              </h3>
              <div className="space-y-4">
                <div className="p-4 border border-gray-100 rounded-2xl">
                  <h4 className="font-bold text-gray-900 text-sm mb-1">İşlem Geçmişi (Audit Log)</h4>
                  <p className="text-xs text-gray-500">
                    Sistemde yapılan her türlü kritik işlem (Giriş, Çıkış, Kayıt Ekleme/Silme, Program Güncelleme) 
                    zaman damgası ve kullanıcı bilgisiyle kalıcı olarak kaydedilir. Bu veriler silinemez ve değiştirilemez.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <h4 className="font-bold text-gray-900 text-xs mb-1">Drive Yedekleme</h4>
                    <p className="text-[10px] text-gray-500">Veritabanı yedeği JSON formatında kurumun Google Drive hesabına aktarılır.</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl">
                    <h4 className="font-bold text-gray-900 text-xs mb-1">Veri Geri Yükleme</h4>
                    <p className="text-[10px] text-gray-500">Olası bir veri kaybında, alınan yedek dosyası sisteme yüklenerek tüm veriler saniyeler içinde kurtarılabilir.</p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-4 bg-blue-600 rounded-3xl shadow-lg shadow-blue-200 mb-2">
          <Book className="w-10 h-10 text-white" />
        </div>
        <div>
          <h2 className="text-3xl font-black text-gray-900 tracking-tight">SİSTEM KULLANIM KILAVUZU</h2>
          <p className="text-gray-500 font-medium uppercase tracking-[0.2em] text-xs">Edirne Merkez Sosyal Yardımlaşma ve Dayanışma Vakfı</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <aside className="lg:w-72 shrink-0">
          <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-sm sticky top-24">
            <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-4 px-4">Bölümler</h3>
            <nav className="space-y-1">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all text-left
                    ${activeSection === section.id 
                      ? 'bg-blue-600 text-white font-bold shadow-lg shadow-blue-100' 
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}
                  `}
                >
                  <section.icon className={`w-5 h-5 ${activeSection === section.id ? 'text-white' : 'text-gray-400'}`} />
                  <span className="text-sm">{section.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </aside>

        {/* Content Area */}
        <div className="flex-1 min-h-[600px]">
          <AnimatePresence mode="wait">
            <div key={activeSection}>
              <div className="mb-8">
                <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
                  {React.createElement(sections.find(s => s.id === activeSection)?.icon || Book, { className: "w-8 h-8 text-blue-600" })}
                  {sections.find(s => s.id === activeSection)?.label}
                </h2>
                <div className="h-1 w-20 bg-blue-600 rounded-full mt-2" />
              </div>
              {renderSectionContent()}
            </div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Info */}
      <div className="bg-gray-900 rounded-3xl p-8 text-white flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gray-800 rounded-2xl">
            <HelpCircle className="w-6 h-6 text-blue-400" />
          </div>
          <div>
            <h4 className="font-bold">Teknik Destek</h4>
            <p className="text-sm text-gray-400">Sistemle ilgili sorunlar için vakıf bilgi işlem birimi ile iletişime geçiniz.</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="p-3 bg-gray-800 rounded-2xl">
            <Settings className="w-6 h-6 text-purple-400" />
          </div>
          <div>
            <h4 className="font-bold">Sistem Versiyonu</h4>
            <p className="text-sm text-gray-400">v2.4.0 - 2026 Kararlı Sürüm</p>
          </div>
        </div>
      </div>
    </div>
  );
}
