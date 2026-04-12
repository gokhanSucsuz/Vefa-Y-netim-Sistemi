import { useLiveQuery } from '../hooks/useLiveQuery';
import { dbLocal } from '../db';
import { Staff } from '../types';
import { format, isToday, isFuture, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Users, Briefcase, Calendar, CheckCircle2, Clock, AlertCircle, ArrowRight } from 'lucide-react';

interface Props {
  onNavigate: (tab: any) => void;
}

export default function Dashboard({ onNavigate }: Props) {
  const applicantCount = useLiveQuery(() => dbLocal.applicants.count()) || 0;
  const staffCount = useLiveQuery(() => dbLocal.staff.count()) || 0;
  const applicants = useLiveQuery(() => dbLocal.applicants.toArray()) || [];
  const staff = useLiveQuery(() => dbLocal.staff.toArray()) || [];
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];
  const workDays = useLiveQuery(() => dbLocal.workDays.toArray()) || [];

  const todaySchedule = schedules.find(s => isToday(parseISO(s.date)));
  const upcomingSchedules = schedules
    .filter(s => isFuture(parseISO(s.date)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const totalPeopleCount = applicants.reduce((sum, app) => sum + (app.householdSize || 1), 0);

  const stats = [
    { label: 'Toplam Hane', value: applicantCount, icon: Users, color: 'bg-blue-500' },
    { label: 'Kişi Sayısı', value: totalPeopleCount, icon: Users, color: 'bg-purple-500' },
    { label: 'Aktif Personel', value: staffCount, icon: Briefcase, color: 'bg-indigo-500' },
    { label: 'Planlanan Gün', value: schedules.length, icon: Calendar, color: 'bg-green-500' },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h2 className="text-2xl lg:text-3xl font-bold text-gray-900">Hoş Geldiniz</h2>
          <p className="text-sm lg:text-base text-gray-500">Vefa Yönetim Sistemi genel durumu ve günlük özet.</p>
        </div>
        <div className="sm:text-right bg-white sm:bg-transparent p-3 sm:p-0 rounded-2xl border border-gray-100 sm:border-0 w-full sm:w-auto shadow-sm sm:shadow-none">
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1">Bugün</p>
          <p className="text-base lg:text-lg font-bold text-gray-900">{format(new Date(), 'dd MMMM yyyy, EEEE', { locale: tr })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-5 lg:p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-4 lg:gap-5 hover:shadow-md transition-shadow">
            <div className={`${stat.color} p-3 lg:p-4 rounded-2xl text-white shadow-lg shrink-0`}>
              <stat.icon className="w-5 h-5 lg:w-6 lg:h-6" />
            </div>
            <div>
              <p className="text-xs lg:text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="text-xl lg:text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Today's Plan */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-5 lg:p-6 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
            <h3 className="text-lg lg:text-xl font-bold text-gray-900 flex items-center gap-2">
              <Clock className="text-blue-600 w-5 h-5" />
              Bugünkü Program
            </h3>
            {todaySchedule && (
              <button 
                onClick={() => onNavigate('schedule')}
                className="text-blue-600 text-xs lg:text-sm font-bold hover:underline flex items-center gap-1"
              >
                Detaylar <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="p-5 lg:p-6 flex-1">
            {todaySchedule ? (
              <div className="space-y-3">
                {todaySchedule.assignments.map((a, i) => {
                  const applicant = applicants.find(app => app.id === a.applicantId);
                  const staffMembers = (a.staffIds || []).map(id => staff.find(s => s.id === id)).filter(Boolean) as Staff[];
                  return (
                    <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs shrink-0">
                          {i + 1}
                        </div>
                        <div>
                          <p className="font-bold text-gray-900 text-sm lg:text-base">
                            {applicant ? `${applicant.name} ${applicant.surname}` : `Hane #${a.applicantId}`}
                          </p>
                          {applicant && <p className="text-[10px] lg:text-xs text-blue-600 font-medium line-clamp-1">{applicant.address}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] lg:text-xs font-bold text-gray-500 bg-white px-3 py-1.5 rounded-lg border border-gray-100 self-start sm:self-auto">
                        <Briefcase className="w-3 h-3 text-blue-500" />
                        <span className="truncate max-w-[150px]">
                          {staffMembers.length > 0 ? staffMembers.map(s => `${s.name} ${s.surname}`).join(', ') : 'Atanmamış'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-10 lg:py-12">
                <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm lg:text-base text-gray-500 font-medium">Bugün için planlanmış bir program bulunmuyor.</p>
                <button 
                  onClick={() => onNavigate('schedule')}
                  className="mt-4 px-6 py-2 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
                >
                  Yeni Program Oluştur
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Plans */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden flex flex-col">
          <div className="p-5 lg:p-6 border-b border-gray-50 bg-gray-50/30">
            <h3 className="text-lg lg:text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="text-indigo-600 w-5 h-5" />
              Yaklaşan Programlar
            </h3>
          </div>
          <div className="divide-y divide-gray-50 flex-1">
            {upcomingSchedules.length > 0 ? (
              upcomingSchedules.map((s, i) => (
                <div key={i} className="p-4 lg:p-5 hover:bg-gray-50 transition-all flex items-center justify-between cursor-pointer group" onClick={() => onNavigate('schedule')}>
                  <div className="flex items-center gap-4">
                    <div className="text-center w-12 bg-indigo-50 p-2 rounded-xl border border-indigo-100 group-hover:bg-indigo-100 transition-colors">
                      <p className="text-base lg:text-lg font-bold text-indigo-700 leading-none">{format(parseISO(s.date), 'dd')}</p>
                      <p className="text-[10px] text-indigo-500 uppercase font-bold mt-1">{format(parseISO(s.date), 'MMM', { locale: tr })}</p>
                    </div>
                    <div>
                      <p className="font-bold text-gray-900 text-sm lg:text-base">{format(parseISO(s.date), 'EEEE', { locale: tr })}</p>
                      <p className="text-xs text-gray-500 font-medium">{s.assignments.length} Hane Planlandı</p>
                    </div>
                  </div>
                  <div className="bg-green-50 p-2 rounded-full">
                    <CheckCircle2 className="text-green-500 w-4 h-4 lg:w-5 lg:h-5" />
                  </div>
                </div>
              ))
            ) : (
              <div className="p-10 lg:p-12 text-center">
                <div className="bg-gray-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="w-8 h-8 text-gray-300" />
                </div>
                <p className="text-sm lg:text-base text-gray-400 font-medium">Yakın zamanda planlanmış program yok.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
