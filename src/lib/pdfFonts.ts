import { jsPDF } from 'jspdf';

// Helper to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

// Reliable CDN URLs for Roboto TTF files from roboto-fontface npm package
const ROBOTO_REGULAR_URL = 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Regular.ttf';
const ROBOTO_BOLD_URL = 'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Bold.ttf';

let regularFontData: string | null = null;
let boldFontData: string | null = null;

export async function loadTurkishFonts(pdf: jsPDF): Promise<boolean> {
  try {
    if (!regularFontData) {
      const response = await fetch(ROBOTO_REGULAR_URL);
      if (!response.ok) throw new Error(`Failed to fetch Regular font: ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 1000) throw new Error('Regular font file too small, likely invalid');
      regularFontData = arrayBufferToBase64(buffer);
    }

    if (!boldFontData) {
      const response = await fetch(ROBOTO_BOLD_URL);
      if (!response.ok) throw new Error(`Failed to fetch Bold font: ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 1000) throw new Error('Bold font file too small, likely invalid');
      boldFontData = arrayBufferToBase64(buffer);
    }

    if (regularFontData) {
      pdf.addFileToVFS('Roboto-Regular.ttf', regularFontData);
      pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    }
    
    if (boldFontData) {
      pdf.addFileToVFS('Roboto-Bold.ttf', boldFontData);
      pdf.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    }
    
    if (regularFontData) {
      pdf.setFont('Roboto', 'normal');
      return true;
    }
    
    pdf.setFont('helvetica', 'normal');
    return false;
  } catch (error) {
    console.error('Error loading Turkish fonts:', error);
    pdf.setFont('helvetica', 'normal');
    return false;
  }
}
