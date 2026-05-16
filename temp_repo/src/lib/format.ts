export const formatPhone = (phone: string | undefined): string => {
  if (!phone) return '-';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `+90 (${cleaned.substring(0, 3)}) ${cleaned.substring(3, 6)} ${cleaned.substring(6, 8)} ${cleaned.substring(8, 10)}`;
  }
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `+90 (${cleaned.substring(1, 4)}) ${cleaned.substring(4, 7)} ${cleaned.substring(7, 9)} ${cleaned.substring(9, 11)}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith('90')) {
    return `+90 (${cleaned.substring(2, 5)}) ${cleaned.substring(5, 8)} ${cleaned.substring(8, 10)} ${cleaned.substring(10, 12)}`;
  }
  return phone;
};

export const formatTC = (tc: string | undefined): string => {
  if (!tc) return '-';
  return tc;
};
