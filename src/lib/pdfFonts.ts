import pdfMake from 'pdfmake/build/pdfmake';

// Extremely reliable cdnjs sources for Roboto fonts (standard with pdfmake)
const ROBOTO_REGULAR_SOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf',
  'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/fonts/Roboto/Roboto-Regular.ttf'
];

const ROBOTO_BOLD_SOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Bold.ttf',
  'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/fonts/Roboto/Roboto-Bold.ttf'
];

const ROBOTO_MEDIUM_SOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Medium.ttf',
  'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/fonts/Roboto/Roboto-Medium.ttf'
];

const ROBOTO_ITALIC_SOURCES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Italic.ttf',
  'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/fonts/Roboto/Roboto-Italic.ttf'
];

let regularFontData: string | null = null;
let boldFontData: string | null = null;
let mediumFontData: string | null = null;
let italicFontData: string | null = null;

async function fetchFontWithFallback(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Font fetch failed for ${url}: ${response.status}`);
        continue;
      }
      
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 5000) {
        console.warn(`Font file too small from ${url}: ${buffer.byteLength} bytes`);
        continue;
      }
      
      // Convert to base64 efficiently
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunk)));
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
  // Load fonts in parallel
  const [reg, bld, med, itl] = await Promise.all([
    regularFontData ? Promise.resolve(regularFontData) : fetchFontWithFallback(ROBOTO_REGULAR_SOURCES),
    boldFontData ? Promise.resolve(boldFontData) : fetchFontWithFallback(ROBOTO_BOLD_SOURCES),
    mediumFontData ? Promise.resolve(mediumFontData) : fetchFontWithFallback(ROBOTO_MEDIUM_SOURCES),
    italicFontData ? Promise.resolve(italicFontData) : fetchFontWithFallback(ROBOTO_ITALIC_SOURCES)
  ]);

  // Use regular font as fallback for others if they fail
  regularFontData = reg;
  boldFontData = bld || reg;
  mediumFontData = med || reg;
  italicFontData = itl || reg;

  if (regularFontData) {
    const vfs: Record<string, string> = {
      'Roboto-Regular.ttf': regularFontData,
      'Roboto-Bold.ttf': boldFontData || regularFontData,
      'Roboto-Medium.ttf': mediumFontData || regularFontData,
      'Roboto-Italic.ttf': italicFontData || regularFontData
    };

    (pdfMake as any).vfs = vfs;
    (pdfMake as any).fonts = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Bold.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-Bold.ttf',
        medium: 'Roboto-Medium.ttf'
      }
    };
    
    // Set default font to Roboto
    (pdfMake as any).defaultStyle = {
      font: 'Roboto'
    };
    
    return true;
  }
  
  console.error("Critical: Regular font could not be loaded for pdfmake");
  return false;
}
