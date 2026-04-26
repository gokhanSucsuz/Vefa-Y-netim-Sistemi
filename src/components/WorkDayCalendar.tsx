import { useState } from 'react';
import { dbLocal } from '../db';
import { WorkDay, SystemUser } from '../types';
import { logAction } from '../services/auditService';
import { reAlignActiveProgramSchedules } from '../services/scheduleService';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, isWeekend } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle2, Circle } from 'lucide-react';

interface Props {
  workDays: WorkDay[];
  currentUser: SystemUser;
}

export default function WorkDayCalendar({ workDays, currentUser }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [processingDates, setProcessingDates] = useState<Set<string>>(new Set());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const toggleHoliday = async (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    if (processingDates.has(dateStr)) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    // Past days check
    if (selectedDate < today) {
      alert('Geçmiş günlerin ayarlarını değiştiremezsiniz.');
      return;
    }

    setProcessingDates(prev => new Set(prev).add(dateStr));

    try {
      // Re-fetch existing to be sure
      const latestWorkDays = await dbLocal.workDays.toArray();
      const existing = latestWorkDays.find(wd => wd.date === dateStr);
      const isWeekendDay = isWeekend(date);

      if (existing) {
        // Remove override, revert to default
        await dbLocal.workDays.delete(existing.id!);
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Varsayılana Dönüş', `${dateStr} tarihi için varsayılan ayarlara dönüldü.`);
      } else {
        // Add override
        await dbLocal.workDays.add({
          date: dateStr,
          isWorkDay: isWeekendDay // If it's a weekend usually (holiday), mark as workday. If weekday, mark as holiday (false).
        });
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, isWeekendDay ? 'Çalışma Günü Ekleme' : 'Tatil Ekleme', `${dateStr} durumu değiştirildi.`);
      }
      
      // Ripple Effect: Shift schedules
      await reAlignActiveProgramSchedules();
      
    } catch (error) {
      console.error("Error toggling holiday:", error);
    } finally {
      setProcessingDates(prev => {
        const next = new Set(prev);
        next.delete(dateStr);
        return next;
      });
    }
  };

  const clearHolidays = async () => {
    if (!confirm('Bu ayın tüm tatil işaretlerini temizlemek istediğinize emin misiniz? Hafta içi tüm günler çalışma günü sayılacaktır.')) return;
    try {
      const monthDays = workDays.filter(wd => {
        const d = new Date(wd.date);
        return d >= monthStart && d <= monthEnd;
      });
      for (const wd of monthDays) {
        await dbLocal.workDays.delete(wd.id!);
      }
      if (monthDays.length > 0) {
        logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Tatil Temizleme', `${format(currentMonth, 'MMMM yyyy', { locale: tr })} ayına ait tüm tatil işaretleri temizlendi.`);
        await reAlignActiveProgramSchedules();
      }
    } catch (error) {
      console.error("Error clearing holidays:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Tatil Günleri Belirleme</h2>
          <p className="text-gray-500">Hafta içi olup çalışılmayacak (tatil/izin) günleri seçin. Haftasonları otomatik tatil sayılır.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={clearHolidays}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-all"
          >
            Tatilleri Temizle
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-xl font-bold text-gray-900 capitalize">
            {format(currentMonth, 'MMMM yyyy', { locale: tr })}
          </h3>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
              className="p-2 hover:bg-gray-100 rounded-full transition-all"
            >
              <ChevronLeft className="w-6 h-6 text-gray-600" />
            </button>
            <button
              onClick={() => setCurrentMonth(new Date())}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
            >
              Bugün
            </button>
            <button
              onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
              className="p-2 hover:bg-gray-100 rounded-full transition-all"
            >
              <ChevronRight className="w-6 h-6 text-gray-600" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2 mb-2">
          {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].map(day => (
            <div key={day} className="text-center text-xs font-bold text-gray-400 uppercase tracking-widest py-2">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}

          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const explicitSetting = workDays.find(wd => wd.date === dateStr);
            const weekend = isWeekend(day);
            const isActualHoliday = explicitSetting ? !explicitSetting.isWorkDay : weekend;
            const today = isToday(day);

            return (
              <button
                key={dateStr}
                onClick={() => toggleHoliday(day)}
                disabled={(() => {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const d = new Date(day);
                  d.setHours(0, 0, 0, 0);
                  return d < today;
                })()}
                className={`
                  aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all relative group
                  ${isActualHoliday ? 'bg-amber-100 text-amber-900 border border-amber-200 shadow-sm shadow-amber-100/50 hover:border-amber-400' : 'bg-white text-slate-900 border border-slate-100 hover:border-blue-200 hover:bg-blue-50'}
                  ${today ? 'ring-2 ring-blue-500 ring-offset-2' : ''}
                  disabled:opacity-40 disabled:cursor-not-allowed
                `}
              >
                <span className={`text-lg font-bold ${isActualHoliday ? 'text-amber-900' : 'text-slate-900'}`}>
                  {format(day, 'd')}
                </span>
                <span className={`text-[8px] font-bold uppercase tracking-tighter ${isActualHoliday ? 'text-amber-600' : 'text-blue-600'}`}>
                  {isActualHoliday ? 'Tatil' : 'Çalışma'}
                </span>
                {today && (
                  <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
                {explicitSetting && (
                  <div className="absolute bottom-1 right-1 w-1.5 h-1.5 rounded-full bg-slate-600" title="Özel Ayar" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-slate-50 rounded-2xl p-4 flex items-start gap-3 border border-slate-100">
        <div className="flex gap-4">
           <div className="flex items-center gap-2">
             <div className="w-4 h-4 rounded bg-white border border-slate-200" />
             <span className="text-xs font-bold text-gray-700">Çalışma Günü</span>
           </div>
           <div className="flex items-center gap-2">
             <div className="w-4 h-4 rounded bg-amber-100 border border-amber-200" />
             <span className="text-xs font-bold text-gray-700">Tatil Günü</span>
           </div>
        </div>
      </div>
    </div>
  );
}
