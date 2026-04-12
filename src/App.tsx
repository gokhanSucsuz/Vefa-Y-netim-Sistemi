/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useLiveQuery } from './hooks/useLiveQuery';
import { dbLocal } from './db';
import { auth } from './firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { Users, Calendar, ClipboardList, BookOpen, Briefcase, Building2, LayoutDashboard, CheckCircle2, Loader2, AlertCircle, TrendingUp, Menu, X as CloseIcon, LogOut, History } from 'lucide-react';
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
import StaffLogin from './components/StaffLogin';
import AuditLogView from './components/AuditLogView';
import { SystemUser } from './types';
import { logAction } from './services/auditService';

import { APP_LOGO_URL } from './constants/logo';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applicants' | 'staff' | 'workdays' | 'schedule' | 'programs' | 'completed' | 'docs' | 'stats' | 'audit'>('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<any>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [currentStaffUser, setCurrentStaffUser] = useState<SystemUser | null>(null);
  const [isAdminLoading, setIsAdminLoading] = useState(true);

  const AUTHORIZED_EMAIL = 'edirnesydv@gmail.com';

  // Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setIsAuthenticated(!!currentUser);
      setUser(currentUser);
      setUserEmail(currentUser?.email || undefined);
    });
    return () => unsubscribe();
  }, []);

  const handleAuthChange = (auth: boolean, email?: string) => {
    setIsAuthenticated(auth);
    setUserEmail(email);
  };
  
  const isGoogleAuthorized = isAuthenticated === true && userEmail === AUTHORIZED_EMAIL;

  const handleStaffLogin = (user: SystemUser) => {
    setCurrentStaffUser(user);
    logAction(user.id!, `${user.name} ${user.surname}`, 'Giriş', 'Sisteme giriş yapıldı.');
  };

  const handleLogout = async () => {
    if (currentStaffUser) {
      logAction(currentStaffUser.id!, `${currentStaffUser.name} ${currentStaffUser.surname}`, 'Çıkış', 'Sistemden çıkış yapıldı.');
    }
    setCurrentStaffUser(null);
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Çıkış yapılırken hata oluştu:', error);
    }
  };

  const isAuthorized = isGoogleAuthorized && !!currentStaffUser;

  // Fetch current admin - No longer needed as we use currentStaffUser
  useEffect(() => {
    setIsAdminLoading(false);
  }, [isAuthenticated]);

  const applicants = useLiveQuery(() => isAuthorized ? dbLocal.applicants.toArray() : Promise.resolve([]), [isAuthorized]) || [];
  const staff = useLiveQuery(() => isAuthorized ? dbLocal.staff.toArray() : Promise.resolve([]), [isAuthorized]) || [];
  const workDays = useLiveQuery(() => isAuthorized ? dbLocal.workDays.toArray() : Promise.resolve([]), [isAuthorized]) || [];
  const schedules = useLiveQuery(() => isAuthorized ? dbLocal.schedules.toArray() : Promise.resolve([]), [isAuthorized]) || [];
  const programs = useLiveQuery(() => isAuthorized ? dbLocal.programs.toArray() : Promise.resolve([]), [isAuthorized]) || [];

  // Otomatik Onaylama Mantığı (17:30 kuralı)
  useEffect(() => {
    const checkAutoCompletion = () => {
      if (!isAuthorized || !schedules.length) return;

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
  }, [schedules, isAuthorized]);

  if (isAuthenticated === null || isAdminLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (isAuthenticated === false || (isAuthenticated === true && userEmail !== AUTHORIZED_EMAIL)) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col pt-10">
        <BackupManager user={user} onAuthChange={handleAuthChange} isInitialLoad={true} />
      </div>
    );
  }

  if (isGoogleAuthorized && !currentStaffUser) {
    return <StaffLogin onLogin={handleStaffLogin} />;
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
          <span className="font-bold text-sm text-gray-900 truncate max-w-[150px]">Edirne Merkez Vefa</span>
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
              <span className="font-bold text-sm text-gray-900 block leading-tight">Edirne Merkez Vefa Modülü</span>
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Sosyal Yardımlaşma ve Dayanışma Vakfı</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {[
            { id: 'dashboard', label: 'Genel Durum', icon: LayoutDashboard },
            { id: 'applicants', label: 'Hane Listesi', icon: Users },
            { id: 'staff', label: 'Personel Listesi', icon: Briefcase },
            { id: 'workdays', label: 'İş Günleri', icon: Calendar },
            { id: 'schedule', label: 'Program Planlama', icon: ClipboardList },
            { id: 'programs', label: 'Yapılan Programlar', icon: Calendar },
            { id: 'completed', label: 'Tamamlanan Temizlikler', icon: CheckCircle2 },
            { id: 'stats', label: 'İstatistik ve Raporlar', icon: TrendingUp },
            { id: 'audit', label: 'İşlem Geçmişi', icon: History },
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
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 rounded-2xl transition-all font-bold text-sm"
          >
            <LogOut className="w-5 h-5" />
            Oturumu Kapat
          </button>
          <div className="mt-4">
            <BackupManager user={user} onAuthChange={handleAuthChange} />
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-8 w-full">
        <div className="max-w-6xl mx-auto pb-12 w-full">
          {activeTab === 'dashboard' && <Dashboard onNavigate={setActiveTab} currentUser={currentStaffUser!} />}
          {activeTab === 'applicants' && <ApplicantList applicants={applicants} currentUser={currentStaffUser!} />}
          {activeTab === 'staff' && <StaffList staff={staff} currentUser={currentStaffUser!} />}
          {activeTab === 'workdays' && <WorkDayCalendar workDays={workDays} currentUser={currentStaffUser!} />}
          {activeTab === 'schedule' && <ScheduleView applicants={applicants} staff={staff} workDays={workDays} schedules={schedules} currentUser={currentStaffUser!} />}
          {activeTab === 'programs' && <ProgramManagement programs={programs} schedules={schedules} currentUser={currentStaffUser!} />}
          {activeTab === 'completed' && <CompletedCleanings applicants={applicants} staff={staff} schedules={schedules} currentUser={currentStaffUser!} />}
          {activeTab === 'stats' && <Statistics currentUser={currentStaffUser!} />}
          {activeTab === 'audit' && <AuditLogView />}
          {activeTab === 'docs' && <Documentation />}
        </div>
      </main>
    </div>
  );
}
