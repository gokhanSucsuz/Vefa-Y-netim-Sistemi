import { useState } from 'react';
import { dbLocal } from '../db';
import { WorkDay } from '../types';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, addMonths, subMonths, isToday, isWeekend } from 'date-fns';
import { tr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, CheckCircle2, Circle } from 'lucide-react';

interface Props {
  workDays: WorkDay[];
}

export default function WorkDayCalendar({ workDays }: Props) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const toggleWorkDay = async (date: Date) => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const isAfter830 = currentHour > 8 || (currentHour === 8 && currentMinute >= 30);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const selectedDate = new Date(date);
    selectedDate.setHours(0, 0, 0, 0);

    // Past days check
    if (selectedDate < today) {
      alert('Geçmiş günleri iş günü olarak seçemezsiniz.');
      return;
    }

    // 08:30 rule for today
    if (isSameDay(selectedDate, today) && isAfter830) {
      alert('Saat 08:30\'u geçtiği için bugünü iş günü olarak seçemezsiniz. Lütfen yarına veya sonraki günlere planlama yapın.');
      return;
    }

    const dateStr = format(date, 'yyyy-MM-dd');
    const existing = workDays.find(wd => wd.date === dateStr);

    try {
      if (existing) {
        await dbLocal.workDays.delete(existing.id!);
      } else {
        await dbLocal.workDays.add({
          date: dateStr,
          isWorkDay: true
        });
      }
    } catch (error) {
      console.error("Error toggling work day:", error);
    }
  };

  const selectAllWeekdays = async () => {
    const now = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();
    const isAfter830 = currentHour > 8 || (currentHour === 8 && currentMinute >= 30);
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      for (const day of days) {
        const dayDate = new Date(day);
        dayDate.setHours(0, 0, 0, 0);

        // Skip past days
        if (dayDate < today) continue;
        
        // Skip today if after 08:30
        if (isSameDay(dayDate, today) && isAfter830) continue;

        if (!isWeekend(day)) {
          const dateStr = format(day, 'yyyy-MM-dd');
          const existing = workDays.find(wd => wd.date === dateStr);
          if (!existing) {
            await dbLocal.workDays.add({ date: dateStr, isWorkDay: true });
          }
        }
      }
    } catch (error) {
      console.error("Error selecting weekdays:", error);
    }
  };

  const clearMonth = async () => {
    if (!confirm('Bu ayın tüm iş günlerini temizlemek istediğinize emin misiniz?')) return;
    try {
      const monthDays = workDays.filter(wd => {
        const d = new Date(wd.date);
        return d >= monthStart && d <= monthEnd;
      });
      for (const wd of monthDays) {
        await dbLocal.workDays.delete(wd.id!);
      }
    } catch (error) {
      console.error("Error clearing month:", error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">İş Günleri Belirleme</h2>
          <p className="text-gray-500">Takvim üzerinden ilgili ayın iş günlerini seçin.</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={selectAllWeekdays}
            className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-all"
          >
            Hafta İçi Günleri Seç
          </button>
          <button
            onClick={clearMonth}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-all"
          >
            Tümünü Temizle
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
          {/* Empty cells for padding */}
          {Array.from({ length: (monthStart.getDay() + 6) % 7 }).map((_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}

          {days.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const isWorkDay = workDays.some(wd => wd.date === dateStr);
            const today = isToday(day);

            return (
              <button
                key={dateStr}
                onClick={() => toggleWorkDay(day)}
                disabled={(() => {
                  const now = new Date();
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const d = new Date(day);
                  d.setHours(0, 0, 0, 0);
                  const isAfter830 = now.getHours() > 8 || (now.getHours() === 8 && now.getMinutes() >= 30);
                  return d < today || (isSameDay(d, today) && isAfter830);
                })()}
                className={`
                  aspect-square rounded-2xl flex flex-col items-center justify-center gap-1 transition-all relative group
                  ${isWorkDay ? 'bg-blue-600 text-white shadow-lg shadow-blue-100 scale-105 z-10' : 'bg-gray-50 text-gray-700 hover:bg-gray-100'}
                  ${today && !isWorkDay ? 'ring-2 ring-blue-200' : ''}
                  disabled:opacity-30 disabled:cursor-not-allowed disabled:scale-100
                `}
              >
                <span className={`text-lg font-bold ${isWorkDay ? 'text-white' : 'text-gray-900'}`}>
                  {format(day, 'd')}
                </span>
                {isWorkDay ? (
                  <CheckCircle2 className="w-4 h-4 text-blue-200" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
                )}
                {today && (
                  <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white ${isWorkDay ? 'bg-white' : 'bg-blue-500'}`} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-blue-50 rounded-2xl p-4 flex items-start gap-3 border border-blue-100">
        <CalendarIcon className="w-5 h-5 text-blue-600 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-semibold">İpucu:</p>
          <p>Mavi renkli günler iş günü olarak işaretlenmiştir. Günlerin üzerine tıklayarak seçim yapabilir veya kaldırabilirsiniz.</p>
        </div>
      </div>
    </div>
  );
}
