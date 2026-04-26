/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { useLiveQuery } from './hooks/useLiveQuery';
import { dbLocal } from './db';
import { Users, Calendar, ClipboardList, BookOpen, Briefcase, Building2, LayoutDashboard, CheckCircle2, Loader2, AlertCircle, TrendingUp, Menu, X as CloseIcon, LogOut, History, Shield } from 'lucide-react';
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
import GoogleLogin from './components/GoogleLogin';
import AuditLogView from './components/AuditLogView';
import UserManager from './components/UserManager';
import StaffPanel from './components/StaffPanel';
import { SystemUser } from './types';
import { logAction } from './services/auditService';
import { useAuth } from './hooks/useAuth';
import { usePWA } from './hooks/usePWA';

import { APP_LOGO_URL } from './constants/logo';
import { Download } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applicants' | 'priority' | 'staff' | 'workdays' | 'schedule' | 'programs' | 'completed' | 'docs' | 'stats' | 'audit' | 'users' | 'backup'>(() => {
    return (localStorage.getItem('vefaActiveTab') as any) || 'dashboard';
  });

  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string | null>(null);
  const { canInstall, install } = usePWA();

  const navigateToSchedule = (date?: string) => {
    setSelectedScheduleDate(date || null);
    setActiveTab('schedule');
  };

  useEffect(() => {
    localStorage.setItem('vefaActiveTab', activeTab);
  }, [activeTab]);

  const { user: currentStaffUser, firebaseUser, isLoading, login, logout } = useAuth();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const handleStaffLogin = (user: SystemUser) => {
    login(user);
    logAction(user.id!, `${user.name} ${user.surname}`, 'Giriş', 'Sisteme giriş yapıldı.');
  };

  const handleLogout = async () => {
    if (currentStaffUser) {
      logAction(currentStaffUser.id!, `${currentStaffUser.name} ${currentStaffUser.surname}`, 'Çıkış', 'Sistemden çıkış yapıldı.');
    }
    logout();
  };

  const isAuthorized = !!currentStaffUser;

  const applicants = useLiveQuery(() => isAuthorized ? dbLocal.applicants.toArray() : Promise.resolve([]), [isAuthorized]) || [];
  const staff = useLiveQuery(() => isAuthorized ? dbLocal.staff.toArray() : Promise.resolve([]), [isAuthorized]) || [];
  const workDays = useLiveQuery(() => isAuthorized ? dbLocal.workDays.toArray() : Promise.resolve([]), [isAuthorized]) || [];
  const schedules = useLiveQuery(() => isAuthorized ? dbLocal.schedules.toArray() : Promise.resolve([]), [isAuthorized]) || [];
  const programs = useLiveQuery(() => isAuthorized ? dbLocal.programs.toArray() : Promise.resolve([]), [isAuthorized]) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-800 animate-spin" />
      </div>
    );
  }

  // First we need Google Auth
  if (!firebaseUser) {
    return <GoogleLogin />;
  }

  if (!currentStaffUser) {
    return <StaffLogin onLogin={handleStaffLogin} firebaseUser={firebaseUser} />;
  }

  // If user is staff, show staff panel ONLY
  if (currentStaffUser.role === 'staff') {
    return <StaffPanel currentUser={currentStaffUser} onLogout={handleLogout} />;
  }

  const menuItems = [
    { id: 'dashboard', label: 'Genel Durum', icon: LayoutDashboard },
    { id: 'applicants', label: 'Hane Listesi (CRUD)', icon: Users },
    { id: 'priority', label: 'Hane Sıralama & Öncelik', icon: ClipboardList },
    { id: 'staff', label: 'Personel Listesi', icon: Briefcase },
    { id: 'workdays', label: 'İş Günleri', icon: Calendar },
    { id: 'schedule', label: 'Program Planlama', icon: ClipboardList },
    { id: 'programs', label: 'Yapılan Programlar', icon: Calendar },
    { id: 'completed', label: 'Tamamlanan Temizlikler', icon: CheckCircle2 },
    { id: 'stats', label: 'İstatistik ve Raporlar', icon: TrendingUp },
    { id: 'audit', label: 'İşlem Geçmişi', icon: History },
    ...(currentStaffUser?.isSuperAdmin ? [{ id: 'users', label: 'Yetkili Yönetimi', icon: Shield }] : []),
    { id: 'backup', label: 'Veri Yedekleme', icon: Shield },
    { id: 'docs', label: 'Kullanım Kılavuzu', icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col lg:flex-row overflow-x-hidden">
      {/* Mobile Header */}
      <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-[60] w-full shadow-sm">
        <div className="flex items-center gap-3">
          <img 
            src={APP_LOGO_URL} 
            alt="Logo" 
            className="w-10 h-10 object-contain"
            referrerPolicy="no-referrer"
          />
          <div className="flex flex-col">
            <span className="font-extrabold text-sm text-gray-900 leading-none">VEFA SYDV</span>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Edirne SYDV</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canInstall && (
            <button 
              onClick={install}
              className="p-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-all border border-blue-100"
              title="Uygulamayı İndir"
            >
              <Download className="w-5 h-5" />
            </button>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
          >
            {isSidebarOpen ? <CloseIcon className="w-6 h-6 text-gray-700" /> : <Menu className="w-6 h-6 text-gray-700" />}
          </button>
        </div>
      </header>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[70] lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 flex flex-col z-[80] shadow-2xl transition-transform duration-300 lg:relative lg:shadow-none lg:translate-x-0
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-8 border-b border-gray-100 hidden lg:block">
          <div className="flex items-center gap-4">
            <img 
              src={APP_LOGO_URL} 
              alt="Logo" 
              className="w-14 h-14 object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <div>
              <span className="font-black text-lg text-gray-900 block leading-tight tracking-tight uppercase">Vefa SYDV</span>
              <span className="text-[10px] text-blue-600 font-black uppercase tracking-[0.2em]">YÖNETİM PANELİ</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id as any);
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-200 ${activeTab === item.id ? 'bg-[#1e40af] text-white font-bold shadow-xl shadow-blue-900/20' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-900 hover:pl-5 font-semibold'}`}
            >
              <item.icon className={`w-5 h-5 ${activeTab === item.id ? 'text-white' : 'text-slate-400'}`} />
              <span className="text-sm">{item.label}</span>
            </button>
          ))}
          
          {canInstall && (
            <button
              onClick={install}
              className="w-full flex lg:hidden items-center gap-3 px-4 py-3.5 rounded-2xl text-blue-700 bg-blue-50 border border-blue-100 font-bold mt-4"
            >
              <Download className="w-5 h-5" />
              <span className="text-sm">Uygulamayı İndir (PWA)</span>
            </button>
          )}
        </nav>

        <div className="p-6 border-t border-gray-100 bg-slate-50/50">
          <div className="mb-4 flex flex-col gap-2">
            <div className="flex items-center gap-3 px-2">
              <div className="w-10 h-10 rounded-full bg-blue-800 flex items-center justify-center text-white font-bold text-xs">
                {currentStaffUser.name?.[0] || ''}{currentStaffUser.surname?.[0] || ''}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-bold text-slate-900 truncate">{(currentStaffUser.name || '')} {(currentStaffUser.surname || '')}</span>
                <span className="text-[10px] text-slate-500 font-bold uppercase truncate">{currentStaffUser.role === 'admin' ? 'Yönetici' : 'Süper Yönetici'}</span>
              </div>
            </div>
            
            {canInstall && (
              <button
                onClick={install}
                className="hidden lg:flex w-full items-center gap-2 px-4 py-2 text-blue-700 hover:bg-blue-100 border border-transparent hover:border-blue-200 rounded-xl transition-all font-bold text-[11px] uppercase tracking-wider"
              >
                <Download className="w-4 h-4" />
                Uygulamayı Yükle
              </button>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-red-600 hover:bg-red-50 border border-red-100 rounded-2xl transition-all font-bold text-sm shadow-sm"
          >
            <LogOut className="w-5 h-5" />
            Oturumu Kapat
          </button>
          <div className="mt-6 text-center opacity-70">
            <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">
              TASARIM & YÖNETİM
            </p>
            <p className="text-[10px] text-gray-500 font-black">
              Gökhan SUÇSUZ
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-10 w-full">
        <div className="max-w-7xl mx-auto pb-20 w-full animate-in fade-in duration-500">
          {activeTab === 'dashboard' && <Dashboard onNavigate={navigateToSchedule} currentUser={currentStaffUser!} />}
          {activeTab === 'applicants' && <ApplicantList applicants={applicants} currentUser={currentStaffUser!} />}
          {activeTab === 'priority' && <ApplicantList applicants={applicants} currentUser={currentStaffUser!} isPriorityMode={true} />}
          {activeTab === 'staff' && <StaffList staff={staff} currentUser={currentStaffUser!} />}
          {activeTab === 'workdays' && <WorkDayCalendar workDays={workDays} currentUser={currentStaffUser!} />}
          {activeTab === 'schedule' && <ScheduleView applicants={applicants} staff={staff} workDays={workDays} schedules={schedules} programs={programs} currentUser={currentStaffUser!} initialDate={selectedScheduleDate} />}
          {activeTab === 'programs' && <ProgramManagement programs={programs} schedules={schedules} currentUser={currentStaffUser!} />}
          {activeTab === 'completed' && <CompletedCleanings applicants={applicants} staff={staff} schedules={schedules} currentUser={currentStaffUser!} />}
          {activeTab === 'stats' && <Statistics currentUser={currentStaffUser!} onNavigate={navigateToSchedule} />}
          {activeTab === 'audit' && <AuditLogView />}
          {activeTab === 'users' && <UserManager currentUser={currentStaffUser!} />}
          {activeTab === 'docs' && <Documentation />}
          {activeTab === 'backup' && <BackupManager user={firebaseUser} />}
        </div>
      </main>
    </div>
  );
}
