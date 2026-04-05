import pdfMake from 'pdfmake/build/pdfmake';

// Multiple reliable CDN sources for Roboto fonts
const ROBOTO_REGULAR_SOURCES = [
  'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Regular.ttf',
  'https://cdnjs.cloudflare.com/ajax/libs/roboto-fontface/0.10.0/fonts/roboto/Roboto-Regular.ttf',
  'https://unpkg.com/roboto-fontface@0.10.0/fonts/roboto/Roboto-Regular.ttf'
];

const ROBOTO_BOLD_SOURCES = [
  'https://cdn.jsdelivr.net/npm/roboto-fontface@0.10.0/fonts/roboto/Roboto-Bold.ttf',
  'https://cdnjs.cloudflare.com/ajax/libs/roboto-fontface/0.10.0/fonts/roboto/Roboto-Bold.ttf',
  'https://unpkg.com/roboto-fontface@0.10.0/fonts/roboto/Roboto-Bold.ttf'
];

let regularFontData: string | null = null;
let boldFontData: string | null = null;

async function fetchFontWithFallback(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 10000) continue;
      
      // Convert to base64
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      return window.btoa(binary);
    } catch (e) {
      console.warn(`Failed to fetch font from ${url}, trying next...`, e);
      continue;
    }
  }
  return null;
}

export async function setupPdfMakeFonts() {
  if (!regularFontData) {
    regularFontData = await fetchFontWithFallback(ROBOTO_REGULAR_SOURCES);
  }
  if (!boldFontData) {
    boldFontData = await fetchFontWithFallback(ROBOTO_BOLD_SOURCES);
  }

  if (regularFontData && boldFontData) {
    const vfs = {
      'Roboto-Regular.ttf': regularFontData,
      'Roboto-Bold.ttf': boldFontData
    };

    (pdfMake as any).vfs = vfs;
    (pdfMake as any).fonts = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Bold.ttf',
        italics: 'Roboto-Regular.ttf',
        bolditalics: 'Roboto-Bold.ttf'
      }
    };
    return true;
  }
  return false;
}
