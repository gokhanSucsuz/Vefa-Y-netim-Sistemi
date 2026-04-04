/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbLocal } from './db';
import { Users, Calendar, ClipboardList, BookOpen, Briefcase, Building2, LayoutDashboard, CheckCircle2, Loader2, AlertCircle, TrendingUp } from 'lucide-react';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applicants' | 'staff' | 'workdays' | 'schedule' | 'programs' | 'completed' | 'docs' | 'stats'>('dashboard');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [userEmail, setUserEmail] = useState<string | undefined>(undefined);

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
    <div className="min-h-screen bg-gray-50 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="w-full lg:w-72 bg-white border-b lg:border-r border-gray-200 flex flex-col">
        <div className="p-6 border-b border-gray-100">
          <div className="flex items-start gap-3 mb-1">
            <div className="bg-blue-600 p-2 rounded-lg shrink-0">
              <Building2 className="text-white w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-sm text-gray-900 block leading-tight">Edirne Merkez SYDV</span>
              <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">Vefa Yönetim Sistemi</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'dashboard' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Genel Durum
          </button>
          <button
            onClick={() => setActiveTab('applicants')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'applicants' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Users className="w-5 h-5" />
            Müracaatçı Listesi
          </button>
          <button
            onClick={() => setActiveTab('staff')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'staff' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Briefcase className="w-5 h-5" />
            Personel Listesi
          </button>
          <button
            onClick={() => setActiveTab('workdays')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'workdays' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Calendar className="w-5 h-5" />
            İş Günleri
          </button>
          <button
            onClick={() => setActiveTab('schedule')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'schedule' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <ClipboardList className="w-5 h-5" />
            Program Planlama
          </button>
          <button
            onClick={() => setActiveTab('programs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'programs' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <Calendar className="w-5 h-5" />
            Yapılan Programlar
          </button>
          <button
            onClick={() => setActiveTab('completed')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'completed' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <CheckCircle2 className="w-5 h-5" />
            Tamamlanan Temizlikler
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'stats' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <TrendingUp className="w-5 h-5" />
            İstatistik ve Raporlar
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'docs' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <BookOpen className="w-5 h-5" />
            Kullanım Kılavuzu
          </button>
        </nav>

        <div className="p-6 border-t border-gray-100">
          <BackupManager onAuthChange={handleAuthChange} />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-6xl mx-auto">
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
