import { useState, useEffect } from 'react';
import { useLiveQuery } from './hooks/useLiveQuery';
import { dbLocal } from './db';
import { Users, Calendar, ClipboardList, BookOpen, Briefcase, Building2, LayoutDashboard, CheckCircle2, Loader2, AlertCircle, TrendingUp, Menu, X as CloseIcon, LogOut, History, Shield, MapPin, ChevronLeft, ChevronRight, MoreHorizontal, Download } from 'lucide-react';
import ApplicantList from './components/ApplicantList';
import StaffList from './components/StaffList';
import WorkDayCalendar from './components/WorkDayCalendar';
import ScheduleView from './components/ScheduleView';
import Documentation from './components/Documentation';
import Dashboard from './components/Dashboard';
import BackupManager from './components/BackupManager';
import ProgramManagement from './components/ProgramManagement';
import CompletedCleanings from './components/CompletedCleanings';
import ActiveTasksTracker from './components/ActiveTasksTracker';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applicants' | 'priority' | 'staff' | 'workdays' | 'schedule' | 'programs' | 'active_tasks' | 'completed' | 'docs' | 'stats' | 'audit' | 'users' | 'backup'>(() => {
    return (localStorage.getItem('vefaActiveTab') as any) || 'dashboard';
  });

  const [selectedScheduleDate, setSelectedScheduleDate] = useState<string | null>(null);
  const { canInstall, install } = usePWA();

  const navigateToSchedule = (date?: string) => {
    setSelectedScheduleDate(date || null);
    setActiveTab('schedule');
  };

  const { user: currentStaffUser, firebaseUser, isLoading, login, logout } = useAuth();
  
  // UI State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (currentStaffUser && !currentStaffUser.isSuperAdmin && activeTab === 'users') {
      setActiveTab('dashboard');
    } else {
      localStorage.setItem('vefaActiveTab', activeTab);
    }
  }, [activeTab, currentStaffUser]);

  const handleStaffLogin = (user: SystemUser) => {
    login(user);
    if (user.role !== 'staff') {
      setActiveTab('dashboard');
    }
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
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
        <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Sistem Yükleniyor...</p>
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

  // B2B SaaS Structured Menu
  const menuSections = [
    {
      title: "GÖRÜNÜM",
      items: [
        { id: 'dashboard', label: 'Genel Durum', icon: LayoutDashboard },
        { id: 'active_tasks', label: 'Aktif Görevler', icon: MapPin },
      ]
    },
    {
      title: "OPERASYON",
      items: [
        { id: 'schedule', label: 'Planlama', icon: ClipboardList },
        { id: 'programs', label: 'Programlar', icon: Calendar },
        { id: 'applicants', label: 'Haneler', icon: Users },
        { id: 'priority', label: 'Hane Öncelik', icon: TrendingUp },
      ]
    },
    {
      title: "YÖNETİM",
      items: [
        { id: 'staff', label: 'Personel', icon: Briefcase },
        { id: 'workdays', label: 'İş Günleri', icon: Calendar },
        { id: 'completed', label: 'Tamamlananlar', icon: CheckCircle2 },
      ]
    },
    {
      title: "SİSTEM",
      items: [
        { id: 'stats', label: 'Raporlar', icon: TrendingUp },
        { id: 'audit', label: 'İşlem Geçmişi', icon: History },
        ...(currentStaffUser?.isSuperAdmin ? [{ id: 'users', label: 'Yetkililer', icon: Shield }] : []),
        { id: 'backup', label: 'Yedekleme', icon: Shield },
        { id: 'docs', label: 'Kılavuz', icon: BookOpen },
      ]
    }
  ];

  // Flat list for mobile 'More' menu finding
  const allMenuItems = menuSections.flatMap(s => s.items);

  // Mobile Bottom Tab Navigation
  const mobileTabs = [
    { id: 'dashboard', label: 'Özet', icon: LayoutDashboard },
    { id: 'active_tasks', label: 'Görev', icon: MapPin },
    { id: 'schedule', label: 'Plan', icon: ClipboardList },
    { id: 'applicants', label: 'Hane', icon: Users },
  ];

  const handleTabClick = (id: string) => {
    setActiveTab(id as any);
    setIsMobileMenuOpen(false);
  };

  return (
    <div className="h-screen w-full bg-slate-50 flex overflow-hidden">
      
      {/* ======================================================== */}
      {/* DESKTOP SIDEBAR */}
      {/* ======================================================== */}
      <aside 
        className={`hidden lg:flex flex-col bg-white border-r border-slate-200 transition-all duration-300 z-20 ${
          isSidebarCollapsed ? 'w-20' : 'w-72'
        }`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 shrink-0">
          <div className={`flex items-center gap-3 overflow-hidden ${isSidebarCollapsed ? 'w-0 opacity-0 hidden' : 'w-auto opacity-100'}`}>
            <img src={APP_LOGO_URL} alt="Logo" className="w-8 h-8 object-contain shrink-0" referrerPolicy="no-referrer" />
            <div className="flex flex-col whitespace-nowrap">
              <span className="font-black text-sm text-slate-900 leading-none">VEFA SYDV</span>
              <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest">Yönetim Paneli</span>
            </div>
          </div>
          
          {isSidebarCollapsed && (
             <img src={APP_LOGO_URL} alt="Logo" className="w-8 h-8 object-contain mx-auto" referrerPolicy="no-referrer" />
          )}

          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors absolute -right-4 bg-white border border-slate-200 shadow-sm z-50"
          >
            {isSidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Sidebar Navigation */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-slate-200 py-4">
          <div className="space-y-6 px-3">
            {menuSections.map((section, sIdx) => (
              <div key={sIdx} className="space-y-1">
                {!isSidebarCollapsed && (
                  <div className="px-3 mb-2 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    {section.title}
                  </div>
                )}
                {isSidebarCollapsed && (
                  <div className="w-full flex justify-center mb-2">
                    <div className="w-4 h-0.5 bg-slate-200 rounded-full"></div>
                  </div>
                )}
                
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabClick(item.id)}
                      title={isSidebarCollapsed ? item.label : undefined}
                      className={`w-full flex items-center rounded-xl transition-all duration-200 group relative ${
                        isSidebarCollapsed ? 'justify-center p-3' : 'justify-start px-3 py-2.5 gap-3'
                      } ${
                        isActive 
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20 font-bold' 
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-medium'
                      }`}
                    >
                      <item.icon className={`shrink-0 ${isSidebarCollapsed ? 'w-5 h-5' : 'w-4 h-4'} ${isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-600'}`} />
                      
                      {!isSidebarCollapsed && (
                        <span className="text-sm truncate">{item.label}</span>
                      )}

                      {/* Tooltip for collapsed state */}
                      {isSidebarCollapsed && (
                        <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white text-xs font-bold rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 pointer-events-none shadow-xl">
                          {item.label}
                          <div className="absolute top-1/2 -left-1 -mt-1 w-2 h-2 bg-slate-800 rotate-45"></div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar Footer User Info */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <div className={`flex items-center gap-3 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
            {!isSidebarCollapsed ? (
              <>
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0">
                    {currentStaffUser.name?.[0]}{currentStaffUser.surname?.[0]}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-slate-900 truncate">{currentStaffUser.name} {currentStaffUser.surname}</span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{currentStaffUser.role}</span>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors shrink-0"
                  title="Çıkış Yap"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            ) : (
              <button 
                onClick={handleLogout}
                className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors"
                title="Çıkış Yap"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* MOBILE HEADER & DRAWER */}
      {/* ======================================================== */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-40 flex items-center justify-between px-4 shadow-sm">
        <div className="flex items-center gap-2">
          <img src={APP_LOGO_URL} alt="Logo" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
          <span className="font-black text-sm text-slate-900 tracking-tight">VEFA SYDV</span>
        </div>
        <div className="flex items-center gap-1">
          {canInstall && (
            <button onClick={install} className="w-9 h-9 flex items-center justify-center bg-blue-50 text-blue-600 rounded-full">
              <Download className="w-4 h-4" />
            </button>
          )}
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="w-9 h-9 flex items-center justify-center bg-slate-100 text-slate-600 rounded-full"
          >
            <div className="w-7 h-7 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-[10px]">
              {currentStaffUser.name?.[0]}{currentStaffUser.surname?.[0]}
            </div>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[90] lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Drawer Menu */}
      <div className={`
        fixed inset-y-0 right-0 w-[280px] bg-white shadow-2xl z-[100] lg:hidden flex flex-col transition-transform duration-300 ease-out
        ${isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-200">
               {currentStaffUser.name?.[0]}{currentStaffUser.surname?.[0]}
             </div>
             <div>
               <div className="font-bold text-sm text-slate-900">{currentStaffUser.name} {currentStaffUser.surname}</div>
               <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{currentStaffUser.role}</div>
             </div>
          </div>
          <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 bg-white rounded-full text-slate-400 shadow-sm border border-slate-100">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
           {menuSections.map((section, sIdx) => (
              <div key={sIdx} className="space-y-2">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest pl-2">
                  {section.title}
                </div>
                {section.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabClick(item.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-bold text-sm ${
                        isActive 
                        ? 'bg-blue-50 text-blue-700' 
                        : 'text-slate-600 active:bg-slate-50'
                      }`}
                    >
                      <item.icon className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
        </div>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 rounded-xl font-bold text-sm"
          >
            <LogOut className="w-4 h-4" />
            Oturumu Kapat
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ======================================================== */}
      <main className="flex-1 relative flex flex-col min-w-0 overflow-hidden bg-[#F8FAFC]">
        {/* Desktop Top Header */}
        <header className="hidden lg:flex h-16 border-b border-slate-200 bg-white/80 backdrop-blur-md items-center justify-between px-8 z-10 shrink-0">
           <div className="flex items-center gap-2">
              <span className="text-slate-400 font-medium text-sm">Menü</span>
              <ChevronRight className="w-4 h-4 text-slate-300" />
              <span className="text-slate-900 font-bold text-sm">
                {allMenuItems.find(i => i.id === activeTab)?.label}
              </span>
           </div>
           
           <div className="flex items-center gap-3">
             {canInstall && (
               <button onClick={install} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors">
                 <Download className="w-3.5 h-3.5" />
                 PWA İndir
               </button>
             )}
           </div>
        </header>

        {/* Scrollable Content Viewport */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden relative scroll-smooth p-4 pt-20 lg:pt-8 lg:p-8 pb-24 lg:pb-8">
          <div className="max-w-[1400px] mx-auto w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            {activeTab === 'dashboard' && (
              <Dashboard 
                onNavigate={(tab, date) => {
                  if (tab === 'schedule') navigateToSchedule(date);
                  else setActiveTab(tab as any);
                }} 
                currentUser={currentStaffUser!} 
              />
            )}
            {activeTab === 'applicants' && <ApplicantList applicants={applicants} currentUser={currentStaffUser!} />}
            {activeTab === 'priority' && <ApplicantList applicants={applicants} currentUser={currentStaffUser!} isPriorityMode={true} />}
            {activeTab === 'staff' && <StaffList staff={staff} currentUser={currentStaffUser!} />}
            {activeTab === 'workdays' && <WorkDayCalendar workDays={workDays} currentUser={currentStaffUser!} />}
            {activeTab === 'schedule' && <ScheduleView applicants={applicants} staff={staff} workDays={workDays} schedules={schedules} programs={programs} currentUser={currentStaffUser!} initialDate={selectedScheduleDate} />}
            {activeTab === 'programs' && <ProgramManagement programs={programs} schedules={schedules} currentUser={currentStaffUser!} />}
            {activeTab === 'active_tasks' && <ActiveTasksTracker currentUser={currentStaffUser!} />}
            {activeTab === 'completed' && <CompletedCleanings applicants={applicants} staff={staff} schedules={schedules} currentUser={currentStaffUser!} />}
            {activeTab === 'stats' && <Statistics currentUser={currentStaffUser!} onNavigate={navigateToSchedule} />}
            {activeTab === 'audit' && <AuditLogView />}
            {activeTab === 'users' && currentStaffUser?.isSuperAdmin && <UserManager currentUser={currentStaffUser!} />}
            {activeTab === 'docs' && <Documentation />}
            {activeTab === 'backup' && <BackupManager user={firebaseUser} />}
          </div>
        </div>
      </main>

      {/* ======================================================== */}
      {/* MOBILE BOTTOM NAVIGATION (Thumb Zone Optimized) */}
      {/* ======================================================== */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-[72px] bg-white border-t border-slate-200 shadow-[0_-10px_20px_rgba(0,0,0,0.02)] z-40 px-2 flex items-center justify-around pb-safe">
        {mobileTabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className="flex flex-col items-center justify-center w-16 h-14 gap-1 relative"
            >
              {isActive && (
                <div className="absolute top-0 w-8 h-1 bg-blue-600 rounded-b-full -mt-[1px]"></div>
              )}
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-400'}`}>
                <tab.icon className={`w-5 h-5 ${isActive ? 'fill-blue-100' : ''}`} />
              </div>
              <span className={`text-[9px] font-bold tracking-tight ${isActive ? 'text-blue-600' : 'text-slate-500'}`}>
                {tab.label}
              </span>
            </button>
          )
        })}
        
        {/* Mobile "More" Button */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="flex flex-col items-center justify-center w-16 h-14 gap-1 relative"
        >
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 active:bg-slate-100">
            <MoreHorizontal className="w-5 h-5" />
          </div>
          <span className="text-[9px] font-bold tracking-tight text-slate-500">
            Menü
          </span>
        </button>
      </nav>

    </div>
  );
}
