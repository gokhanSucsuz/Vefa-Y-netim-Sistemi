import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Applicant, Staff } from '../types';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';

import { APP_LOGO_URL } from '../constants/logo';

export const generateCleaningReport = async (applicant: Applicant, staffMembers: Staff[], date: string) => {
  // Create a hidden container for the report
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '210mm';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#111827';
  container.style.fontFamily = 'Arial, Helvetica, sans-serif';
  container.style.fontSize = '11pt';
  container.style.padding = '25mm';
  container.style.lineHeight = '1.5';

  const formattedDate = format(parseISO(date), 'd MMMM yyyy', { locale: tr });

  container.innerHTML = `
    <div style="text-align: center; margin-bottom: 30px;">
      <img 
        src="${APP_LOGO_URL}" 
        alt="Logo" 
        crossOrigin="anonymous"
        style="width: 80px; height: 80px; margin: 0 auto 15px; display: block; object-fit: contain;" 
        referrerPolicy="no-referrer"
      />
      <h1 style="font-size: 16pt; font-weight: bold; text-transform: uppercase; margin: 0;">T.C.</h1>
      <h2 style="font-size: 14pt; font-weight: bold; text-transform: uppercase; margin: 5px 0;">EDİRNE VALİLİĞİ</h2>
      <h3 style="font-size: 12pt; font-weight: bold; text-transform: uppercase; margin-bottom: 20px; border-bottom: 1px solid #000; padding-bottom: 10px;">Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı</h3>
      <h4 style="font-size: 13pt; font-weight: bold; margin-top: 20px; text-decoration: underline;">VEFA PROJESİ HİZMET SUNUM FORMU</h4>
    </div>

    <div style="text-align: right; margin-bottom: 20px;">
      <p><strong>Tarih:</strong> ${formattedDate}</p>
    </div>

    <div style="margin-bottom: 30px; border: 1px solid #000; padding: 15px;">
      <h2 style="font-size: 11pt; font-weight: bold; text-decoration: underline; margin-bottom: 10px;">1. MÜRACAATÇI BİLGİLERİ</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 5px;">
        <p><strong>Adı Soyadı:</strong> ${applicant.name} ${applicant.surname}</p>
        <p><strong>T.C. Kimlik No:</strong> ${applicant.tcNo}</p>
        <p><strong>İletişim Tel:</strong> ${applicant.phone}</p>
        <p><strong>Mahalle/Köy:</strong> ${applicant.neighborhood || '-'}</p>
        <p style="grid-column: span 2;"><strong>Adres:</strong> ${applicant.address}</p>
      </div>
    </div>

    <div style="margin-bottom: 30px; border: 1px solid #000; padding: 15px;">
      <h2 style="font-size: 11pt; font-weight: bold; text-decoration: underline; margin-bottom: 10px;">2. GÖREVLİ PERSONEL BİLGİLERİ</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th style="border: 1px solid #000; padding: 8px; text-align: left;">Sıra</th>
            <th style="border: 1px solid #000; padding: 8px; text-align: left;">Adı Soyadı</th>
            <th style="border: 1px solid #000; padding: 8px; text-align: left;">Unvanı / Görevi</th>
          </tr>
        </thead>
        <tbody>
          ${staffMembers.map((s, idx) => `
            <tr>
              <td style="border: 1px solid #000; padding: 8px;">${idx + 1}</td>
              <td style="border: 1px solid #000; padding: 8px;">${s.name} ${s.surname}</td>
              <td style="border: 1px solid #000; padding: 8px;">Vefa Personeli</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div style="margin-bottom: 40px; border: 1px solid #000; padding: 15px;">
      <h2 style="font-size: 11pt; font-weight: bold; text-decoration: underline; margin-bottom: 10px;">3. SUNULAN HİZMETİN İÇERİĞİ</h2>
      <p style="text-align: justify;">Yukarıda bilgileri yer alan müracaatçının ikametgahında; Vefa Projesi uygulama usul ve esasları çerçevesinde genel ev temizliği, hijyen desteği ve temel ihtiyaçların karşılanmasına yönelik hizmetler eksiksiz olarak sunulmuştur.</p>
    </div>

    <div style="margin-top: 60px; display: flex; justify-content: space-around;">
      <div style="text-align: center;">
        <p style="font-weight: bold; marginBottom: 50px;">Hizmet Alan (Müracaatçı)</p>
        <p>Ad Soyad / İmza</p>
      </div>
      <div style="text-align: center;">
        <p style="font-weight: bold; marginBottom: 50px;">Hizmet Sunan (Görevli)</p>
        <p>Ad Soyad / İmza</p>
      </div>
    </div>

    <div style="position: absolute; bottom: 15mm; left: 25mm; right: 25mm; text-align: center; font-size: 8pt; color: #666; border-top: 0.5px solid #000; paddingTop: 5px;">
      Edirne Merkez Sosyal Yardımlaşma ve Dayanışma Vakfı - Vefa Projesi Takip Formu
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
    
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * pdfWidth) / canvas.width;
    
    let heightLeft = imgHeight;
    let position = 0;
    const margin = 15; // Bottom margin to prevent cutting text

    // Add the first page
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= (pdfHeight - margin);

    // Add subsequent pages if content is longer than one page
    while (heightLeft > 0) {
      position -= (pdfHeight - margin);
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= (pdfHeight - margin);
    }
    
    pdf.save(`Temizlik_Raporu_${applicant.name}_${applicant.surname}_${date}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
};
