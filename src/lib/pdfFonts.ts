import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';

// Standard fonts configuration
const ROBOTO_FONTS = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Bold.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-Bold.ttf'
  }
};

export async function setupPdfMakeFonts() {
  try {
    // Try to get VFS from the imported module
    const vfs = (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs || (window as any).pdfMake?.vfs;
    
    if (vfs) {
      (pdfMake as any).vfs = vfs;
      (pdfMake as any).fonts = ROBOTO_FONTS;
      return true;
    }
  } catch (e) {
    // Silent fail
  }

  // Fallback to external sources if VFS is not available
  return await setupPdfMakeFontsExternal();
}

async function fetchFont(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  } catch (e) {
    return null;
  }
}

async function setupPdfMakeFontsExternal() {
  // Use reliable CDN links
  const REGULAR_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/fonts/Roboto/Roboto-Regular.ttf';
  const BOLD_URL = 'https://cdn.jsdelivr.net/npm/pdfmake@0.2.7/build/fonts/Roboto/Roboto-Bold.ttf';

  try {
    const [reg, bld] = await Promise.all([
      fetchFont(REGULAR_URL),
      fetchFont(BOLD_URL)
    ]);

    if (reg) {
      const vfs: Record<string, string> = {
        'Roboto-Regular.ttf': reg,
        'Roboto-Bold.ttf': bld || reg,
        'Roboto-Italic.ttf': reg
      };

      (pdfMake as any).vfs = vfs;
      (pdfMake as any).fonts = ROBOTO_FONTS;
      return true;
    }
  } catch (e) {
    // Silent fail
  }

  return false;
}
