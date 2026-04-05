import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';

// Standard Roboto fonts provided by pdfmake
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
    // pdfmake/build/vfs_fonts usually exports an object with pdfMake.vfs
    // or it might be a global side-effect.
    const vfs = (pdfFonts as any).pdfMake?.vfs || (pdfFonts as any).vfs || (window as any).pdfMake?.vfs;
    
    if (vfs) {
      (pdfMake as any).vfs = vfs;
      (pdfMake as any).fonts = ROBOTO_FONTS;
      
      // Ensure all required keys exist in VFS, fallback to Regular if missing
      const regularData = vfs['Roboto-Regular.ttf'];
      if (regularData) {
        if (!vfs['Roboto-Bold.ttf']) vfs['Roboto-Bold.ttf'] = regularData;
        if (!vfs['Roboto-Medium.ttf']) vfs['Roboto-Medium.ttf'] = regularData;
        if (!vfs['Roboto-Italic.ttf']) vfs['Roboto-Italic.ttf'] = regularData;
        
        (pdfMake as any).defaultStyle = {
          font: 'Roboto'
        };
        return true;
      }
    }
  } catch (e) {
    console.error("Failed to load local vfs_fonts", e);
  }

  // Fallback to extremely reliable Google Fonts CDN if local fails
  console.log("Falling back to external font sources...");
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
      console.warn(`Failed to fetch font from ${url}`, e);
      continue;
    }
  }
  return null;
}

async function setupPdfMakeFontsExternal() {
  const ROBOTO_REGULAR_SOURCES = [
    'https://fonts.gstatic.com/s/roboto/v30/K7OmYqlYI1G2ig466ze1_v7S.ttf',
    'https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/v2/Roboto-Regular.ttf'
  ];

  const ROBOTO_BOLD_SOURCES = [
    'https://fonts.gstatic.com/s/roboto/v30/K7OTYqlYI1G2ig466ze1_v7S.ttf',
    'https://cdn.jsdelivr.net/gh/googlefonts/roboto@main/src/v2/Roboto-Bold.ttf'
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
