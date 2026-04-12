import pdfMake from 'pdfmake/build/pdfmake';
import { Applicant, Staff, SystemUser } from '../types';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { APP_LOGO_URL } from '../constants/logo';
import { setupPdfMakeFonts } from './pdfFonts';

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

export const generateCleaningReport = async (applicant: Applicant, staffMembers: Staff[], date: string, currentUser: SystemUser | null) => {
  const fontsLoaded = await setupPdfMakeFonts();
  if (!fontsLoaded) {
    console.error("Fonts could not be loaded for pdfmake");
  }

  const formattedDate = format(parseISO(date), 'd MMMM yyyy', { locale: tr });
  let logoBase64 = '';
  
  try {
    logoBase64 = await getBase64ImageFromURL(`https://images.weserv.nl/?url=${encodeURIComponent(APP_LOGO_URL)}`);
  } catch (e) {
    console.error("Logo could not be loaded", e);
  }

  const docDefinition: any = {
    content: [
      logoBase64 ? {
        image: logoBase64,
        width: 60,
        alignment: 'center',
        margin: [0, 0, 0, 10]
      } : null,
      { text: 'T.C.', style: 'header', alignment: 'center' },
      { text: 'EDİRNE VALİLİĞİ', style: 'header', alignment: 'center' },
      { text: 'Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı', style: 'subheader', alignment: 'center' },
      { canvas: [{ type: 'line', x1: 0, y1: 5, x2: 515, y2: 5, lineWidth: 1 }] },
      { text: 'VEFA PROJESİ HİZMET SUNUM FORMU', style: 'title', alignment: 'center', margin: [0, 15, 0, 15] },
      { text: `Tarih: ${formattedDate}`, alignment: 'right', margin: [0, 0, 0, 10] },
      { text: `Rapor Oluşturma Tarihi: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, alignment: 'right', fontSize: 8, color: '#666', margin: [0, 0, 0, 10] },
      
      { text: '1. HANE BİLGİLERİ', style: 'sectionHeader' },
      {
        table: {
          widths: ['*'],
          body: [
            [{
              stack: [
                {
                  columns: [
                    { text: `Adı Soyadı: ${applicant.name} ${applicant.surname}`, width: '50%' },
                    { text: `T.C. Kimlik No: ${applicant.tcNo}`, width: '50%' }
                  ]
                },
                {
                  columns: [
                    { text: `İletişim Tel: ${applicant.phone}`, width: '50%' },
                    { text: `Mahalle/Köy: ${applicant.neighborhood || '-'}`, width: '50%' }
                  ],
                  margin: [0, 5, 0, 0]
                },
                { text: `Adres: ${applicant.address}`, margin: [0, 5, 0, 0] }
              ],
              padding: [10, 10, 10, 10]
            }]
          ]
        },
        margin: [0, 5, 0, 15]
      },

      { text: '2. GÖREVLİ PERSONEL BİLGİLERİ', style: 'sectionHeader' },
      {
        table: {
          headerRows: 1,
          widths: [40, '*', '*'],
          body: [
            [
              { text: 'Sıra', style: 'tableHeader' },
              { text: 'Adı Soyadı', style: 'tableHeader' },
              { text: 'Unvanı / Görevi', style: 'tableHeader' }
            ],
            ...staffMembers.map((s, idx) => [
              { text: (idx + 1).toString(), alignment: 'center' },
              `${s.name} ${s.surname}`,
              'Vefa Personeli'
            ])
          ]
        },
        margin: [0, 5, 0, 15]
      },

      { text: '3. SUNULAN HİZMETİN İÇERİĞİ', style: 'sectionHeader' },
      {
        table: {
          widths: ['*'],
          body: [
            [{
              text: "Yukarıda bilgileri yer alan hanenin ikametgahında; Vefa Projesi uygulama usul ve esasları çerçevesinde genel ev temizliği, hijyen desteği ve temel ihtiyaçların karşılanmasına yönelik hizmetler eksiksiz olarak sunulmuştur.",
              margin: [5, 5, 5, 5],
              alignment: 'justify'
            }]
          ]
        },
        margin: [0, 5, 0, 40]
      },

      {
        columns: [
          {
            stack: [
              { text: 'Hizmet Alan (Hane)', bold: true, alignment: 'center' },
              { text: 'Ad Soyad / İmza', alignment: 'center', margin: [0, 10, 0, 0] }
            ]
          },
          {
            stack: [
              { text: 'Hizmet Sunan (Görevli)', bold: true, alignment: 'center' },
              { text: 'Ad Soyad / İmza', alignment: 'center', margin: [0, 10, 0, 0] }
            ]
          },
          {
            stack: [
              { text: 'Onaylayan (Yetkili)', bold: true, alignment: 'center' },
              { text: currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel', alignment: 'center', margin: [0, 10, 0, 0] },
              { text: '(İmza)', alignment: 'center', fontSize: 8 }
            ]
          }
        ]
      }
    ],
    footer: (currentPage: number, pageCount: number) => {
      return {
        text: `Bu rapor ${currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel'} tarafından ${format(new Date(), 'dd.MM.yyyy')} tarihinde raporlanmıştır. Sayfa ${currentPage} / ${pageCount}`,
        alignment: 'center',
        fontSize: 8,
        color: '#666',
        margin: [0, 10, 0, 0]
      };
    },
    styles: {
      header: { fontSize: 14, bold: true, margin: [0, 2, 0, 2] },
      subheader: { fontSize: 11, bold: true, margin: [0, 2, 0, 2] },
      title: { fontSize: 13, bold: true },
      sectionHeader: { fontSize: 11, bold: true, margin: [0, 10, 0, 5] },
      tableHeader: { bold: true, fontSize: 10, fillColor: '#f2f2f2', alignment: 'center' }
    },
    defaultStyle: {
      font: 'Roboto',
      fontSize: 10
    },
    pageMargins: [40, 40, 40, 60]
  };

  pdfMake.createPdf(docDefinition).download(`Temizlik_Raporu_${applicant.name}_${applicant.surname}_${date}.pdf`);
};
