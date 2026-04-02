import { useLiveQuery } from 'dexie-react-hooks';
import { dbLocal } from '../db';
import { format, isToday, isFuture, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';
import { Users, Briefcase, Calendar, CheckCircle2, Clock, AlertCircle, ArrowRight } from 'lucide-react';

interface Props {
  onNavigate: (tab: any) => void;
}

export default function Dashboard({ onNavigate }: Props) {
  const applicants = useLiveQuery(() => dbLocal.applicants.count()) || 0;
  const staff = useLiveQuery(() => dbLocal.staff.count()) || 0;
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];
  const workDays = useLiveQuery(() => dbLocal.workDays.toArray()) || [];

  const todaySchedule = schedules.find(s => isToday(parseISO(s.date)));
  const upcomingSchedules = schedules
    .filter(s => isFuture(parseISO(s.date)))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const stats = [
    { label: 'Toplam Müracaatçı', value: applicants, icon: Users, color: 'bg-blue-500' },
    { label: 'Aktif Personel', value: staff, icon: Briefcase, color: 'bg-indigo-500' },
    { label: 'Planlanan Gün', value: schedules.length, icon: Calendar, color: 'bg-green-500' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-bold text-gray-900">Hoş Geldiniz</h2>
          <p className="text-gray-500">Vefa Yönetim Sistemi genel durumu ve günlük özet.</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-gray-400 uppercase tracking-wider">Bugün</p>
          <p className="text-lg font-bold text-gray-900">{format(new Date(), 'dd MMMM yyyy, EEEE', { locale: tr })}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 flex items-center gap-5">
            <div className={`${stat.color} p-4 rounded-2xl text-white shadow-lg`}>
              <stat.icon className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Today's Plan */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex justify-between items-center">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Clock className="text-blue-600 w-5 h-5" />
              Bugünkü Program
            </h3>
            {todaySchedule && (
              <button 
                onClick={() => onNavigate('schedule')}
                className="text-blue-600 text-sm font-bold hover:underline flex items-center gap-1"
              >
                Detaylar <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="p-6">
            {todaySchedule ? (
              <div className="space-y-4">
                {todaySchedule.assignments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-2xl border border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold text-xs">
                        {i + 1}
                      </div>
                      <p className="font-semibold text-gray-800">
                        {/* We'd need to fetch names here, but for dashboard summary we can just show count or simple list */}
                        Müracaatçı #{a.applicantId}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                      <Briefcase className="w-3 h-3" />
                      {a.staffId ? `Personel #${a.staffId}` : 'Atanmamış'}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Bugün için planlanmış bir program bulunmuyor.</p>
                <button 
                  onClick={() => onNavigate('schedule')}
                  className="mt-4 text-blue-600 font-bold hover:underline"
                >
                  Yeni Program Oluştur
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Plans */}
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="p-6 border-b border-gray-50">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="text-indigo-600 w-5 h-5" />
              Yaklaşan Programlar
            </h3>
          </div>
          <div className="divide-y divide-gray-50">
            {upcomingSchedules.length > 0 ? (
              upcomingSchedules.map((s, i) => (
                <div key={i} className="p-4 hover:bg-gray-50 transition-all flex items-center justify-between cursor-pointer" onClick={() => onNavigate('schedule')}>
                  <div className="flex items-center gap-4">
                    <div className="text-center w-10">
                      <p className="text-lg font-bold text-gray-900 leading-none">{format(parseISO(s.date), 'dd')}</p>
                      <p className="text-[10px] text-gray-400 uppercase font-bold">{format(parseISO(s.date), 'MMM', { locale: tr })}</p>
                    </div>
                    <div>
                      <p className="font-semibold text-gray-800">{format(parseISO(s.date), 'EEEE', { locale: tr })}</p>
                      <p className="text-xs text-gray-500">{s.assignments.length} Müracaatçı Planlandı</p>
                    </div>
                  </div>
                  <CheckCircle2 className="text-green-500 w-5 h-5" />
                </div>
              ))
            ) : (
              <div className="p-12 text-center text-gray-400">
                Yakın zamanda planlanmış program yok.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
