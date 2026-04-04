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
        <div ref={reportRef} className="bg-white p-10 text-gray-900">
          <h1 className="text-3xl font-bold text-center mb-10 border-b-2 border-blue-600 pb-4">Müracaatçı Hizmet Raporu</h1>
          
          <div className="grid grid-cols-2 gap-8 mb-10">
            <div className="space-y-2">
              <p><strong>Ad Soyad:</strong> {applicant.name} {applicant.surname}</p>
              <p><strong>TC Kimlik No:</strong> {applicant.tcNo}</p>
              <p><strong>Mahalle:</strong> {applicant.neighborhood || '-'}</p>
            </div>
            <div className="space-y-2">
              <p><strong>Rapor Tarihi:</strong> {format(new Date(), 'd MMMM yyyy HH:mm', { locale: tr })}</p>
              <p><strong>Telefon:</strong> {applicant.phone}</p>
            </div>
          </div>

          <div className="mb-10">
            <p className="mb-4"><strong>Adres:</strong> {applicant.address}</p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-10">
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-100 text-center">
              <div className="text-xs text-blue-600 font-bold uppercase mb-1">Toplam Ziyaret</div>
              <div className="text-2xl font-bold text-blue-900">{totalVisits}</div>
            </div>
            <div className="p-4 bg-green-50 rounded-xl border border-green-100 text-center">
              <div className="text-xs text-green-600 font-bold uppercase mb-1">Tamamlanan</div>
              <div className="text-2xl font-bold text-green-900">{completedVisits}</div>
            </div>
            <div className="p-4 bg-purple-50 rounded-xl border border-purple-100 text-center">
              <div className="text-xs text-purple-600 font-bold uppercase mb-1">Başarı Oranı</div>
              <div className="text-2xl font-bold text-purple-900">
                {totalVisits > 0 ? `%${Math.round((completedVisits / totalVisits) * 100)}` : '%0'}
              </div>
            </div>
          </div>

          <h2 className="text-xl font-bold mb-4 border-l-4 border-blue-600 pl-3">Ziyaret Geçmişi</h2>
          <table className="w-full border-collapse mb-10">
            <thead>
              <tr className="bg-blue-600 text-white">
                <th className="p-3 text-left border border-blue-700">No</th>
                <th className="p-3 text-left border border-blue-700">Ziyaret Tarihi</th>
                <th className="p-3 text-left border border-blue-700">Durum</th>
              </tr>
            </thead>
            <tbody>
              {schedules.map((s, idx) => {
                const assignment = s.assignments.find(a => a.applicantId === applicant.id);
                return (
                  <tr key={s.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="p-3 border border-gray-200">{schedules.length - idx}</td>
                    <td className="p-3 border border-gray-200">{format(parseISO(s.date), 'd MMMM yyyy, EEEE', { locale: tr })}</td>
                    <td className="p-3 border border-gray-200 font-medium">
                      {assignment?.isCompleted ? (
                        <span className="text-green-600">Tamamlandı</span>
                      ) : (
                        <span className="text-amber-600">Beklemede</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {schedules.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-10 text-center text-gray-500 italic">Henüz bir ziyaret kaydı bulunmuyor.</td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="mt-20 pt-10 border-t border-gray-200 text-center text-sm text-gray-400 italic">
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
