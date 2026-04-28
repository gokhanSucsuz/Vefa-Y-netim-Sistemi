// Standard fonts configuration
const ROBOTO_FONTS = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf'
  }
};

let configuredPdfMake: any = null;

export async function setupPdfMakeFonts() {
  if (configuredPdfMake) return configuredPdfMake;

  try {
      // Dynamically import pdfmake and vfs_fonts
      const [pdfMakeModule, pdfFontsModule] = await Promise.all([
        import('pdfmake/build/pdfmake').catch(err => { throw err; }),
        import('pdfmake/build/vfs_fonts').catch(err => { throw err; })
      ]);

    const pdfMake = pdfMakeModule.default || pdfMakeModule;
    const pdfFonts = pdfFontsModule.default || pdfFontsModule;

    let vfs = null;
    if (pdfFontsModule && (pdfFontsModule as any).pdfMake?.vfs) vfs = (pdfFontsModule as any).pdfMake.vfs;
    else if (pdfFontsModule && (pdfFontsModule as any).vfs) vfs = (pdfFontsModule as any).vfs;
    else if (pdfFontsModule && (pdfFontsModule as any).default?.pdfMake?.vfs) vfs = (pdfFontsModule as any).default.pdfMake.vfs;
    else if (pdfFontsModule && (pdfFontsModule as any).default?.vfs) vfs = (pdfFontsModule as any).default.vfs;
    else if (pdfFontsModule && (pdfFontsModule as any).default && (pdfFontsModule as any).default['Roboto-Medium.ttf']) vfs = (pdfFontsModule as any).default;
    else if (pdfFontsModule && (pdfFontsModule as any)['Roboto-Medium.ttf']) vfs = pdfFontsModule;
    else if (window && (window as any).pdfMake?.vfs) vfs = (window as any).pdfMake.vfs;

    // Quick check if the vfs object contains our standard font
    if (vfs && vfs['Roboto-Medium.ttf']) {
      (pdfMake as any).vfs = vfs;
      (pdfMake as any).fonts = ROBOTO_FONTS;
      configuredPdfMake = pdfMake;
      return pdfMake;
    }
  } catch (e) {
    console.error("Error setting up internal pdfmake fonts:", e);
    if (e instanceof TypeError && e.message.includes('Failed to fetch dynamically imported module')) {
      alert("Sistem güncellendi. Rapor alabilmek için sayfanın yenilenmesi gerekiyor.");
      window.location.reload();
      return null;
    }
  }

  return null;
}

