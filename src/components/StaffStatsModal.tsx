import React, { useState, useEffect, useRef } from 'react';
import { Staff, Schedule } from '../types';
import { dbLocal } from '../db';
import { X, Calendar, CheckCircle2, Clock, BarChart3, TrendingUp, Download, User } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { motion } from 'motion/react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { APP_LOGO_URL } from '../constants/logo';
import { loadTurkishFonts } from '../lib/pdfFonts';

interface Props {
  staff: Staff;
  onClose: () => void;
}

export default function StaffStatsModal({ staff, onClose }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchStats = async () => {
      const allSchedules = await dbLocal.schedules.toArray();
      // Filter schedules where this staff was assigned
      const staffSchedules = allSchedules.filter(s => 
        s.assignments.some(a => a.staffIds.includes(staff.id!))
      );
      setSchedules(staffSchedules.sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    };
    fetchStats();
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
    const pdf = new jsPDF('p', 'mm', 'a4');
    await loadTurkishFonts(pdf);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    
    // Header
    try {
      const img = new Image();
      img.src = `https://images.weserv.nl/?url=${encodeURIComponent(APP_LOGO_URL)}`;
      img.crossOrigin = "anonymous";
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      pdf.addImage(img, 'JPEG', (pdfWidth - 25) / 2, 10, 25, 25);
    } catch (e) {
      console.error("Logo could not be added to PDF", e);
    }

    pdf.setFontSize(14);
    pdf.setFont("Roboto", "bold");
    pdf.text("T.C.", pdfWidth / 2, 45, { align: "center" });
    pdf.text("EDİRNE VALİLİĞİ", pdfWidth / 2, 52, { align: "center" });
    pdf.setFontSize(11);
    pdf.text("Sosyal Yardımlaşma ve Dayanışma Vakfı Başkanlığı", pdfWidth / 2, 59, { align: "center" });
    
    pdf.setLineWidth(0.5);
    pdf.line(20, 62, pdfWidth - 20, 62);
    
    pdf.setFontSize(12);
    pdf.text("PERSONEL HİZMET PERFORMANS RAPORU", pdfWidth / 2, 72, { align: "center" });

    // 1. Personel Bilgileri
    autoTable(pdf, {
      startY: 80,
      head: [['Personel Bilgileri', 'Detay']],
      body: [
        ['Ad Soyad', `${staff.name} ${staff.surname}`],
        ['TC No', staff.tcNo],
        ['Telefon', staff.phone],
        ['Toplam Görev', schedules.length]
      ],
      theme: 'grid',
      headStyles: { fillColor: [241, 245, 249], textColor: [0, 0, 0], font: 'Roboto' },
      styles: { font: 'Roboto' },
      margin: { left: 20, right: 20 }
    });

    // 2. Görev Geçmişi
    const tableY = (pdf as any).lastAutoTable.finalY + 15;
    pdf.setFontSize(11);
    pdf.setFont("Roboto", "bold");
    pdf.text("GÖREV GEÇMİŞİ LİSTESİ", 20, tableY - 5);
    autoTable(pdf, {
      startY: tableY,
      head: [['Tarih', 'Müracaatçı', 'Mahalle']],
      body: schedules.map(s => {
        const assignment = s.assignments.find(a => a.staffIds.includes(staff.id!));
        return [
          format(parseISO(s.date), 'dd.MM.yyyy'),
          assignment ? `${assignment.applicantName}` : '-',
          assignment ? `${assignment.neighborhood}` : '-'
        ];
      }),
      theme: 'striped',
      headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255], font: 'Roboto' },
      styles: { font: 'Roboto' },
      margin: { left: 20, right: 20, bottom: 25 },
      didDrawPage: (data) => {
        // Footer
        const str = "Bu rapor sistem tarafından otomatik olarak oluşturulmuştur.";
        pdf.setFontSize(8);
        pdf.setTextColor(150);
        pdf.setFont("Roboto", "normal");
        pdf.text(str, pdfWidth / 2, pdf.internal.pageSize.getHeight() - 10, { align: "center" });
      }
    });

    pdf.save(`Personel_Raporu_${staff.name}_${staff.surname}.pdf`);
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
              <p><strong>T.C. Kimlik No:</strong> {staff.tcNo}</p>
              <p><strong>Unvanı:</strong> Vefa Personeli</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', textAlign: 'right' }}>
              <p><strong>Rapor Tarihi:</strong> {format(new Date(), 'dd.MM.yyyy HH:mm')}</p>
              <p><strong>İletişim:</strong> {staff.phone}</p>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '30px' }}>
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
          </div>

          <h2 style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '12px', borderBottom: '1px solid #000', paddingBottom: '5px' }}>Görev Kayıt Çizelgesi</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '10pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #94a3b8' }}>Sıra No</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #94a3b8' }}>Görev Tarihi</th>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #94a3b8' }}>Durum Bilgisi</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, idx) => {
                const assignment = s.assignments.find(a => a.staffIds.includes(staff.id!));
                return (
                  <tr key={s.id}>
                    <td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>{schedules.length - idx}</td>
                    <td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>{format(parseISO(s.date), 'dd MMMM yyyy, EEEE', { locale: tr })}</td>
                    <td style={{ padding: '8px', border: '1px solid #e2e8f0', fontWeight: '500' }}>
                      {assignment?.isCompleted ? 'Tamamlandı' : 'Beklemede'}
                    </td>
                  </tr>
                );
              })}
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '30px', textAlign: 'center', color: '#64748b', fontStyle: 'italic' }}>Kayıtlı görev bulunmamaktadır.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center', width: '200px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '40px' }}>Vakıf Müdürü</p>
              <p>(İmza)</p>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: '15mm', left: '20mm', right: '20mm', textAlign: 'center', fontSize: '8pt', color: '#94a3b8', borderTop: '0.5px solid #cbd5e1', paddingTop: '10px' }}>
            Bu belge elektronik ortamda oluşturulmuş olup resmi evrak niteliği taşımaktadır.
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
                  Görev Geçmişi
                </h4>
                
                <div className="space-y-3">
                  {schedules.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      Henüz bir görev kaydı bulunmuyor.
                    </div>
                  ) : (
                    schedules.map((s, idx) => {
                      const assignment = s.assignments.find(a => a.staffIds.includes(staff.id!));
                      return (
                        <div key={s.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shadow-sm text-blue-600 font-bold">
                              {schedules.length - idx}
                            </div>
                            <div>
                              <div className="font-medium text-gray-900">
                                {format(parseISO(s.date), 'd MMMM yyyy, EEEE', { locale: tr })}
                              </div>
                              <div className="text-xs text-gray-500">
                                {assignment?.isCompleted ? 'Görev Tamamlandı' : 'Planlandı / Beklemede'}
                              </div>
                            </div>
                          </div>
                          {assignment?.isCompleted && (
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                          )}
                        </div>
                      );
                    })
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
