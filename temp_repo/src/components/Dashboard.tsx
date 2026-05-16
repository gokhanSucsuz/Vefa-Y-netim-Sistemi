import { useMemo } from 'react';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { dbLocal } from '../db';
import { Staff, SystemUser } from '../types';
import { format, isToday, isFuture, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Users, Briefcase, Calendar, Clock, AlertCircle, ArrowRight, ShieldCheck, MapPin } from 'lucide-react';

interface Props {
  onNavigate: (tab: any, date?: string) => void;
  currentUser: SystemUser;
}

export default function Dashboard({ onNavigate, currentUser }: Props) {
  const applicantCount = useLiveQuery(() => dbLocal.applicants.count()) || 0;
  const staffCount = useLiveQuery(() => dbLocal.staff.count()) || 0;
  const applicants = useLiveQuery(() => dbLocal.applicants.toArray()) || [];
  const staff = useLiveQuery(() => dbLocal.staff.toArray()) || [];
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaySchedule = schedules.find(s => s.date === todayStr);

  const upcomingSchedules = useMemo(() => {
    return schedules
      .filter(s => {
        const d = parseISO(s.date);
        return !isNaN(d.getTime()) && isFuture(d);
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [schedules]);

  const totalPeopleCount = applicants.reduce((sum, app) => sum + (app.householdSize || 1), 0);

  const stats = [
    { label: 'Kayıtlı Hane', value: applicantCount, icon: Users, color: 'bg-institution-blue' },
    { label: 'Toplam Hizmet Alan', value: totalPeopleCount, icon: ShieldCheck, color: 'bg-institution-dark' },
    { label: 'Görevli Personel', value: staffCount, icon: Briefcase, color: 'bg-slate-700' },
    { label: 'Ziyaret Programı', value: schedules.length, icon: Calendar, color: 'bg-emerald-600' },
  ];

  return (
    <div className="space-y-6 lg:space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl lg:text-4xl font-extrabold text-slate-900 tracking-tight">Sistem Özeti</h2>
          <p className="text-sm lg:text-base text-slate-500 font-medium">Hoş geldiniz, {currentUser.name} {currentUser.surname}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-100 w-full sm:w-auto shadow-sm shadow-slate-100/50">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1.5">
            <Calendar className="w-3 h-3" />
            Sistem Tarihi
          </p>
          <p className="text-sm lg:text-base font-bold text-institution-blue">{format(new Date(), 'dd MMMM yyyy, EEEE', { locale: tr })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="official-card p-5 lg:p-6 flex items-center gap-4 lg:gap-5 group hover:shadow-md transition-all">
            <div className={`${stat.color} p-3 lg:p-4 rounded-2xl text-white shadow-lg shrink-0 group-hover:scale-110 transition-transform`}>
              <stat.icon className="w-5 h-5 lg:w-6 lg:h-6" />
            </div>
            <div>
              <p className="text-[10px] lg:text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">{stat.label}</p>
              <p className="text-2xl lg:text-3xl font-black text-slate-900 tracking-tighter">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
        {/* Today's Plan */}
        <div className="lg:col-span-2 flex flex-col">
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-lg lg:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2 h-6 bg-institution-blue rounded-full" />
              Bugünkü Saha Görevleri
            </h3>
            {todaySchedule && (
              <div className="flex gap-2">
                <button 
                  onClick={() => onNavigate('active_tasks')}
                  className="text-emerald-600 text-xs lg:text-sm font-bold bg-emerald-50 px-3 py-1.5 rounded-xl hover:bg-emerald-100 transition-all flex items-center gap-1.5"
                >
                  Canlı Takip <MapPin className="w-4 h-4" />
                </button>
                <button 
                  onClick={() => onNavigate('schedule')}
                  className="text-institution-blue text-xs lg:text-sm font-bold bg-blue-50 px-3 py-1.5 rounded-xl hover:bg-blue-100 transition-all flex items-center gap-1.5"
                >
                  Tüm Detaylar <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
          
          <div className="official-card flex-1 divide-y divide-slate-50">
            {todaySchedule ? (
              <div className="p-2 space-y-2">
                {todaySchedule.assignments.map((a, i) => {
                  const applicant = applicants.find(app => app.id === a.applicantId);
                  const staffMembers = (a.staffIds || []).map(id => staff.find(s => s.id === id)).filter(Boolean) as Staff[];
                  return (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover:bg-slate-50 transition-all rounded-2xl gap-3">
                      <div className="flex items-center gap-4">
                        <div className="w-8 h-8 bg-slate-900 text-white rounded-lg flex items-center justify-center font-black text-xs shrink-0 shadow-sm">
                          {i + 1}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm lg:text-base leading-none mb-1">
                            {applicant ? `${applicant.name} ${applicant.surname}` : `Hane #${a.applicantId}`}
                          </p>
                          {applicant && (
                            <div className="flex items-center gap-1.5 text-[10px] lg:text-xs text-slate-500 font-medium">
                              <MapPin className="w-3 h-3 text-slate-300" />
                              <span className="line-clamp-1">{applicant.address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600 bg-slate-100 px-3 py-2 rounded-xl self-start sm:self-auto border border-slate-200">
                        <Users className="w-3.5 h-3.5 text-institution-blue" />
                        <span className="truncate max-w-[200px] uppercase tracking-tighter">
                          {staffMembers.length > 0 ? staffMembers.map(s => `${s.name} ${s.surname}`).join(' / ') : 'PERSONEL ATANMAMIŞ'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-16 px-6">
                <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100 shadow-inner">
                  <Clock className="w-10 h-10 text-slate-200" />
                </div>
                <p className="text-base lg:text-lg text-slate-500 font-bold mb-2">Bugün İçin Plan Bulunmuyor</p>
                <p className="text-xs text-slate-400 mb-6 max-w-[250px] mx-auto">Sisteme yeni bir ziyaret planı eklemek için program oluşturucuya gidebilirsiniz.</p>
                <button 
                  onClick={() => onNavigate('schedule')}
                  className="px-8 py-3 bg-institution-blue text-white text-sm font-bold rounded-2xl hover:bg-institution-dark transition-all shadow-lg shadow-blue-200 uppercase tracking-widest"
                >
                  Program Oluştur
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Plans */}
        <div className="flex flex-col">
          <div className="flex items-center mb-4 px-2">
            <h3 className="text-lg lg:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span className="w-2 h-6 bg-slate-400 rounded-full" />
              Gelecek Planlar
            </h3>
          </div>
          
          <div className="official-card divide-y divide-slate-50 flex-1">
            {upcomingSchedules.length > 0 ? (
              upcomingSchedules.map((s, i) => (
                <div key={i} className="p-5 hover:bg-slate-50 transition-all flex items-center justify-between cursor-pointer group" onClick={() => onNavigate('schedule', s.date)}>
                  <div className="flex items-center gap-4">
                    <div className="text-center w-12 bg-slate-50 py-3 rounded-2xl border border-slate-100 group-hover:bg-slate-900 group-hover:text-white transition-all shadow-sm">
                      <p className="text-lg font-black leading-none mb-1">{format(parseISO(s.date), 'dd')}</p>
                      <p className="text-[9px] uppercase font-bold tracking-tighter">{format(parseISO(s.date), 'MMM', { locale: tr })}</p>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{format(parseISO(s.date), 'EEEE', { locale: tr })}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{s.assignments.length} Görev Planlandı</p>
                    </div>
                  </div>
                  <div className="bg-slate-100 p-2 rounded-xl text-slate-400 group-hover:bg-institution-blue group-hover:text-white transition-colors">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              ))
            ) : (
              <div className="p-16 text-center">
                <div className="bg-slate-50 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-4 border border-slate-100 rotate-12">
                  <Calendar className="w-8 h-8 text-slate-200" />
                </div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">Plan Yok</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
