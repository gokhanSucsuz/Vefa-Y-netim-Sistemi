import { useState, useMemo, ReactNode, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbLocal } from '../db';
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
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const COLORS = ['#2563eb', '#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'];

export default function Statistics() {
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
    const neighborhoodMap = new Map<string, Set<number>>();
    const neighborhoodCleaningCount = new Map<string, number>();
    
    // Staff Stats
    const staffMap = new Map<number, { 
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
      ['Hizmet Verilen Müracaatçı Sayısı', stats.totalUniqueApplicants]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(workbook, wsSummary, "Özet");

    // Neighborhood Sheet
    const neighborhoodData = stats.neighborhoodData.map(n => ({
      'Mahalle': n.name,
      'Temizlik Sayısı': n.count,
      'Müracaatçı Sayısı': n.uniqueApplicants
    }));
    const wsNeighborhood = XLSX.utils.json_to_sheet(neighborhoodData);
    XLSX.utils.book_append_sheet(workbook, wsNeighborhood, "Mahalle İstatistikleri");

    // Staff Sheet
    const staffData = stats.staffData.map(s => ({
      'Personel': s.name,
      'Toplam İş Sayısı': s.jobCount,
      'Farklı Müracaatçı Sayısı': s.uniqueApplicantsCount
    }));
    const wsStaff = XLSX.utils.json_to_sheet(staffData);
    XLSX.utils.book_append_sheet(workbook, wsStaff, "Personel İstatistikleri");

    // Detailed Log Sheet
    const logData = stats.completedAssignments.map(a => ({
      'Tarih': format(parseISO(a.date), 'dd.MM.yyyy'),
      'Müracaatçı': `${a.applicant?.name} ${a.applicant?.surname}`,
      'Mahalle': a.applicant?.neighborhood,
      'Personeller': a.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ')
    }));
    const wsLog = XLSX.utils.json_to_sheet(logData);
    XLSX.utils.book_append_sheet(workbook, wsLog, "Detaylı Kayıtlar");

    XLSX.writeFile(workbook, `Vefa_Istatistikleri_${startDate}_${endDate}.xlsx`);
  };

  const exportToPDF = async () => {
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
    pdf.save(`Vefa_Istatistik_Raporu_${startDate}_${endDate}.pdf`);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Hidden Report for PDF Generation */}
      <div className="absolute opacity-0 pointer-events-none" style={{ width: '210mm', fontFamily: 'Verdana, sans-serif', fontSize: '12pt' }}>
        <div ref={reportRef} style={{ backgroundColor: '#ffffff', padding: '40px', color: '#111827' }}>
          <h1 style={{ fontSize: '24pt', fontWeight: 'bold', textAlign: 'center', marginBottom: '24px', borderBottom: '2px solid #2563eb', paddingBottom: '16px' }}>Edirne Merkez SYDV Vefa İstatistik Raporu</h1>
          <p style={{ textAlign: 'center', marginBottom: '32px', color: '#4b5563' }}>Dönem: {startDate} - {endDate}</p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px', marginBottom: '40px' }}>
            <div style={{ padding: '16px', backgroundColor: '#eff6ff', borderRadius: '12px', border: '1px solid #dbeafe', textAlign: 'center' }}>
              <div style={{ fontSize: '10pt', color: '#2563eb', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>Toplam Temizlik</div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#1e3a8a' }}>{stats.totalCleanings}</div>
            </div>
            <div style={{ padding: '16px', backgroundColor: '#fff7ed', borderRadius: '12px', border: '1px solid #ffedd5', textAlign: 'center' }}>
              <div style={{ fontSize: '10pt', color: '#ea580c', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>Mahalle Sayısı</div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#7c2d12' }}>{stats.totalNeighborhoods}</div>
            </div>
            <div style={{ padding: '16px', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '1px solid #dcfce7', textAlign: 'center' }}>
              <div style={{ fontSize: '10pt', color: '#16a34a', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '4px' }}>Müracaatçı Sayısı</div>
              <div style={{ fontSize: '18pt', fontWeight: 'bold', color: '#14532d' }}>{stats.totalUniqueApplicants}</div>
            </div>
          </div>

          <h2 style={{ fontSize: '14pt', fontWeight: 'bold', marginBottom: '16px', borderLeft: '4px solid #2563eb', paddingLeft: '12px' }}>Personel Performans Verileri</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px' }}>
            <thead>
              <tr style={{ backgroundColor: '#2563eb', color: '#ffffff' }}>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #1d4ed8' }}>Personel</th>
                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #1d4ed8' }}>İş Sayısı</th>
                <th style={{ padding: '8px', textAlign: 'center', border: '1px solid #1d4ed8' }}>Farklı Müracaatçı</th>
              </tr>
            </thead>
            <tbody>
              {stats.staffData.map((s, idx) => (
                <tr key={s.id} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                  <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>{s.name}</td>
                  <td style={{ padding: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{s.jobCount}</td>
                  <td style={{ padding: '8px', border: '1px solid #e5e7eb', textAlign: 'center' }}>{s.uniqueApplicantsCount}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: '14pt', fontWeight: 'bold', marginBottom: '16px', borderLeft: '4px solid #16a34a', paddingLeft: '12px' }}>Detaylı Temizlik Kayıtları</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px', fontSize: '10pt' }}>
            <thead>
              <tr style={{ backgroundColor: '#16a34a', color: '#ffffff' }}>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #15803d' }}>Tarih</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #15803d' }}>Müracaatçı</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #15803d' }}>Mahalle</th>
                <th style={{ padding: '8px', textAlign: 'left', border: '1px solid #15803d' }}>Personeller</th>
              </tr>
            </thead>
            <tbody>
              {stats.completedAssignments.map((a, idx) => (
                <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#f9fafb' }}>
                  <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>{format(parseISO(a.date), 'dd.MM.yyyy')}</td>
                  <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>{a.applicant?.name} {a.applicant?.surname}</td>
                  <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>{a.applicant?.neighborhood || '-'}</td>
                  <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>{a.staffMembers.map(s => `${s.name} ${s.surname}`).join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Header & Date Filter */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">İstatistik ve Raporlar</h2>
          <p className="text-gray-500">Sistem verilerinin görsel analizi ve performans takibi.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
          <div className="flex gap-1 border-r border-gray-100 pr-2">
            <button 
              onClick={() => setQuickFilter('month')}
              className="px-3 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            >
              Bu Ay
            </button>
            <button 
              onClick={() => setQuickFilter('year')}
              className="px-3 py-1.5 text-xs font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              Bu Yıl
            </button>
          </div>
          <div className="flex items-center gap-2 px-3">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input 
              type="date" 
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="text-sm font-medium text-gray-700 outline-none border-none bg-transparent"
            />
            <ChevronRight className="w-4 h-4 text-gray-300" />
            <input 
              type="date" 
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="text-sm font-medium text-gray-700 outline-none border-none bg-transparent"
            />
          </div>
          <div className="h-6 w-px bg-gray-100 mx-1" />
          <div className="flex gap-1">
            <button onClick={exportToExcel} className="p-2 text-green-600 hover:bg-green-50 rounded-xl transition-colors" title="Excel İndir">
              <FileSpreadsheet className="w-5 h-5" />
            </button>
            <button onClick={exportToPDF} className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors" title="PDF İndir">
              <FileText className="w-5 h-5" />
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
          label="Hizmet Alan Kişi"
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
                <th className="px-6 py-4">Farklı Müracaatçı</th>
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
                  <td className="px-6 py-4 text-sm text-gray-600">{s.uniqueApplicantsCount} Kişi</td>
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
