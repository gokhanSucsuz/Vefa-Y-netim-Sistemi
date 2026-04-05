import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Applicant, Staff } from '../types';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { APP_LOGO_URL } from '../constants/logo';
import { loadTurkishFonts } from './pdfFonts';

export const generateCleaningReport = async (applicant: Applicant, staffMembers: Staff[], date: string) => {
  const pdf = new jsPDF('p', 'mm', 'a4');
  await loadTurkishFonts(pdf);
  
  const pdfWidth = pdf.internal.pageSize.getWidth();
  const formattedDate = format(parseISO(date), 'd MMMM yyyy', { locale: tr });

  // Header
  try {
    const img = new Image();
    img.src = APP_LOGO_URL;
    img.crossOrigin = "anonymous";
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
    });
    pdf.addImage(img, 'JPEG', (pdfWidth - 25) / 2, 10, 25, 25);
  } catch (e) {
    console.error("Logo could not be added to PDF", e);
  }

  pdf.setFontSize(16);
  pdf.setFont("Roboto", "bold");
  pdf.text("T.C.", pdfWidth / 2, 45, { align: "center" });
  pdf.setFontSize(14);
  pdf.text("EDİRNE VALİLİĞİ", pdfWidth / 2, 52, { align: "center" });
  pdf.setFontSize(12);
  pdf.text("Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı", pdfWidth / 2, 59, { align: "center" });
  
  pdf.setLineWidth(0.5);
  pdf.line(20, 62, pdfWidth - 20, 62);
  
  pdf.setFontSize(13);
  pdf.text("VEFA PROJESİ HİZMET SUNUM FORMU", pdfWidth / 2, 72, { align: "center" });

  pdf.setFontSize(11);
  pdf.setFont("Roboto", "normal");
  pdf.text(`Tarih: ${formattedDate}`, pdfWidth - 25, 82, { align: "right" });

  // 1. MÜRACAATÇI BİLGİLERİ
  pdf.setFont("Roboto", "bold");
  pdf.text("1. MÜRACAATÇI BİLGİLERİ", 20, 92);
  pdf.setLineWidth(0.2);
  pdf.rect(20, 95, pdfWidth - 40, 35);
  
  pdf.setFont("Roboto", "normal");
  pdf.text(`Adı Soyadı: ${applicant.name} ${applicant.surname}`, 25, 102);
  pdf.text(`T.C. Kimlik No: ${applicant.tcNo}`, 110, 102);
  pdf.text(`İletişim Tel: ${applicant.phone}`, 25, 110);
  pdf.text(`Mahalle/Köy: ${applicant.neighborhood || '-'}`, 110, 110);
  pdf.text(`Adres: ${applicant.address}`, 25, 118, { maxWidth: pdfWidth - 50 });

  // 2. GÖREVLİ PERSONEL BİLGİLERİ
  pdf.setFont("Roboto", "bold");
  pdf.text("2. GÖREVLİ PERSONEL BİLGİLERİ", 20, 140);
  
  autoTable(pdf, {
    startY: 143,
    head: [['Sıra', 'Adı Soyadı', 'Unvanı / Görevi']],
    body: staffMembers.map((s, idx) => [idx + 1, `${s.name} ${s.surname}`, 'Vefa Personeli']),
    theme: 'grid',
    headStyles: { fillColor: [242, 242, 242], textColor: [0, 0, 0], fontStyle: 'bold', font: 'Roboto' },
    styles: { fontSize: 10, cellPadding: 5, font: 'Roboto' },
    margin: { left: 20, right: 20, bottom: 25 }
  });

  // 3. SUNULAN HİZMETİN İÇERİĞİ
  const finalY = (pdf as any).lastAutoTable.finalY || 180;
  pdf.setFont("Roboto", "bold");
  pdf.text("3. SUNULAN HİZMETİN İÇERİĞİ", 20, finalY + 15);
  pdf.setLineWidth(0.2);
  pdf.rect(20, finalY + 18, pdfWidth - 40, 25);
  pdf.setFont("Roboto", "normal");
  const content = "Yukarıda bilgileri yer alan müracaatçının ikametgahında; Vefa Projesi uygulama usul ve esasları çerçevesinde genel ev temizliği, hijyen desteği ve temel ihtiyaçların karşılanmasına yönelik hizmetler eksiksiz olarak sunulmuştur.";
  pdf.text(content, 25, finalY + 25, { maxWidth: pdfWidth - 50, align: "justify" });

  // Signatures
  const signY = finalY + 60;
  pdf.setFont("Roboto", "bold");
  pdf.text("Hizmet Alan (Müracaatçı)", 50, signY, { align: "center" });
  pdf.text("Hizmet Sunan (Görevli)", pdfWidth - 50, signY, { align: "center" });
  pdf.setFont("Roboto", "normal");
  pdf.text("Ad Soyad / İmza", 50, signY + 10, { align: "center" });
  pdf.text("Ad Soyad / İmza", pdfWidth - 50, signY + 10, { align: "center" });

  // Footer
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.setFont("Roboto", "normal");
  pdf.text("Edirne Merkez Sosyal Yardımlaşma ve Dayanışma Vakfı - Vefa Projesi Takip Formu", pdfWidth / 2, 285, { align: "center" });

  pdf.save(`Temizlik_Raporu_${applicant.name}_${applicant.surname}_${date}.pdf`);
};
