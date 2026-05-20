export interface Admin {
  id?: string;
  name: string;
  surname: string;
  email: string;
  tcNo: string;
  phone: string;
  createdAt: string;
}

export interface SystemUser {
  id?: string;
  name: string;
  surname: string;
  tcNo: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'staff' | 'superadmin';
  status?: 'active' | 'inactive' | 'pending';
  isApproved?: boolean;
  isSuperAdmin?: boolean;
  createdAt: string;
}

export interface AuditLog {
  id?: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  timestamp: string;
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
  isDeleted?: boolean;
  status?: 'active' | 'passive';
  passiveUntil?: string; // ISO Date String
  teamId?: string; // Atanmış ekip ID'si (staff pair)
}

export interface Staff {
  id?: string;
  name: string;
  surname: string;
  tcNo: string;
  phone: string;
  googleEmail?: string; // Google account email
  isApproved?: boolean; // Management approval for staff access
  partnerId?: string; // ID of the other staff member in the team
  isActive?: boolean;
  isBackup?: boolean; // Yedek personel
  dutyLocation?: string; // Görev yeri
  resignationDate?: string; // İşten ayrılış tarihi (YYYY-MM-DD)
  resignationReason?: string; // İşten ayrılış sebebi
  leaves?: { 
    id: string;
    startDate: string; 
    endDate: string; 
    type: 'annual' | 'sick' | 'half_morning' | 'half_afternoon' | 'unpaid' | 'other';
    reason?: string; 
    backupStaffId?: string;
  }[];
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
    shift?: 'morning' | 'afternoon'; // Vardiya (yoksa gün bütünü)
    isCompleted?: boolean;
    isCancelled?: boolean;
    cancelReason?: string;
    completionDate?: string;
    completionNote?: string;
    approvals?: { 
      staffId: string; 
      date: string; 
      note?: string; 
      lat?: number; 
      lng?: number;
      startTime?: string;
      endTime?: string;
    }[];
  }[];
  customTasks?: {
    id: string;
    staffId: string;
    taskDescription: string;
    isCompleted?: boolean;
    completionDate?: string;
    completionNote?: string;
  }[];
}

export interface StaffAssignment {
  id?: string;
  staffId: string;              // Görevlendirilen personel ID
  assignmentType: 'vakif' | 'hasta_bakim' | 'idari' | 'diger'; // Görev türü
  description?: string;         // Serbest açıklama
  date: string;                 // YYYY-MM-DD
  shift: 'morning' | 'afternoon' | 'full'; // Sabah / Öğleden sonra / Tam gün
  backupStaffId?: string;       // Yedek personel atandıysa ID
  cleaningShifted?: boolean;    // Temizlik görevi kaydırıldı mı?
  createdAt: string;
  createdBy: string;            // Oluşturan kullanıcı ID
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
