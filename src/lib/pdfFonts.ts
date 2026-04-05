import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';

const ROBOTO_FONTS = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Bold.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-Bold.ttf',
    medium: 'Roboto-Medium.ttf'
  }
};

export async function setupPdfMakeFonts() {
  try {
    // Try different ways to get the vfs object from the imported module
    const vfs = (pdfFonts as any).default?.vfs || 
                (pdfFonts as any).vfs || 
                (pdfFonts as any).pdfMake?.vfs || 
                (window as any).pdfMake?.vfs;
    
    if (vfs && vfs['Roboto-Regular.ttf']) {
      (pdfMake as any).vfs = vfs;
      (pdfMake as any).fonts = ROBOTO_FONTS;
      
      // Ensure fallbacks
      const regularData = vfs['Roboto-Regular.ttf'];
      if (!vfs['Roboto-Bold.ttf']) vfs['Roboto-Bold.ttf'] = regularData;
      if (!vfs['Roboto-Medium.ttf']) vfs['Roboto-Medium.ttf'] = regularData;
      if (!vfs['Roboto-Italic.ttf']) vfs['Roboto-Italic.ttf'] = regularData;
      
      (pdfMake as any).defaultStyle = { font: 'Roboto' };
      return true;
    }
  } catch (e) {
    // Silent fail
  }

  return await setupPdfMakeFontsExternal();
}

async function fetchFontWithFallback(urls: string[]): Promise<string | null> {
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength < 5000) continue;
      
      const bytes = new Uint8Array(buffer);
      let binary = '';
      const chunk = 8192;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.slice(i, i + chunk)));
      }
      return window.btoa(binary);
    } catch (e) {
      continue;
    }
  }
  return null;
}

async function setupPdfMakeFontsExternal() {
  // Use more reliable jsDelivr links for the official pdfmake fonts
  const ROBOTO_REGULAR_SOURCES = [
    'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/fonts/Roboto/Roboto-Regular.ttf',
    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf'
  ];

  const ROBOTO_BOLD_SOURCES = [
    'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/fonts/Roboto/Roboto-Bold.ttf',
    'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Bold.ttf'
  ];

  const [reg, bld] = await Promise.all([
    fetchFontWithFallback(ROBOTO_REGULAR_SOURCES),
    fetchFontWithFallback(ROBOTO_BOLD_SOURCES)
  ]);

  if (reg) {
    const vfs: Record<string, string> = {
      'Roboto-Regular.ttf': reg,
      'Roboto-Bold.ttf': bld || reg,
      'Roboto-Medium.ttf': bld || reg,
      'Roboto-Italic.ttf': reg
    };

    (pdfMake as any).vfs = vfs;
    (pdfMake as any).fonts = ROBOTO_FONTS;
    (pdfMake as any).defaultStyle = { font: 'Roboto' };
    return true;
  }

  return false;
}
