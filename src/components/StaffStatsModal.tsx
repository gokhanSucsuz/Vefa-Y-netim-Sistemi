import React, { useState, useEffect, useRef } from 'react';
import { Staff, Schedule, SystemUser } from '../types';
import { dbLocal } from '../db';
import { X, Calendar, CheckCircle2, Clock, BarChart3, TrendingUp, Download, User } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { motion } from 'motion/react';
import { APP_LOGO_URL } from '../constants/logo';
import { setupPdfMakeFonts } from '../lib/pdfFonts';
import { formatPhone, formatTC } from '../lib/format';

interface Props {
  staff: Staff;
  currentUser: SystemUser;
  onClose: () => void;
}

export default function StaffStatsModal({ staff, currentUser, onClose }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchData = async () => {
      const [schedulesData, applicantsData, staffData] = await Promise.all([
        dbLocal.schedules.toArray(),
        dbLocal.applicants.toArray(),
        dbLocal.staff.toArray()
      ]);

      // Filter schedules where this staff was assigned
      const staffSchedules = schedulesData.filter(s => 
        s.assignments.some(a => a.staffIds.includes(staff.id!))
      );
      
      setSchedules(staffSchedules.sort((a, b) => b.date.localeCompare(a.date)));
      setApplicants(applicantsData);
      setAllStaff(staffData);
      setLoading(false);
    };
    fetchData();
  }, [staff.id]);

  const totalAssignments = schedules.length;
  const completedAssignments = schedules.filter(s => 
    s.assignments.find(a => a.staffIds.includes(staff.id!))?.isCompleted
  ).length;
  
  const lastWork = schedules[0];
  const firstWork = schedules[schedules.length - 1];

  const daysSinceLastWork = lastWork 
    ? differenceInDays(new Date(), parseISO(lastWork.date))
    : null;

  const generatePDF = async () => {
    const fontsLoaded = await setupPdfMakeFonts();
    if (!fontsLoaded) {
      console.error("Fonts could not be loaded for pdfmake");
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

    const completedAssignmentsList = schedules.flatMap(s => 
      s.assignments.filter(a => a.staffIds.includes(staff.id!) && a.isCompleted)
      .map(a => ({ ...a, date: s.date }))
    ).sort((a, b) => b.date.localeCompare(a.date));

    const totalCompleted = completedAssignmentsList.length;
    const performanceRate = totalAssignments > 0 ? Math.round((totalCompleted / totalAssignments) * 100) : 0;

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
        { text: 'PERSONEL HİZMET PERFORMANS RAPORU', style: 'title', alignment: 'center', margin: [0, 15, 0, 15] },
        { text: `Rapor Tarihi: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, alignment: 'right', fontSize: 8, color: '#666', margin: [0, 0, 0, 10] },
        
        { text: '1. Personel Bilgileri', style: 'sectionHeader' },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: 'Personel Bilgileri', style: 'tableHeader' }, { text: 'Detay', style: 'tableHeader' }],
              ['Ad Soyad', `${staff.name} ${staff.surname}`],
              ['TC No', formatTC(staff.tcNo)],
              ['Telefon', formatPhone(staff.phone)],
              ['Toplam Görev', totalAssignments.toString()],
              ['Tamamlanan Görev', totalCompleted.toString()],
              ['Performans Oranı', `%${performanceRate}`]
            ]
          }
        },

        { text: '2. Tamamlanan Görev Geçmişi', style: 'sectionHeader' },
        ...(() => {
          // Group completed assignments by date
          const grouped: Record<string, typeof completedAssignmentsList> = {};
          completedAssignmentsList.forEach(a => {
            if (!grouped[a.date]) grouped[a.date] = [];
            grouped[a.date].push(a);
          });

          const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
          
          if (sortedDates.length === 0) {
            return [{ text: 'Tamamlanmış görev bulunmamaktadır.', fontStyle: 'italic', margin: [0, 10, 0, 0] }];
          }

          return sortedDates.map(date => {
            const dayAssignments = grouped[date];
            return [
              { text: format(parseISO(date), 'dd MMMM yyyy, EEEE', { locale: tr }), style: 'dateHeader', margin: [0, 10, 0, 5] },
              {
                table: {
                  headerRows: 1,
                  widths: ['auto', '*', '*', '*'],
                  body: [
                    [
                      { text: 'Saat', style: 'tableHeader' },
                      { text: 'Hane / Adres', style: 'tableHeader' },
                      { text: 'Mahalle / Hane No', style: 'tableHeader' },
                      { text: 'Takım Arkadaşı', style: 'tableHeader' }
                    ],
                    ...dayAssignments.map(a => {
                      const applicant = applicants.find(ap => ap.id === a.applicantId);
                      const teammateIds = a.staffIds.filter(id => id !== staff.id);
                      const teammateNames = teammateIds.map(id => {
                        const s = allStaff.find(st => st.id === id);
                        return s ? `${s.name} ${s.surname}` : 'Bilinmiyor';
                      }).join(', ');

                      const approval = a.approvals?.find(apr => apr.staffId === staff.id);
                      const timeStr = approval?.startTime ? `${approval.startTime} - ${approval.endTime || '...'}` : '-';

                      return [
                        timeStr,
                        {
                          stack: [
                            { text: applicant ? `${applicant.name} ${applicant.surname}` : 'Bilinmiyor', bold: true },
                            { text: applicant?.address || '-', fontSize: 8, color: '#666' }
                          ]
                        },
                        {
                          stack: [
                            { text: applicant?.neighborhood || '-' },
                            { text: applicant?.haneNo ? `Hane No: ${applicant.haneNo}` : '-', fontSize: 8, color: '#666' }
                          ]
                        },
                        teammateNames || '-'
                      ];
                    })
                  ]
                }
              }
            ];
          }).flat();
        })()
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
        title: { fontSize: 12, bold: true },
        sectionHeader: { fontSize: 11, bold: true, margin: [0, 15, 0, 5], color: '#1e40af' },
        tableHeader: { bold: true, fontSize: 9, fillColor: '#f1f5f9', alignment: 'left' },
        dateHeader: { bold: true, fontSize: 10, color: '#334155', margin: [0, 10, 0, 2] }
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10
      },
      pageMargins: [40, 40, 40, 60]
    };

    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfMake = pdfMakeModule.default || pdfMakeModule;

    pdfMake.createPdf(docDefinition).download(`Personel_Raporu_${staff.name}_${staff.surname}.pdf`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      {/* Hidden Report for PDF Generation */}
      <div className="absolute opacity-0 pointer-events-none" style={{ width: '210mm', padding: '25mm', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11pt', lineHeight: '1.5' }}>
        <div ref={reportRef} style={{ backgroundColor: '#ffffff', padding: '20px', color: '#000000' }}>
          <div style={{ textAlign: 'center', marginBottom: '30px' }}>
            <img 
              src={APP_LOGO_URL} 
              alt="Logo" 
              crossOrigin="anonymous"
              style={{ width: '80px', height: '80px', margin: '0 auto 15px', display: 'block', objectFit: 'contain' }} 
              referrerPolicy="no-referrer"
            />
            <h1 style={{ fontSize: '16pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '5px' }}>T.C.</h1>
            <h2 style={{ fontSize: '14pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '5px' }}>EDİRNE VALİLİĞİ</h2>
            <h3 style={{ fontSize: '12pt', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '20px', borderBottom: '1px solid #000', paddingBottom: '10px' }}>Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı</h3>
            <h4 style={{ fontSize: '13pt', fontWeight: 'bold', marginTop: '20px' }}>PERSONEL HİZMET VE PERFORMANS RAPORU</h4>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginBottom: '30px', border: '1px solid #e5e7eb', padding: '15px', borderRadius: '8px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
              <p><strong>Personel Adı Soyadı:</strong> {staff.name} {staff.surname}</p>
              <p><strong>T.C. Kimlik No:</strong> {formatTC(staff.tcNo)}</p>
              <p><strong>Unvanı:</strong> Vefa Personeli</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'right' }}>
              <p><strong>Rapor Tarihi:</strong> {format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
              <p><strong>İletişim:</strong> {formatPhone(staff.phone)}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '15px', marginBottom: '30px' }}>
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', textAlign: 'center', borderRadius: '6px' }}>
              <div style={{ fontSize: '9pt', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Toplam Görev</div>
              <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>{totalAssignments}</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', textAlign: 'center', borderRadius: '6px' }}>
              <div style={{ fontSize: '9pt', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Tamamlanan</div>
              <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>{completedAssignments}</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', textAlign: 'center', borderRadius: '6px' }}>
              <div style={{ fontSize: '9pt', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Performans</div>
              <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>
                {totalAssignments > 0 ? `%${Math.round((completedAssignments / totalAssignments) * 100)}` : '%0'}
              </div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', textAlign: 'center', borderRadius: '6px' }}>
              <div style={{ fontSize: '10pt', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Çalışılan Gün Sayısı</div>
              <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>{new Set(schedules.map(s => s.date)).size}</div>
            </div>
          </div>

          <h2 style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '12px', borderBottom: '1px solid #000', paddingBottom: '5px' }}>Tamamlanan Görev Geçmişi</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '10pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #94a3b8' }}>Tarih / Saat</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #94a3b8' }}>Hane / Adres</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #94a3b8' }}>Takım Arkadaşı</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const completedList = schedules.flatMap(s => 
                  s.assignments.filter(a => a.staffIds.includes(staff.id!) && a.isCompleted)
                  .map(a => ({ ...a, date: s.date }))
                ).sort((a, b) => b.date.localeCompare(a.date));

                if (completedList.length === 0) {
                  return (
                    <tr>
                      <td colSpan={3} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>Tamamlanmış görev bulunmamaktadır.</td>
                    </tr>
                  );
                }

                return completedList.map((a, idx) => {
                  const applicant = applicants.find(ap => ap.id === a.applicantId);
                  const teammateIds = a.staffIds.filter(id => id !== staff.id);
                  const teammateNames = teammateIds.map(id => {
                    const s = allStaff.find(st => st.id === id);
                    return s ? `${s.name} ${s.surname}` : 'Bilinmiyor';
                  }).join(', ');
                  const approval = a.approvals?.find(apr => apr.staffId === staff.id);
                  const timeStr = approval?.startTime ? `${approval.startTime} - ${approval.endTime || '...'}` : '';

                  return (
                    <tr key={idx}>
                      <td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>
                        <div>{format(parseISO(a.date), 'dd.MM.yyyy')}</div>
                        <div style={{ fontSize: '8pt', color: '#64748b' }}>{timeStr}</div>
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ fontWeight: '500' }}>{applicant ? `${applicant.name} ${applicant.surname}` : 'Bilinmiyor'}</div>
                        <div style={{ fontSize: '8pt', color: '#64748b' }}>{applicant?.address || '-'}</div>
                      </td>
                      <td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>{teammateNames || '-'}</td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>

          <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center', width: '200px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '40px' }}>Vakıf Müdürü</p>
              <p>{currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel'}</p>
              <p>(İmza)</p>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: '15mm', left: '20mm', right: '20mm', textAlign: 'center', fontSize: '8pt', color: '#94a3b8', borderTop: '0.5px solid #cbd5e1', paddingTop: '10px' }}>
            Bu belge elektronik ortamda {currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel'} tarafından {format(new Date(), 'dd.MM.yyyy')} tarihinde oluşturulmuştur.
          </div>
        </div>
      </div>

      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="p-4 sm:p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-blue-50/50">
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-gray-900">{staff.name} {staff.surname}</h3>
            <p className="text-xs sm:text-sm text-gray-500">Personel Performans ve Raporu</p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button 
              onClick={generatePDF}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 text-xs sm:text-sm font-semibold"
            >
              <Download className="w-4 h-4" />
              PDF Rapor
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm shrink-0">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-blue-800">Toplam Görev</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-900">{totalAssignments}</div>
                </div>

                <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-100 rounded-lg text-green-600">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-green-800">Tamamlanan</span>
                  </div>
                  <div className="text-2xl font-bold text-green-900">{completedAssignments}</div>
                </div>

                <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                      <Clock className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-purple-800">Son Görev</span>
                  </div>
                  <div className="text-lg font-bold text-purple-900">
                    {lastWork ? format(parseISO(lastWork.date), 'd MMMM yyyy', { locale: tr }) : 'Yok'}
                  </div>
                  {daysSinceLastWork !== null && (
                    <div className="text-xs text-purple-600 mt-1">{daysSinceLastWork} gün önce</div>
                  )}
                </div>
              </div>

              {/* Detailed Info */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  Tamamlanan Görev Geçmişi
                </h4>
                
                <div className="space-y-4">
                  {(() => {
                    const completedList = schedules.flatMap(s => 
                      s.assignments.filter(a => a.staffIds.includes(staff.id!) && a.isCompleted)
                      .map(a => ({ ...a, date: s.date }))
                    ).sort((a, b) => b.date.localeCompare(a.date));

                    if (completedList.length === 0) {
                      return (
                        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                          Henüz tamamlanmış bir görev kaydı bulunmuyor.
                        </div>
                      );
                    }

                    // Group by date for UI display
                    const grouped: Record<string, typeof completedList> = {};
                    completedList.forEach(a => {
                      if (!grouped[a.date]) grouped[a.date] = [];
                      grouped[a.date].push(a);
                    });

                    return Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(date => (
                      <div key={date} className="space-y-3">
                        <div className="text-sm font-bold text-gray-600 px-2 flex items-center gap-2">
                          <Calendar className="w-4 h-4" />
                          {format(parseISO(date), 'd MMMM yyyy, EEEE', { locale: tr })}
                        </div>
                        <div className="space-y-2">
                          {grouped[date].map((a, idx) => {
                            const applicant = applicants.find(ap => ap.id === a.applicantId);
                            const teammateIds = a.staffIds.filter(id => id !== staff.id);
                            const teammateNames = teammateIds.map(id => {
                              const s = allStaff.find(st => st.id === id);
                              return s ? `${s.name} ${s.surname}` : 'Bilinmiyor';
                            }).join(', ');
                            const approval = a.approvals?.find(apr => apr.staffId === staff.id);
                            const timeStr = approval?.startTime ? `${approval.startTime} - ${approval.endTime || '...'}` : '';

                            return (
                              <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-4">
                                  <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm text-blue-600 text-xs font-bold shrink-0">
                                    {timeStr || <Clock className="w-4 h-4 opacity-30" />}
                                  </div>
                                  <div>
                                    <div className="font-medium text-gray-900">
                                      {applicant ? `${applicant.name} ${applicant.surname}` : 'Bilinmiyor'}
                                    </div>
                                    <div className="text-xs text-gray-500">
                                      {applicant?.address} / {applicant?.neighborhood}
                                    </div>
                                    {teammateNames && (
                                      <div className="text-[10px] text-blue-600 font-medium mt-1">
                                        Takım Arkadaşı: {teammateNames}
                                      </div>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2 self-end sm:self-center">
                                  <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">TAMAMLANDI</span>
                                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* İzin Geçmişi */}
              <div className="space-y-4 pt-4 border-t border-gray-100">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-orange-500" />
                  İzin Geçmişi
                </h4>
                
                <div className="space-y-3">
                  {!staff.leaves || staff.leaves.length === 0 ? (
                    <div className="text-center py-6 text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      Kayıtlı izin bulunmuyor.
                    </div>
                  ) : (
                    staff.leaves.map((leave, idx) => (
                      <div key={idx} className="flex flex-col justify-center p-4 bg-orange-50/50 rounded-xl border border-orange-100">
                        <div className="font-medium text-gray-900">
                          {format(parseISO(leave.startDate), 'd MMMM yyyy', { locale: tr })} - {format(parseISO(leave.endDate), 'd MMMM yyyy', { locale: tr })}
                        </div>
                        {leave.reason && (
                          <div className="text-xs text-gray-600 mt-1">
                            Sebep: {leave.reason}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Additional Stats */}
              <div className="bg-gray-900 text-white p-6 rounded-3xl">
                <div className="grid grid-cols-2 gap-8">
                  <div>
                    <div className="text-gray-400 text-sm mb-1">İlk Kayıtlı Görev</div>
                    <div className="font-medium">
                      {firstWork ? format(parseISO(firstWork.date), 'd MMMM yyyy', { locale: tr }) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Performans Oranı</div>
                    <div className="font-medium">
                      {totalAssignments > 0 ? `%${Math.round((completedAssignments / totalAssignments) * 100)}` : '%0'}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
        
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 bg-white border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-all shadow-sm"
          >
            Kapat
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
