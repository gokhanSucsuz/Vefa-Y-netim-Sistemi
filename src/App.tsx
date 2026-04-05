/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbLocal } from './db';
import { Users, Calendar, ClipboardList, BookOpen, Briefcase, Building2, LayoutDashboard, CheckCircle2, Loader2, AlertCircle, TrendingUp, Menu, X as CloseIcon } from 'lucide-react';
import ApplicantList from './components/ApplicantList';
import StaffList from './components/StaffList';
import WorkDayCalendar from './components/WorkDayCalendar';
import ScheduleView from './components/ScheduleView';
import Documentation from './components/Documentation';
import Dashboard from './components/Dashboard';
import BackupManager from './components/BackupManager';
import ProgramManagement from './components/ProgramManagement';
import CompletedCleanings from './components/CompletedCleanings';
import Statistics from './components/Statistics';

import { APP_LOGO_URL } from './constants/logo';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applicants' | 'staff' | 'workdays' | 'schedule' | 'programs' | 'completed' | 'docs' | 'stats'>('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const AUTHORIZED_EMAIL = 'edirnesydv@gmail.com';

  const handleAuthChange = (auth: boolean, email?: string) => {
    setIsAuthenticated(auth);
    setUserEmail(email);
  };
  
  const applicants = useLiveQuery(() => dbLocal.applicants.toArray()) || [];
  const staff = useLiveQuery(() => dbLocal.staff.toArray()) || [];
  const workDays = useLiveQuery(() => dbLocal.workDays.toArray()) || [];
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];
  const programs = useLiveQuery(() => dbLocal.programs.toArray()) || [];

  // Otomatik Onaylama Mantığı (17:30 kuralı)
  useEffect(() => {
    const checkAutoCompletion = () => {
      if (!schedules.length) return;

      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      
      // 17:30 kontrolü
      const isPast1730 = now.getHours() > 17 || (now.getHours() === 17 && now.getMinutes() >= 30);

      const updates: any[] = [];

      schedules.forEach(schedule => {
        const scheduleDate = new Date(schedule.date);
        scheduleDate.setHours(0, 0, 0, 0);

        let hasChanges = false;
        const updatedAssignments = schedule.assignments.map(assignment => {
          if (!assignment.isCompleted) {
            const isPastDate = scheduleDate < today;
            const isTodayAndPast1730 = scheduleDate.getTime() === today.getTime() && isPast1730;

            if (isPastDate || isTodayAndPast1730) {
              hasChanges = true;
              return {
                ...assignment,
                isCompleted: true,
                completionDate: schedule.date,
                completionNote: assignment.completionNote || 'Sistem tarafından otomatik onaylandı (17:30)'
              };
            }
          }
          return assignment;
        });

        if (hasChanges) {
          updates.push({
            ...schedule,
            assignments: updatedAssignments
          });
        }
      });

      if (updates.length > 0) {
        // Toplu güncelleme
        dbLocal.transaction('rw', dbLocal.schedules, async () => {
          for (const update of updates) {
            await dbLocal.schedules.put(update);
          }
        }).catch(err => console.error('Otomatik onaylama hatası:', err));
      }
    };

    checkAutoCompletion();
    const interval = setInterval(checkAutoCompletion, 60000); // Her dakika kontrol et
    return () => clearInterval(interval);
  }, [schedules]);

  if (isAuthenticated === false || (isAuthenticated === true && userEmail !== AUTHORIZED_EMAIL)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <BackupManager onAuthChange={handleAuthChange} isInitialLoad={true} />
        {isAuthenticated === true && userEmail !== AUTHORIZED_EMAIL && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50">
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Yetkisiz hesap: {userEmail}. Lütfen {AUTHORIZED_EMAIL} ile giriş yapın.
            </div>
          </div>
        )}
      </div>
    );
  }

  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <BackupManager onAuthChange={handleAuthChange} isInitialLoad={true} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row overflow-x-hidden">
      {/* Mobile Header */}
      <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-[60] w-full">
        <div className="flex items-center gap-2">
          <img 
            src={APP_LOGO_URL} 
            alt="Logo" 
            className="w-8 h-8 object-contain"
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
          />
          <span className="font-bold text-sm text-gray-900 truncate max-w-[150px]">Edirne SYDV Vefa</span>
        </div>
        <button 
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
        >
          {isSidebarOpen ? <CloseIcon className="w-6 h-6 text-gray-600" /> : <Menu className="w-6 h-6 text-gray-600" />}
        </button>
      </header>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 flex flex-col z-50 transition-transform duration-300 lg:relative lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-gray-100 hidden lg:block">
          <div className="flex items-start gap-3 mb-1">
            <img 
              src={APP_LOGO_URL} 
              alt="Logo" 
              className="w-12 h-12 object-contain shrink-0"
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
            />
            <div>
              <span className="font-bold text-sm text-gray-900 block leading-tight">Edirne Merkez SYDV</span>
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Vefa Yönetim Sistemi</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {[
            { id: 'dashboard', label: 'Genel Durum', icon: LayoutDashboard },
            { id: 'applicants', label: 'Müracaatçı Listesi', icon: Users },
            { id: 'staff', label: 'Personel Listesi', icon: Briefcase },
            { id: 'workdays', label: 'İş Günleri', icon: Calendar },
            { id: 'schedule', label: 'Program Planlama', icon: ClipboardList },
            { id: 'programs', label: 'Yapılan Programlar', icon: Calendar },
            { id: 'completed', label: 'Tamamlanan Temizlikler', icon: CheckCircle2 },
            { id: 'stats', label: 'İstatistik ve Raporlar', icon: TrendingUp },
            { id: 'docs', label: 'Kullanım Kılavuzu', icon: BookOpen },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as any);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === item.id ? 'bg-blue-50 text-blue-700 font-bold shadow-sm shadow-blue-100/50' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'}`}
            >
              <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-blue-600' : 'text-gray-400'}`} />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <BackupManager onAuthChange={handleAuthChange} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-8 w-full">
        <div className="max-w-6xl mx-auto pb-12 w-full">
          {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} />}
          {activeTab === 'applicants' && <ApplicantList applicants={applicants} />}
          {activeTab === 'staff' && <StaffList staff={staff} />}
          {activeTab === 'workdays' && <WorkDayCalendar workDays={workDays} />}
          {activeTab === 'schedule' && <ScheduleView applicants={applicants} staff={staff} workDays={workDays} schedules={schedules} />}
          {activeTab === 'programs' && <ProgramManagement programs={programs} schedules={schedules} />}
          {activeTab === 'completed' && <CompletedCleanings applicants={applicants} staff={staff} schedules={schedules} />}
          {activeTab === 'stats' && <Statistics />}
          {activeTab === 'docs' && <Documentation />}
        </div>
      </main>
    </div>
  );
}
