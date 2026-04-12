export interface Admin {
  id?: string;
  name: string;
  surname: string;
  email: string;
  tcNo: string;
  phone: string;
  createdAt: string;
}

export interface Applicant {
  id?: string;
  name: string;
  surname: string;
  tcNo: string;
  haneNo?: string; // Hane Numarası (Unique)
  phone: string;
  address: string;
  neighborhood?: string; // Optional neighborhood
  householdSize?: number; // Kişi Sayısı
  lat?: number;
  lng?: number;
  priority?: number; // Planlama öncelik sırası
}

export interface Staff {
  id?: string;
  name: string;
  surname: string;
  tcNo: string;
  phone: string;
  partnerId?: string; // ID of the other staff member in the team
}

export interface WorkDay {
  id?: string;
  date: string; // ISO YYYY-MM-DD
  isWorkDay: boolean;
}

export interface Schedule {
  id?: string;
  date: string; // ISO YYYY-MM-DD
  programId?: string; // ID of the program this schedule belongs to
  assignments: {
    applicantId: string;
    staffIds: string[]; // Array of staff IDs
    isCompleted?: boolean;
    completionDate?: string;
    completionNote?: string;
  }[];
}

export interface Program {
  id?: string;
  name: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  status: 'active' | 'cancelled';
  lastApplicantId?: string; // The ID of the last applicant assigned in this program
  lastVisitCycle?: number; // 1 or 2, to track if it was the first or second visit
}

export interface DailyAssignment {
  date: string;
  items: {
    applicant: Applicant;
    staffMembers: Staff[]; // Array of staff objects
  }[];
}

export const EDIRNE_NEIGHBORHOODS = [
  "1. Murat", "Abdurrahman", "Atatürk", "Babademirtaş", "Barutluk", "Çavuşbey", 
  "Cumhuriyet", "Dilaverbey", "Fatih", "İstasyon", "100. Yıl", "Karaağaç", "Kocasinan", 
  "Kurtuluş", "Medrese Alibey", "Menzilahir", "Meydan", "Mithatpaşa", "Nişancıpaşa", 
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
