import { useState, useMemo, ReactNode, useRef } from 'react';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { dbLocal } from '../db';
import { Program, Schedule, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { tr } from 'date-fns/locale';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Legend 
} from 'recharts';
import { 
  TrendingUp, Users, MapPin, Calendar, FileText, FileSpreadsheet, 
  Download, Filter, UserCheck, Building2, ChevronRight 
} from 'lucide-react';
import * as XLSX from 'xlsx';
import pdfMake from 'pdfmake/build/pdfmake';
import { APP_LOGO_URL } from '../constants/logo';
import { setupPdfMakeFonts } from '../lib/pdfFonts';

const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];

export default function Statistics({ currentUser }: { currentUser: SystemUser }) {
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const reportRef = useRef<HTMLDivElement>(null);

  const setQuickFilter = (type: 'month' | 'year') => {
    const now = new Date();
    if (type === 'month') {
      setStartDate(format(startOfMonth(now), 'yyyy-MM-dd'));
      setEndDate(format(endOfMonth(now), 'yyyy-MM-dd'));
    } else {
      setStartDate(format(new Date(now.getFullYear(), 0, 1), 'yyyy-MM-dd'));
      setEndDate(format(new Date(now.getFullYear(), 11, 31), 'yyyy-MM-dd'));
    }
  };

  const applicants = useLiveQuery(() => dbLocal.applicants.toArray()) || [];
  const staff = useLiveQuery(() => dbLocal.staff.toArray()) || [];
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];

  const stats = useMemo(() => {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    const completedAssignments = schedules.flatMap(s => {
      const scheduleDate = parseISO(s.date);
      if (!isWithinInterval(scheduleDate, { start, end })) return [];
      
      return s.assignments
        .filter(a => a.isCompleted)
        .map(a => ({
          ...a,
          date: s.date,
          applicant: applicants.find(app => app.id === a.applicantId),
          staffMembers: (a.staffIds || []).map(id => staff.find(st => st.id === id)).filter(Boolean)
        }));
    });

    // Neighborhood Stats
    const neighborhoodMap = new Map<string, Set<string>>();
    const neighborhoodCleaningCount = new Map<string, number>();
    
    // Staff Stats
    const staffMap = new Map<string, { 
      name: string; 
      jobCount: number; 
      applicants: Set<string>;
      details: { date: string; applicantName: string }[]
    }>();

    completedAssignments.forEach(a => {
      if (a.applicant) {
        const neighborhood = a.applicant.neighborhood || 'Belirtilmemiş';
        
        // Unique applicants per neighborhood
        if (!neighborhoodMap.has(neighborhood)) neighborhoodMap.set(neighborhood, new Set());
        neighborhoodMap.get(neighborhood)!.add(a.applicant.id!);

        // Total cleanings per neighborhood
        neighborhoodCleaningCount.set(neighborhood, (neighborhoodCleaningCount.get(neighborhood) || 0) + 1);
      }

      a.staffMembers.forEach(s => {
        if (!staffMap.has(s.id!)) {
          staffMap.set(s.id!, { 
            name: `${s.name} ${s.surname}`, 
            jobCount: 0, 
            applicants: new Set(),
            details: []
          });
        }
        const sData = staffMap.get(s.id!)!;
        sData.jobCount++;
        if (a.applicant) {
          sData.applicants.add(`${a.applicant.name} ${a.applicant.surname}`);
          sData.details.push({ 
            date: a.date, 
            applicantName: `${a.applicant.name} ${a.applicant.surname}` 
          });
        }
      });
    });

    const neighborhoodData = Array.from(neighborhoodCleaningCount.entries()).map(([name, count]) => ({
      name,
      count,
      uniqueApplicants: neighborhoodMap.get(name)?.size || 0
    })).sort((a, b) => b.count - a.count);

    const staffData = Array.from(staffMap.entries()).map(([id, data]) => ({
      id,
      ...data,
      uniqueApplicantsCount: data.applicants.size
    })).sort((a, b) => b.jobCount - a.jobCount);

    return {
      totalCleanings: completedAssignments.length,
      totalNeighborhoods: neighborhoodMap.size,
      totalUniqueApplicants: new Set(completedAssignments.map(a => a.applicantId)).size,
      neighborhoodData,
      staffData,
      completedAssignments
    };
  }, [startDate, endDate, applicants, staff, schedules]);

  const exportToExcel = () => {
    const workbook = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      ['İstatistik Özeti', ''],
      ['Başlangıç Tarihi', startDate],
      ['Bitiş Tarihi', endDate],
      ['Toplam Temizlik Sayısı', stats.totalCleanings],
      ['Gidilen Mahalle Sayısı', stats.totalNeighborhoods],
      ['Hizmet Verilen Hane Sayısı', stats.totalUniqueApplicants]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, wsSummary, "Özet");

    // Neighborhood Sheet
    const neighborhoodData = stats.neighborhoodData.map(n => ({
      'Mahalle': n.name,
      'Temizlik Sayısı': n.count,
      'Hane Sayısı': n.uniqueApplicants
    }));
    const wsNeighborhood = XLSX.utils.json_to_sheet(neighborhoodData);
    XLSX.utils.book_append_sheet(workbook, wsNeighborhood, "Mahalle İstatistikleri");

    // Staff Sheet
    const staffData = stats.staffData.map(s => ({
      'Personel': s.name,
      'Toplam İş Sayısı': s.jobCount,
      'Farklı Hane Sayısı': s.uniqueApplicantsCount
    }));
    const wsStaff = XLSX.utils.json_to_sheet(staffData);
    XLSX.utils.book_append_sheet(workbook, wsStaff, "Personel İstatistikleri");

    // Detailed Log Sheet
    const logData = stats.completedAssignments.map(a => ({
      'Tarih': format(parseISO(a.date), 'dd.MM.yyyy'),
      'Hane': `${a.applicant?.name} ${a.applicant?.surname}`,
      'Mahalle': a.applicant?.neighborhood,
      'Personeller': a.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ')
    }));
    const wsLog = XLSX.utils.json_to_sheet(logData);
    XLSX.utils.book_append_sheet(workbook, wsLog, "Detaylı Kayıtlar");

    XLSX.writeFile(workbook, `Vefa_Istatistikleri_${startDate}_${endDate}.xlsx`);
    logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Excel İstatistik İndirme', `${startDate} - ${endDate} dönemi için Excel raporu alındı.`);
  };

  const exportToPDF = async () => {
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
        { text: `VEFA PROJESİ İSTATİSTİK RAPORU (${startDate} - ${endDate})`, style: 'title', alignment: 'center', margin: [0, 15, 0, 15] },
        { text: `Rapor Tarihi: ${format(new Date(), 'dd.MM.yyyy HH:mm')}`, alignment: 'right', fontSize: 8, color: '#666', margin: [0, 0, 0, 10] },
        
        { text: '1. Özet Bilgiler', style: 'sectionHeader' },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: 'İstatistik Özeti', style: 'tableHeader' }, { text: 'Değer', style: 'tableHeader' }],
              ['Toplam Temizlik Sayısı', stats.totalCleanings.toString()],
              ['Gidilen Mahalle Sayısı', stats.totalNeighborhoods.toString()],
              ['Hizmet Verilen Hane Sayısı', stats.totalUniqueApplicants.toString()]
            ]
          }
        },

        { text: '2. Mahalle Dağılımı', style: 'sectionHeader' },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*'],
            body: [
              [
                { text: 'Mahalle', style: 'tableHeader' },
                { text: 'Temizlik Sayısı', style: 'tableHeader' },
                { text: 'Hane Sayısı', style: 'tableHeader' }
              ],
              ...stats.neighborhoodData.map(n => [n.name, n.count.toString(), n.uniqueApplicants.toString()])
            ]
          }
        },

        { text: '3. Personel Performansı', style: 'sectionHeader' },
        {
          table: {
            headerRows: 1,
            widths: ['*', '*', '*'],
            body: [
              [
                { text: 'Personel', style: 'tableHeader' },
                { text: 'Toplam İş', style: 'tableHeader' },
                { text: 'Hane Sayısı', style: 'tableHeader' }
              ],
              ...stats.staffData.map(s => [s.name, s.jobCount.toString(), s.uniqueApplicantsCount.toString()])
            ]
          }
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
        sectionHeader: { fontSize: 11, bold: true, margin: [0, 15, 0, 5] },
        tableHeader: { bold: true, fontSize: 10, fillColor: '#f1f5f9', alignment: 'left' }
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 10
      },
      pageMargins: [40, 40, 40, 60]
    };

    pdfMake.createPdf(docDefinition).download(`Vefa_Istatistik_Raporu_${startDate}_${endDate}.pdf`);
    logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'PDF İstatistik İndirme', `${startDate} - ${endDate} dönemi için PDF raporu alındı.`);
  };

  return (
    <div className="space-y-6 pb-12">
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
            <h4 style={{ fontSize: '13pt', fontWeight: 'bold', marginTop: '20px' }}>GENEL İSTATİSTİK VE FAALİYET RAPORU</h4>
          </div>

          <p style={{ textAlign: 'center', marginBottom: '30px', color: '#475569' }}><strong>Rapor Dönemi:</strong> {startDate} - {endDate}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', marginBottom: '30px' }}>
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', textAlign: 'center', borderRadius: '6px' }}>
              <div style={{ fontSize: '9pt', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Toplam Temizlik</div>
              <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>{stats.totalCleanings}</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', textAlign: 'center', borderRadius: '6px' }}>
              <div style={{ fontSize: '9pt', color: '#475569', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '2px' }}>Mahalle Sayısı</div>
              <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>{stats.totalNeighborhoods}</div>
            </div>
            <div style={{ padding: '12px', backgroundColor: '#f8fafc', border: '1px solid #cbd5e1', textAlign: 'center', borderRadius: '6px' }}>
              <div className="text-[9pt] color-[#475569] font-bold uppercase mb-[2px]">Hane Sayısı</div>
              <div style={{ fontSize: '14pt', fontWeight: 'bold' }}>{stats.totalUniqueApplicants}</div>
            </div>
          </div>

          <h2 style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '12px', borderBottom: '1px solid #000', paddingBottom: '5px' }}>Personel Performans Çizelgesi</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '10pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ padding: '10px', textAlign: 'left', border: '1px solid #94a3b8' }}>Personel Adı Soyadı</th>
                <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #94a3b8' }}>Toplam İş</th>
                <th style={{ padding: '10px', textAlign: 'center', border: '1px solid #94a3b8' }}>Farklı Hane</th>
              </tr>
            </thead>
            <tbody>
              {stats.staffData.map((s, idx) => (
                <tr key={s.id}>
                  <td style={{ padding: '8px', border: '1px solid #e2e8f0' }}>{s.name}</td>
                  <td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{s.jobCount}</td>
                  <td style={{ padding: '8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>{s.uniqueApplicantsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '12px', borderBottom: '1px solid #000', paddingBottom: '5px' }}>Detaylı Faaliyet Kayıtları</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', fontSize: '9pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#f1f5f9' }}>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #94a3b8' }}>Tarih</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #94a3b8' }}>Hane</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #94a3b8' }}>Mahalle</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #94a3b8' }}>Görevli Personeller</th>
              </tr>
            </thead>
            <tbody>
              {stats.completedAssignments.map((a, idx) => (
                <tr key={idx}>
                  <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{format(parseISO(a.date), 'dd.MM.yyyy')}</td>
                  <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{a.applicant?.name} {a.applicant?.surname}</td>
                  <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{a.applicant?.neighborhood || '-'}</td>
                  <td style={{ padding: '6px', border: '1px solid #e2e8f0' }}>{a.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ marginTop: '50px', display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ textAlign: 'center', width: '200px' }}>
              <p style={{ fontWeight: 'bold', marginBottom: '5px' }}>Vakıf Müdürü</p>
              <p style={{ fontSize: '10pt', marginBottom: '40px' }}>{currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel'}</p>
              <p>(İmza)</p>
            </div>
          </div>

          <div style={{ position: 'absolute', bottom: '15mm', left: '20mm', right: '20mm', textAlign: 'center', fontSize: '8pt', color: '#94a3b8', borderTop: '0.5px solid #cbd5e1', paddingTop: '10px' }}>
            Bu rapor {currentUser ? `${currentUser.name} ${currentUser.surname}` : 'Yetkili Personel'} tarafından {format(new Date(), 'dd.MM.yyyy')} tarihinde raporlanmıştır.
          </div>
        </div>
      </div>

      {/* Header & Date Filter */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900">İstatistik ve Raporlar</h2>
          <p className="text-xs lg:text-sm text-gray-500 font-medium">Sistem verilerinin görsel analizi ve performans takibi.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm w-full sm:w-auto">
          <div className="flex gap-1 border-b sm:border-b-0 sm:border-r border-gray-100 pb-2 sm:pb-0 sm:pr-2">
            <button 
              onClick={() => setQuickFilter('month')}
              className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Bu Ay
            </button>
            <button 
              onClick={() => setQuickFilter('year')}
              className="flex-1 sm:flex-none px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              Bu Yıl
            </button>
          </div>
          <div className="flex items-center justify-between sm:justify-start gap-2 px-3 py-1 sm:py-0">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400 shrink-0" />
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-[11px] sm:text-sm font-bold text-gray-700 outline-none border-none bg-transparent w-24 sm:w-auto"
              />
            </div>
            <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-[11px] sm:text-sm font-bold text-gray-700 outline-none border-none bg-transparent w-24 sm:w-auto"
            />
          </div>
          <div className="hidden sm:block h-6 w-px bg-gray-100 mx-1" />
          <div className="flex gap-1 border-t sm:border-t-0 border-gray-100 pt-2 sm:pt-0">
            <button onClick={exportToExcel} className="flex-1 sm:flex-none flex items-center justify-center gap-2 p-2 text-green-600 hover:bg-green-50 rounded-xl transition-colors" title="Excel İndir">
              <FileSpreadsheet className="w-5 h-5" />
              <span className="sm:hidden text-[10px] font-bold">EXCEL</span>
            </button>
            <button onClick={exportToPDF} className="flex-1 sm:flex-none flex items-center justify-center gap-2 p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="PDF İndir">
              <FileText className="w-5 h-5" />
              <span className="sm:hidden text-[10px] font-bold">PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={<TrendingUp className="w-6 h-6 text-blue-600" />}
          label="Toplam Temizlik"
          value={stats.totalCleanings}
          color="blue"
        />
        <StatCard 
          icon={<MapPin className="w-6 h-6 text-orange-600" />}
          label="Gidilen Mahalle"
          value={stats.totalNeighborhoods}
          color="orange"
        />
        <StatCard 
          icon={<Users className="w-6 h-6 text-green-600" />}
          label="Hizmet Alan Hane"
          value={stats.totalUniqueApplicants}
          color="green"
        />
        <StatCard 
          icon={<UserCheck className="w-6 h-6 text-purple-600" />}
          label="Aktif Personel"
          value={stats.staffData.length}
          color="purple"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Neighborhood Chart */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              Mahalle Bazlı Dağılım
            </h3>
          </div>
          <div className="h-[300px] w-full">
            {stats.neighborhoodData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.neighborhoodData.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="name" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fontSize: 10, fill: '#64748b' }}
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} />
                  <Tooltip 
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    cursor={{ fill: '#f8fafc' }}
                  />
                  <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} barSize={32} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                Veri bulunamadı
              </div>
            )}
          </div>
        </div>

        {/* Staff Performance Chart */}
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-gray-900 flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-purple-600" />
              Personel İş Yükü
            </h3>
          </div>
          <div className="h-[300px] w-full">
            {stats.staffData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.staffData.slice(0, 5)}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="jobCount"
                  >
                    {stats.staffData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend verticalAlign="bottom" height={36}/>
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-gray-400 text-sm">
                Veri bulunamadı
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Detailed Staff Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50 bg-gray-50/30">
          <h3 className="font-bold text-gray-900">Personel Detaylı İstatistikleri</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-50 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                <th className="px-6 py-4">Personel</th>
                <th className="px-6 py-4">Toplam İş</th>
                <th className="px-6 py-4">Farklı Hane</th>
                <th className="px-6 py-4">Son İşler</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {stats.staffData.map(s => (
                <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900">{s.name}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">
                      {s.jobCount} İş
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{s.uniqueApplicantsCount} Hane</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {s.details.slice(-2).map((d, i) => (
                        <span key={i} className="text-[9px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                          {d.applicantName} ({format(parseISO(d.date), 'dd.MM')})
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: ReactNode, label: string, value: number | string, color: string }) {
  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-50',
    orange: 'bg-orange-50',
    green: 'bg-green-50',
    purple: 'bg-purple-50'
  };

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4 hover:scale-[1.02] transition-transform">
      <div className={`p-3 rounded-2xl ${colorClasses[color]}`}>
        {icon}
      </div>
      <div>
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</div>
        <div className="text-2xl font-black text-gray-900">{value}</div>
      </div>
    </div>
  );
}
