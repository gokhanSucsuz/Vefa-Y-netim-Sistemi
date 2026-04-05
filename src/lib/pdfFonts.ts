import pdfMake from 'pdfmake/build/pdfmake';

// Reliable Google Fonts GitHub sources via jsDelivr (TTF format, supports Turkish characters)
const ROBOTO_REGULAR_SOURCES = [
  'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/roboto/static/Roboto-Regular.ttf',
  'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Regular.ttf'
];

const ROBOTO_BOLD_SOURCES = [
  'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/roboto/static/Roboto-Bold.ttf',
  'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Bold.ttf'
];

const ROBOTO_MEDIUM_SOURCES = [
  'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/roboto/static/Roboto-Medium.ttf',
  'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Medium.ttf'
];

const ROBOTO_ITALIC_SOURCES = [
  'https://cdn.jsdelivr.net/gh/google/fonts@main/apache/roboto/static/Roboto-Italic.ttf',
  'https://raw.githubusercontent.com/google/fonts/main/apache/roboto/static/Roboto-Italic.ttf'
];

let regularFontData: string | null = null;
let boldFontData: string | null = null;
let mediumFontData: string | null = null;
let italicFontData: string | null = null;

async function fetchFontWithFallback(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 10000) continue;
      
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

  regularFontData = reg;
  boldFontData = bld;
  mediumFontData = med;
  italicFontData = itl;

  if (regularFontData && boldFontData) {
    const vfs: Record<string, string> = {
      'Roboto-Regular.ttf': regularFontData,
      'Roboto-Bold.ttf': boldFontData
    };

    if (mediumFontData) vfs['Roboto-Medium.ttf'] = mediumFontData;
    if (italicFontData) vfs['Roboto-Italic.ttf'] = italicFontData;

    (pdfMake as any).vfs = vfs;
    (pdfMake as any).fonts = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Bold.ttf',
        italics: italicFontData ? 'Roboto-Italic.ttf' : 'Roboto-Regular.ttf',
        bolditalics: 'Roboto-Bold.ttf',
        medium: mediumFontData ? 'Roboto-Medium.ttf' : 'Roboto-Regular.ttf'
      }
    };
    
    // Set default font to Roboto
    (pdfMake as any).defaultStyle = {
      font: 'Roboto'
    };
    
    return true;
  }
  
  console.error("Fonts could not be loaded for pdfmake");
  return false;
}
