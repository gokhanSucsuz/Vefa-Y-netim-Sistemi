import { jsPDF } from 'jspdf';
import 'jspdf-autotable';
import { Applicant, Staff } from '../types';

// Simple helper to handle Turkish characters by replacing them with similar ones if font is not available
// Or better, we can try to use a font that supports them.
// For this environment, we'll use a basic replacement strategy if needed, 
// but jspdf-autotable with standard fonts sometimes works if configured correctly.
export const generateCleaningReport = (applicant: Applicant, staffMembers: Staff[], date: string) => {
  const doc = new jsPDF();

  // Helper to fix Turkish characters for standard PDF fonts
  const fixTR = (text: string) => {
    if (!text) return "";
    const map: Record<string, string> = {
      'ğ': 'g', 'Ğ': 'G', 'ü': 'u', 'Ü': 'U', 'ş': 's', 'Ş': 'S',
      'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ç': 'c', 'Ç': 'C'
    };
    return text.replace(/[ğĞüÜşŞıİöÖçÇ]/g, letter => map[letter] || letter);
  };

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(fixTR("VEFA PROJESI TEMIZLIK TAKIP FORMU"), 105, 20, { align: 'center' });
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(fixTR(`Tarih: ${new Date(date).toLocaleDateString('tr-TR')}`), 20, 35);

  // Applicant Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(fixTR("Muracaatci Bilgileri"), 20, 50);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(fixTR(`Ad Soyad: ${applicant.name} ${applicant.surname}`), 20, 60);
  doc.text(fixTR(`TC No: ${applicant.tcNo}`), 20, 67);
  doc.text(fixTR(`Telefon: ${applicant.phone}`), 20, 74);
  doc.text(fixTR(`Adres: ${applicant.address}`), 20, 81);
  if (applicant.neighborhood) {
    doc.text(fixTR(`Mahalle: ${applicant.neighborhood}`), 20, 88);
  }

  // Staff Info
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(fixTR("Temizlik Personeli Bilgileri"), 20, 105);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  staffMembers.forEach((s, index) => {
    doc.text(fixTR(`${index + 1}. Personel: ${s.name} ${s.surname} (${s.phone})`), 20, 115 + (index * 7));
  });

  // Service Details
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(fixTR("Yapilan Islemler"), 20, 140);
  
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(fixTR("Vefa projesi kapsaminda ev temizligi ve kisisel bakim hizmetleri sunulmustur."), 20, 150);

  // Signature Area
  const signatureY = 220;
  doc.line(20, signatureY, 80, signatureY);
  doc.line(130, signatureY, 190, signatureY);
  
  doc.setFont("helvetica", "bold");
  doc.text(fixTR("Muracaatci Imza"), 50, signatureY + 10, { align: 'center' });
  doc.text(fixTR("Personel Imza"), 160, signatureY + 10, { align: 'center' });

  doc.save(`Temizlik_Raporu_${applicant.name}_${applicant.surname}_${date}.pdf`);
};
