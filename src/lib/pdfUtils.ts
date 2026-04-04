import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Applicant, Staff } from '../types';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';

export const generateCleaningReport = async (applicant: Applicant, staffMembers: Staff[], date: string) => {
  // Create a hidden container for the report
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#111827';
  container.style.fontFamily = 'Verdana, sans-serif';
  container.style.fontSize = '12pt';
  container.style.padding = '20mm';

  const formattedDate = format(parseISO(date), 'd MMMM yyyy', { locale: tr });

  container.innerHTML = `
    <div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #2563eb; padding-bottom: 20px;">
      <h1 style="font-size: 24pt; font-weight: bold; margin: 0; color: #1e3a8a;">VEFA PROJESİ TEMİZLİK TAKİP FORMU</h1>
      <p style="margin-top: 10px; color: #6b7280;">Edirne Merkez Sosyal Yardımlaşma ve Dayanışma Vakfı</p>
    </div>

    <div style="margin-bottom: 30px;">
      <p><strong>Tarih:</strong> ${formattedDate}</p>
    </div>

    <div style="margin-bottom: 40px;">
      <h2 style="font-size: 16pt; font-weight: bold; border-left: 5px solid #2563eb; padding-left: 15px; margin-bottom: 20px;">Müracaatçı Bilgileri</h2>
      <div style="display: grid; grid-template-cols: 1fr 1fr; gap: 10px;">
        <p><strong>Ad Soyad:</strong> ${applicant.name} ${applicant.surname}</p>
        <p><strong>TC Kimlik No:</strong> ${applicant.tcNo}</p>
        <p><strong>Telefon:</strong> ${applicant.phone}</p>
        <p><strong>Mahalle:</strong> ${applicant.neighborhood || '-'}</p>
        <p style="grid-column: span 2;"><strong>Adres:</strong> ${applicant.address}</p>
      </div>
    </div>

    <div style="margin-bottom: 40px;">
      <h2 style="font-size: 16pt; font-weight: bold; border-left: 5px solid #2563eb; padding-left: 15px; margin-bottom: 20px;">Temizlik Personeli Bilgileri</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left;">No</th>
            <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left;">Ad Soyad</th>
            <th style="border: 1px solid #d1d5db; padding: 10px; text-align: left;">Telefon</th>
          </tr>
        </thead>
        <tbody>
          ${staffMembers.map((s, idx) => `
            <tr>
              <td style="border: 1px solid #d1d5db; padding: 10px;">${idx + 1}</td>
              <td style="border: 1px solid #d1d5db; padding: 10px;">${s.name} ${s.surname}</td>
              <td style="border: 1px solid #d1d5db; padding: 10px;">${s.phone}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div style="margin-bottom: 60px;">
      <h2 style="font-size: 16pt; font-weight: bold; border-left: 5px solid #2563eb; padding-left: 15px; margin-bottom: 20px;">Yapılan İşlemler</h2>
      <p style="line-height: 1.6;">Vefa projesi kapsamında müracaatçının ikametgahında genel ev temizliği, kişisel bakım ve hijyen desteği hizmetleri sunulmuştur. Yapılan çalışmalar vakıf standartlarına uygun şekilde tamamlanmıştır.</p>
    </div>

    <div style="margin-top: 100px; display: flex; justify-content: space-between; padding: 0 40px;">
      <div style="text-align: center;">
        <div style="border-top: 1px solid #000; width: 200px; margin-bottom: 10px;"></div>
        <p><strong>Müracaatçı İmza</strong></p>
        <p style="font-size: 10pt; color: #6b7280;">(Teslim Alan)</p>
      </div>
      <div style="text-align: center;">
        <div style="border-top: 1px solid #000; width: 200px; margin-bottom: 10px;"></div>
        <p><strong>Personel İmza</strong></p>
        <p style="font-size: 10pt; color: #6b7280;">(Teslim Eden)</p>
      </div>
    </div>

    <div style="position: absolute; bottom: 20mm; left: 20mm; right: 20mm; text-align: center; font-size: 10pt; color: #9ca3af; font-style: italic; border-top: 1px solid #e5e7eb; pt: 10px;">
      Bu belge Edirne Merkez SYDV Vefa Programı Yönetim Sistemi tarafından otomatik olarak oluşturulmuştur.
    </div>
  `;

  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Temizlik_Raporu_${applicant.name}_${applicant.surname}_${date}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
};
