export interface Applicant {
  id?: number;
  name: string;
  surname: string;
  tcNo: string;
  phone: string;
  address: string;
  neighborhood?: string; // Optional neighborhood
  householdSize?: number; // Kişi Sayısı
  lat?: number;
  lng?: number;
}

export interface Staff {
  id?: number;
  name: string;
  surname: string;
  tcNo: string;
  phone: string;
  partnerId?: number; // ID of the other staff member in the team
}

export interface WorkDay {
  id?: number;
  date: string; // ISO YYYY-MM-DD
  isWorkDay: boolean;
}

export interface Schedule {
  id?: number;
  date: string; // ISO YYYY-MM-DD
  assignments: {
    applicantId: number;
    staffIds: number[]; // Array of staff IDs
  }[];
}

export interface DailyAssignment {
  date: string;
  items: {
    applicant: Applicant;
    staffMembers: Staff[]; // Array of staff objects
  }[];
}

export const EDIRNE_NEIGHBORHOODS = [
  "1. Murat", "Abdurrahman", "Babademirtaş", "Barutluk", "Çavuşbey", 
  "Dilaverbey", "Fatih", "İstasyon", "Karaağaç", "Kocasinan", 
  "Medrese Alibey", "Menzilahir", "Mithatpaşa", "Nişancıpaşa", 
  "Sabuni", "Sarıcapaşa", "Şükrüpaşa", "Talatpaşa", "Umurbey", 
  "Yeniimaret", "Yıldırım Beyazıt", "Yıldırım Hacı Sarraf",
  // Köyler
  "Ahi", "Avarız", "Bosna", "Budakdoğanca", "Büyükdöllük", "Büyükismailçe", 
  "Değirmenyeni", "Demirhanlı", "Doyran", "Ekmekçi", "Elçili", "Eskikadın", 
  "Hacıumur", "Hasanağa", "Hatipköy", "Hıdıraga", "İskender", "Karabulut", 
  "Karakasım", "Karatren", "Kemalköy", "Kocahıdır", "Korucu", "Köşen", 
  "Küküler", "Menekşesofular", "Muratçalı", "Musabeyli", "Orhaniye", 
  "Sarayakpınar", "Sazlıdere", "Suakacağı", "Tayakadın", "Üyüklütatar", 
  "Uzgaç", "Yolageldi"
];
