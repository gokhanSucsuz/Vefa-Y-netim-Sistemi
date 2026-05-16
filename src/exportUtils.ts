import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { tr } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import { APP_LOGO_URL } from '../constants/logo';
import { setupPdfMakeFonts } from '../lib/pdfFonts';
import { DailyAssignment, SystemUser } from '../types';

export const formatSafe = (dateStr: string, formatStr: string, options?: any) => {
  if (!dateStr) return '-';
  try {
    const d = parseISO(dateStr);
    if (isNaN(d.getTime())) return '-';
    return format(d, formatStr, options);
  } catch {
    return '-';
  }
};

export const exportToExcel = (assignments: DailyAssignment[], selectedMonth: Date) => {
  const data = assignments.flatMap(a => a.items.map((item, idx) => {
    const teamKey = item.staffMembers.map(s => s.id).sort().join(',');
    const teamTasks = a.items.filter(it => it.staffMembers.map(s => s.id).sort().join(',') === teamKey);
    const teamTasksIndex = a.items.slice(0, idx).filter(it => it.staffMembers.map(s => s.id).sort().join(',') === teamKey).length;
    let timingLabel = '-';
    if (teamTasks.length === 2) {
      timingLabel = teamTasksIndex === 0 ? 'Sabah' : 'Öğleden Sonra';
    }

    return {
      'Tarih': formatSafe(a.date, 'dd MMMM yyyy', { locale: tr }),
      'Zaman': timingLabel,
      'Mahalle': item.applicant.neighborhood,
      'Hane': `${item.applicant.name} ${item.applicant.surname}`,
      'TC No': item.applicant.tcNo,
      'Hane Kişi Sayısı': item.applicant.householdSize || 1,
      'Görevli Personeller': item.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ') || 'Atanmamış'
    };
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vefa Programı");
  XLSX.writeFile(wb, `SYDV_Vefa_Programi_${format(selectedMonth, 'MMMM_yyyy', { locale: tr })}.xlsx`);
};

export const exportToPDF = async (assignments: DailyAssignment[], selectedMonth: Date, currentUser: SystemUser | null) => {
  const pdfMake = await setupPdfMakeFonts();
  if (!pdfMake) {
    console.error("Fonts could not be loaded for pdfmake");
    return;
  }
  
  let logoBase64 = '';
  try {
    const getBase64ImageFromURL = (url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.setAttribute('crossOrigin', 'anonymous');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL('image/png');
          resolve(dataURL);
        };
        img.onerror = (error) => reject(error);
        img.src = url;
      });
    };
    logoBase64 = await getBase64ImageFromURL(`https://images.weserv.nl/?url=${encodeURIComponent(APP_LOGO_URL)}`);
  } catch (e) {
    console.error("Logo could not be added to PDF", e);
  }

  const tableData = assignments.flatMap(a => a.items.map((item, idx) => {
    const teamKey = item.staffMembers.map(s => s.id).sort().join(',');
    const teamTasks = a.items.filter(it => it.staffMembers.map(s => s.id).sort().join(',') === teamKey);
    const teamTasksIndex = a.items.slice(0, idx).filter(it => it.staffMembers.map(s => s.id).sort().join(',') === teamKey).length;
    let timingLabel = '-';
    if (teamTasks.length === 2) {
      timingLabel = teamTasksIndex === 0 ? 'Sabah' : 'Öğl. Sonra';
    }

    return [
      formatSafe(a.date, 'dd.MM.yyyy'),
      timingLabel,
      item.applicant.neighborhood || '-',
      `${item.applicant.name} ${item.applicant.surname}`,
      item.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ') || '-'
    ];
  }));

  const docDefinition: any = {
    content: [
      logoBase64 ? {
        image: logoBase64,
        width: 50,
        alignment: 'center',
        margin: [0, 0, 0, 10]
      } : null,
      { text: 'T.C.', style: 'header', alignment: 'center' },
      { text: 'EDİRNE VALİLİĞİ', style: 'header', alignment: 'center' },
      { text: 'Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı', style: 'subheader', alignment: 'center' },
      { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1 }] },
      { 
        text: `VEFA PROGRAMI ÇİZELGESİ (${format(startOfMonth(selectedMonth), 'dd.MM.yyyy')} - ${format(endOfMonth(selectedMonth), 'dd.MM.yyyy')})`, 
        style: 'title', 
        alignment: 'center', 
        margin: [0, 15, 0, 15] 
      },
      { text: `Rapor Tarihi: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, alignment: 'right', fontSize: 8, color: '#666', margin: [0, 0, 0, 10] },
      {
        table: {
          headerRows: 1,
          widths: [60, 50, 80, '*', '*'],
          body: [
            [
              { text: 'Tarih', style: 'tableHeader' },
              { text: 'Zaman', style: 'tableHeader' },
              { text: 'Mahalle', style: 'tableHeader' },
              { text: 'Hane', style: 'tableHeader' },
              { text: 'Görevli Personeller', style: 'tableHeader' }
            ],
            ...tableData
          ]
        },
        layout: 'lightHorizontalLines'
      }
    ],
    watermark: { 
      text: 'Edirne Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı', 
      color: '#666', 
      opacity: 0.05, 
      bold: true, 
      fontSize: 25
    },
    footer: (currentPage: number, pageCount: number) => {
      return {
        text: `Bu belge elektronik ortamda ${currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel'} tarafından ${format(new Date(), 'dd.MM.yyyy')} tarihinde oluşturulmuştur. Sayfa ${currentPage} / ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: '#666',
        margin: [0, 10, 0, 0]
      };
    },
    styles: {
      header: { fontSize: 14, bold: true, margin: [0, 2, 0, 2] },
      subheader: { fontSize: 11, bold: true, margin: [0, 2, 0, 2] },
      title: { fontSize: 12, bold: true },
      tableHeader: { bold: true, fontSize: 10, fillColor: '#f8fafc', alignment: 'left' }
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 9
    },
    pageMargins: [40, 40, 40, 60]
  };

  pdfMake.createPdf(docDefinition).download(`SYDV_Vefa_Programi_${format(selectedMonth, 'MMMM_yyyy', { locale: tr })}.pdf`);
};
