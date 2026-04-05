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

// Reliable CDN URLs for Roboto TTF files
const ROBOTO_REGULAR_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf';
const ROBOTO_BOLD_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Bold.ttf';

let regularFontData: string | null = null;
let boldFontData: string | null = null;

export async function loadTurkishFonts(pdf: jsPDF) {
  try {
    if (!regularFontData) {
      const response = await fetch(ROBOTO_REGULAR_URL);
      const buffer = await response.arrayBuffer();
      regularFontData = arrayBufferToBase64(buffer);
    }

    if (!boldFontData) {
      const response = await fetch(ROBOTO_BOLD_URL);
      const buffer = await response.arrayBuffer();
      boldFontData = arrayBufferToBase64(buffer);
    }

    pdf.addFileToVFS('Roboto-Regular.ttf', regularFontData);
    pdf.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
    
    pdf.addFileToVFS('Roboto-Bold.ttf', boldFontData);
    pdf.addFont('Roboto-Bold.ttf', 'Roboto', 'bold');
    
    pdf.setFont('Roboto', 'normal');
  } catch (error) {
    console.error('Error loading Turkish fonts:', error);
    // Fallback to helvetica if font loading fails
    pdf.setFont('helvetica', 'normal');
  }
}
