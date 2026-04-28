// Standard fonts configuration
const ROBOTO_FONTS = {
  Roboto: {
    normal: 'Roboto-Regular.ttf',
    bold: 'Roboto-Medium.ttf',
    italics: 'Roboto-Italic.ttf',
    bolditalics: 'Roboto-MediumItalic.ttf'
  }
};

export async function setupPdfMakeFonts() {
  try {
      // Dynamically import pdfmake and vfs_fonts
      const [pdfMakeModule, pdfFontsModule] = await Promise.all([
        import('pdfmake/build/pdfmake').catch(err => { throw err; }),
        import('pdfmake/build/vfs_fonts').catch(err => { throw err; })
      ]);

    const pdfMake = pdfMakeModule.default || pdfMakeModule;
    const pdfFonts = pdfFontsModule.default || pdfFontsModule;

    // Try to get VFS from the imported module depending on module resolution
    const vfs = 
      (pdfFonts as any).pdfMake?.vfs || 
      (pdfFonts as any).vfs || 
      (pdfFonts as any).default ||
      pdfFonts || 
      (window as any).pdfMake?.vfs;
    
    // Quick check if the vfs object contains our standard font
    if (vfs && vfs['Roboto-Regular.ttf']) {
      (pdfMake as any).vfs = vfs;
      (pdfMake as any).fonts = ROBOTO_FONTS;
      return true;
    }
  } catch (e) {
    console.error("Error setting up internal pdfmake fonts:", e);
    if (e instanceof TypeError && e.message.includes('Failed to fetch dynamically imported module')) {
      alert("Sistem güncellendi. Rapor alabilmek için sayfanın yenilenmesi gerekiyor.");
      window.location.reload();
    }
  }

  return false;
}

