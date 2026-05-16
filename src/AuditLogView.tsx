import React, { useState, useEffect, useMemo } from 'react';
import { dbService } from '../db';
import { AuditLog } from '../types';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { History, Search, Filter, Loader2, Calendar } from 'lucide-react';
import Pagination from './Pagination';

export default function AuditLogView() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 30;

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const fetchedLogs = await dbService.auditLogs.toArray();
        const sortedLogs = [...fetchedLogs].sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setLogs(sortedLogs);
      } catch (error) {
        console.error('Error fetching audit logs:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchLogs();
  }, []);

  const filteredLogs = useMemo(() => logs.filter(log => 
    log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
    log.details.toLowerCase().includes(searchTerm.toLowerCase())
  ), [logs, searchTerm]);

  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLogs.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLogs, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 tracking-tight">İşlem Geçmişi</h2>
        <p className="text-gray-500 font-medium tracking-tight">Sistem üzerinde gerçekleştirilen tüm işlemlerin detaylı kaydı.</p>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            placeholder="İşlem, kullanıcı veya detaylarda ara..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-blue-100 focus:border-blue-500 outline-none transition-all placeholder:text-slate-400 font-medium text-sm"
          />
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Tarih / Saat</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Kullanıcı Bilgisi</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Yapılan İşlem</th>
                <th className="px-6 py-5 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Detaylar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-16 text-center text-slate-400 font-bold uppercase tracking-widest text-xs">
                    Aranan kriterlere uygun kayıt bulunamadı.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50/50 transition-all group border-b border-slate-50 last:border-0 text-sm">
                    <td className="px-6 py-5 text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-blue-50 group-hover:text-blue-500 transition-colors">
                          <Calendar className="w-4 h-4" />
                        </div>
                        <span className="font-mono text-xs font-bold bg-slate-50 px-2 py-1 rounded border border-slate-100">
                          {format(new Date(log.timestamp), 'dd.MM.yyyy HH:mm:ss', { locale: tr })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="font-bold text-slate-900 uppercase tracking-tight">{log.userName}</div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="inline-flex items-center px-3 py-1.5 rounded-xl text-[10px] font-black bg-blue-50 text-[#1e40af] border border-blue-100 uppercase tracking-widest">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-slate-600 leading-relaxed font-medium">
                      {log.details}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination 
        currentPage={currentPage}
        totalItems={filteredLogs.length}
        itemsPerPage={itemsPerPage}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
