export function maskTcNo(tcNo: string | undefined): string {
  if (!tcNo || tcNo.length !== 11) return tcNo || '';
  return `${tcNo.substring(0, 2)}*******${tcNo.substring(9)}`;
}

export function maskPhone(phone: string | undefined): string {
  if (!phone || phone.length < 10) return phone || '';
  // Assuming format like 05XX XXX XX XX -> 05XX *** ** XX
  return `${phone.substring(0, 4)} *** ** ${phone.substring(phone.length - 2)}`;
}
