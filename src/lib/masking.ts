/**
 * Veri Maskeleme Yardımcıları
 * Kişisel verilerin korunması kanununa (KVKK) uyumlu arayüz görünümü sağlar.
 */

export const maskTcNo = (tc: string): string => {
  if (!tc || tc.length < 11) return tc;
  return `${tc.substring(0, 3)}******${tc.substring(9)}`;
};

export const maskPhone = (phone: string): string => {
  if (!phone) return phone;
  // Temizle
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10) return phone;
  
  // Format: 05xx *** ** 11
  const match = cleaned.match(/^(\d{4})(\d{3})(\d{2})(\d{2})$/);
  if (match) {
    return `${match[1]} *** ** ${match[4]}`;
  }
  return phone;
};

export const maskAddress = (address: string): string => {
  if (!address || address.length < 10) return address;
  const parts = address.split(' ');
  if (parts.length < 2) return `${address.substring(0, 5)}...`;
  
  // İlk iki kelimeyi (genelde mahalle/cadde) göster, gerisini maskele
  return `${parts[0]} ${parts[1]} ... ${address.substring(address.length - 5)}`;
};
