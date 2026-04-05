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

// Multiple reliable CDN sources for Roboto fonts
const ROBOTO_REGULAR_SOURCES = [
  'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Regular.ttf',
  'https://cdnjs.cloudflare.com/ajax/libs/roboto-fontface/0.10.0/fonts/roboto/Roboto-Regular.ttf',
  'https://unpkg.com/roboto-fontface@0.10.0/fonts/roboto/Roboto-Regular.ttf',
  'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Regular.ttf'
];

const ROBOTO_BOLD_SOURCES = [
  'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Bold.ttf',
  'https://cdnjs.cloudflare.com/ajax/libs/roboto-fontface/0.10.0/fonts/roboto/Roboto-Bold.ttf',
  'https://unpkg.com/roboto-fontface@0.10.0/fonts/roboto/Roboto-Bold.ttf',
  'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Bold.ttf'
];

let regularFontData: string | null = null;
let boldFontData: string | null = null;

async function fetchFontWithFallback(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const buffer = await response.arrayBuffer();
      // Basic validation: TTF files should be reasonably large (usually > 30KB)
      if (buffer.byteLength < 10000) continue;
      
      return arrayBufferToBase64(buffer);
    } catch (e) {
      console.warn(`Failed to fetch font from ${url}, trying next...`, e);
      continue;
    }
  }
  return null;
}

export async function loadTurkishFonts(pdf: jsPDF): Promise<boolean> {
  try {
    if (!regularFontData) {
      regularFontData = await fetchFontWithFallback(ROBOTO_REGULAR_SOURCES);
    }

    if (!boldFontData) {
      boldFontData = await fetchFontWithFallback(ROBOTO_BOLD_SOURCES);
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
    console.error('Critical error in loadTurkishFonts:', error);
    pdf.setFont('helvetica', 'normal');
    return false;
  }
}
