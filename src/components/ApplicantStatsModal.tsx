import React, { useState, useEffect, useRef } from 'react';
import { Applicant, Schedule } from '../types';
import { dbLocal } from '../db';
import { X, Calendar, CheckCircle2, Clock, BarChart3, TrendingUp, Download, FileText } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { tr } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface Props {
  applicant: Applicant;
  onClose: () => void;
}

export default function ApplicantStatsModal({ applicant, onClose }: Props) {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const reportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchStats = async () => {
      const allSchedules = await dbLocal.schedules.toArray();
      // Filter schedules where this applicant was assigned
      const applicantSchedules = allSchedules.filter(s => 
        s.assignments.some(a => a.applicantId === applicant.id)
      );
      setSchedules(applicantSchedules.sort((a, b) => b.date.localeCompare(a.date)));
      setLoading(false);
    };
    fetchStats();
  }, [applicant.id]);

  const totalVisits = schedules.length;
  const completedVisits = schedules.filter(s => 
    s.assignments.find(a => a.applicantId === applicant.id)?.isCompleted
  ).length;
  
  const lastVisit = schedules[0];
  const firstVisit = schedules[schedules.length - 1];

  const daysSinceLastVisit = lastVisit 
    ? differenceInDays(new Date(), parseISO(lastVisit.date))
    : null;

  const generatePDF = async () => {
    if (!reportRef.current) return;
    
    const canvas = await html2canvas(reportRef.current, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgProps = pdf.getImageProperties(imgData);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`Rapor_${applicant.name}_${applicant.surname}.pdf`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      {/* Hidden Report for PDF Generation */}
      <div className="absolute opacity-0 pointer-events-none" style={{ width: '210mm', padding: '20mm', fontFamily: 'Verdana, sans-serif', fontSize: '12pt' }}>
        <div ref={reportRef} style={{ backgroundColor: '#ffffff', padding: '40px', color: '#111827' }}>
          <h1 style={{ fontSize: '24pt', fontWeight: 'bold', textAlign: 'center', marginBottom: '40px', borderBottom: '2px solid #2563eb', paddingBottom: '20px' }}>Müracaatçı Hizmet Raporu</h1>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginBottom: '40px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p><strong>Ad Soyad:</strong> {applicant.name} {applicant.surname}</p>
              <p><strong>TC Kimlik No:</strong> {applicant.tcNo}</p>
              <p><strong>Mahalle:</strong> {applicant.neighborhood || '-'}</p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <p><strong>Rapor Tarihi:</strong> {format(new Date(), 'd MMMM yyyy HH:mm', { locale: tr })}</p>
              <p><strong>Telefon:</strong> {applicant.phone}</p>
            </div>
          </div>

          <div style={{ marginBottom: '40px' }}>
            <p><strong>Adres:</strong> {applicant.address}</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '40px' }}>
            <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '12px', border: '1px solid #dbeafe', textAlign: 'center' }}>
              <div style={{ fontSize: '10pt', color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>Toplam Ziyaret</div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#1e3a8a' }}>{totalVisits}</div>
            </div>
            <div style={{ padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7', textAlign: 'center' }}>
              <div style={{ fontSize: '10pt', color: '#16a34a', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>Tamamlanan</div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#14532d' }}>{completedVisits}</div>
            </div>
            <div style={{ padding: '16px', backgroundColor: '#faf5ff', borderRadius: '12px', border: '1px solid #f3e8ff', textAlign: 'center' }}>
              <div style={{ fontSize: '10pt', color: '#9333ea', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>Başarı Oranı</div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#581c87' }}>
                {totalVisits > 0 ? `%${Math.round((completedVisits / totalVisits) * 100)}` : '%0'}
              </div>
            </div>
          </div>

          <h2 style={{ fontSize: '16pt', fontWeight: 'bold', marginBottom: '16px', borderLeft: '4px solid #2563eb', paddingLeft: '12px' }}>Ziyaret Geçmişi</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
            <thead>
              <tr style={{ backgroundColor: '#2563eb', color: '#ffffff' }}>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #1d4ed8' }}>No</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #1d4ed8' }}>Ziyaret Tarihi</th>
                <th style={{ padding: '12px', textAlign: 'left', border: '1px solid #1d4ed8' }}>Durum</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, idx) => {
                const assignment = s.assignments.find(a => a.applicantId === applicant.id);
                return (
                  <tr key={s.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                    <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>{schedules.length - idx}</td>
                    <td style={{ padding: '12px', border: '1px solid #e5e7eb' }}>{format(parseISO(s.date), 'd MMMM yyyy, EEEE', { locale: tr })}</td>
                    <td style={{ padding: '12px', border: '1px solid #e5e7eb', fontWeight: '500' }}>
                      {assignment?.isCompleted ? (
                        <span style={{ color: '#16a34a' }}>Tamamlandı</span>
                      ) : (
                        <span style={{ color: '#d97706' }}>Beklemede</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '40px', textAlign: 'center', color: '#6b7280', fontStyle: 'italic' }}>Henüz bir ziyaret kaydı bulunmuyor.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div style={{ marginTop: '80px', paddingTop: '40px', borderTop: '1px solid #e5e7eb', textAlign: 'center', fontSize: '10pt', color: '#9ca3af', fontStyle: 'italic' }}>
            Bu rapor Edirne Merkez SYDV Vefa Programı Yönetim Sistemi tarafından otomatik olarak oluşturulmuştur.
          </div>
        </div>
      </div>

      <motion.div 
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-blue-50/50">
          <div>
            <h3 className="text-xl font-bold text-gray-900">{applicant.name} {applicant.surname}</h3>
            <p className="text-sm text-gray-500">Müracaatçı İstatistik ve Raporu</p>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={generatePDF}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100 text-sm font-semibold"
              title="PDF Olarak İndir"
            >
              <Download className="w-4 h-4" />
              PDF Rapor
            </button>
            <button onClick={onClose} className="p-2 hover:bg-white rounded-full transition-colors shadow-sm">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-2xl border border-blue-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                      <BarChart3 className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-blue-800">Toplam Ziyaret</span>
                  </div>
                  <div className="text-2xl font-bold text-blue-900">{totalVisits}</div>
                </div>

                <div className="bg-green-50 p-4 rounded-2xl border border-green-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-green-100 rounded-lg text-green-600">
                      <CheckCircle2 className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-green-800">Tamamlanan</span>
                  </div>
                  <div className="text-2xl font-bold text-green-900">{completedVisits}</div>
                </div>

                <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 bg-purple-100 rounded-lg text-purple-600">
                      <Clock className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium text-purple-800">Son Ziyaret</span>
                  </div>
                  <div className="text-lg font-bold text-purple-900">
                    {lastVisit ? format(parseISO(lastVisit.date), 'd MMMM yyyy', { locale: tr }) : 'Yok'}
                  </div>
                  {daysSinceLastVisit !== null && (
                    <div className="text-xs text-purple-600 mt-1">{daysSinceLastVisit} gün önce</div>
                  )}
                </div>
              </div>

              {/* Detailed Info */}
              <div className="space-y-4">
                <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-blue-600" />
                  Ziyaret Geçmişi
                </h4>
                
                <div className="space-y-3">
                  {schedules.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-2xl border border-dashed border-gray-200">
                      Henüz bir ziyaret kaydı bulunmuyor.
                    </div>
                  ) : (
                    schedules.map((s, idx) => {
                      const assignment = s.assignments.find(a => a.applicantId === applicant.id);
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
                                {assignment?.isCompleted ? 'Hizmet Tamamlandı' : 'Planlandı / Beklemede'}
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
                    <div className="text-gray-400 text-sm mb-1">İlk Kayıtlı Ziyaret</div>
                    <div className="font-medium">
                      {firstVisit ? format(parseISO(firstVisit.date), 'd MMMM yyyy', { locale: tr }) : '-'}
                    </div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-sm mb-1">Ziyaret Başarı Oranı</div>
                    <div className="font-medium">
                      {totalVisits > 0 ? `%${Math.round((completedVisits / totalVisits) * 100)}` : '%0'}
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
