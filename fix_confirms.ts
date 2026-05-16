import * as fs from 'fs';
import * as path from 'path';

const replaceFile = (filePath: string, changes: {from: string, to: string}[]) => {
  let content = fs.readFileSync(filePath, 'utf-8');
  for (const match of changes) {
    content = content.replace(match.from, match.to);
  }
  fs.writeFileSync(filePath, content);
};

// ActiveTasksTracker
replaceFile('src/components/ActiveTasksTracker.tsx', [
  { from: `if (!(await confirm({ message: 'Bu ziyareti tamamlandı olarak işaretlemek istediğinize emin misiniz? (Personellerin listesinden de tamamlanmış olarak düşecektir., type: "warning" }))')) return;`,
    to: `if (!(await confirm({ message: 'Bu ziyareti tamamlandı olarak işaretlemek istediğinize emin misiniz? (Personellerin listesinden de tamamlanmış olarak düşecektir.)', type: "warning" }))) return;` }
]);

// ApplicantList
replaceFile('src/components/ApplicantList.tsx', [
  { from: `if (!(await confirm({ message: 'Sistemde aktif bir program bulunmaktadır. Öncelik sırasını değiştirmek programın yeniden düzenlenmesine neden olabilir (Kaydet butonuna bastığınızda, type: "warning" })). Devam etmek istiyor musunuz?')) {`,
    to: `if (!(await confirm({ message: 'Sistemde aktif bir program bulunmaktadır. Öncelik sırasını değiştirmek programın yeniden düzenlenmesine neden olabilir (Kaydet butonuna bastığınızda). Devam etmek istiyor musunuz?', type: 'warning' }))) {` }
]);

// BackupManager
replaceFile('src/components/BackupManager.tsx', [
  { from: 'if (!(await confirm({ message: `Veritabanını bilgisayarınıza ${format.toUpperCase(, type: "warning" }))} formatında yedeklemek istediğinize emin misiniz?`)) {',
    to: 'if (!(await confirm({ message: `Veritabanını bilgisayarınıza ${format.toUpperCase()} formatında yedeklemek istediğinize emin misiniz?`, type: "warning" }))) {' },
  { from: 'if (!(await confirm({ message: \'DİKKAT: Bu işlem mevcut tüm verileri silecek ve yedek dosyasındaki verileri yükleyecektir. Devam etmek istediğinize emin misiniz?\', type: "warning" }))) {',
    to: 'if (!(await confirm({ message: \'DİKKAT: Bu işlem mevcut tüm verileri silecek ve yedek dosyasındaki verileri yükleyecektir. Devam etmek istediğinize emin misiniz?\', type: "warning" }))) {' }
]);

// InstallPrompt
replaceFile('src/components/InstallPrompt.tsx', [
  { from: 'await deferredPrompt.(await confirm({ message: , type: "info", withPrompt: true, promptPlaceholder: "Yanıtınız..." }))();',
    to: 'await deferredPrompt.prompt();' }
]);

// ProgramManagement
replaceFile('src/components/ProgramManagement.tsx', [
  { from: 'if (!(await confirm({ message: `${new Date(date).toLocaleDateString(\'tr-TR\', type: "warning" }))} tarihindeki tüm manuel atamaları silmek istediğinize emin misiniz?\`)) return;',
    to: 'if (!(await confirm({ message: `${new Date(date).toLocaleDateString(\'tr-TR\')} tarihindeki tüm manuel atamaları silmek istediğinize emin misiniz?`, type: "warning" }))) return;' }
]);

// ScheduleView
replaceFile('src/components/ScheduleView.tsx', [
  { from: 'const willDoMore = (await confirm({ message: "Son günün kapasitesi eksik kaldı. Başka kaydırma işlemi yapacak mısınız?\\n\\nTamam: Evet, başka kaydırma yapacağım (10 dakika beklenir, type: "warning" }))\\nİptal: Hayır, yapmayacağım (Eksik gün otomatik olarak görevlendirilir)");',
    to: 'const willDoMore = await confirm({ message: "Son günün kapasitesi eksik kaldı. Başka kaydırma işlemi yapacak mısınız?\\n\\nTamam: Evet, başka kaydırma yapacağım (10 dakika beklenir)\\nİptal: Hayır, yapmayacağım (Eksik gün otomatik olarak görevlendirilir)", type: "warning" });' },
  { from: 'const reason = (await confirm({ message: \'Mazeret veya sebep giriniz (opsiyonel, type: "info", withPrompt: true, promptPlaceholder: "Yanıtınız..." })): \'\';',
    to: 'const reason = await confirm({ message: \'Mazeret veya sebep giriniz (opsiyonel):\', type: "info", withPrompt: true, promptPlaceholder: "Yanıtınız..." });' },
  { from: 'const reason = (await confirm({ message: \'Mazeret veya sebep giriniz (opsiyonel, type: "info", withPrompt: true, promptPlaceholder: "Yanıtınız..." })): \';',
    to: 'const reason = await confirm({ message: \'Mazeret veya sebep giriniz (opsiyonel):\', type: "info", withPrompt: true, promptPlaceholder: "Yanıtınız..." });' },
  { from: `if ((await confirm({ message: 'Bu pasife alma (iptal, type: "warning" })) işlemini geri almak istediğinize emin misiniz?')) {`,
    to: `if (await confirm({ message: 'Bu pasife alma (iptal) işlemini geri almak istediğinize emin misiniz?', type: "warning" })) {` }
]);

console.log("done");
