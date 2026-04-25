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

import { APP_LOGO_URL } from './constants/logo';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applicants' | 'priority' | 'staff' | 'workdays' | 'schedule' | 'programs' | 'completed' | 'docs' | 'stats' | 'audit' | 'users' | 'backup'>(() => {
    return (localStorage.getItem('vefaActiveTab') as any) || 'dashboard';
  });

  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string | null>(null);

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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
      </div>
    );
  }

  // First we need Google Auth
  if (!firebaseUser) {
    return <GoogleLogin />;
  }

  if (!currentStaffUser) {
    return <StaffLogin onLogin={handleStaffLogin} />;
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
              <span className="font-bold text-sm text-gray-900 block leading-tight">Edirne SYDV Vefa</span>
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Yönetim Sistemi</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
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
          <div className="mt-6 text-center">
            <p className="text-[10px] text-gray-400 font-medium">
              Tasarlayan ve Yöneten: <span className="text-gray-500">Gökhan SUÇSUZ</span>
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-4 lg:p-8 w-full">
        <div className="max-w-6xl mx-auto pb-12 w-full">
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
