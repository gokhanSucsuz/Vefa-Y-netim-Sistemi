/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbLocal } from './db';
import { Users, Calendar, ClipboardList, BookOpen, Briefcase, Building2, LayoutDashboard } from 'lucide-react';
import ApplicantList from './components/ApplicantList';
import StaffList from './components/StaffList';
import WorkDayCalendar from './components/WorkDayCalendar';
import ScheduleView from './components/ScheduleView';
import Documentation from './components/Documentation';
import Dashboard from './components/Dashboard';

export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'applicants' | 'staff' | 'workdays' | 'schedule' | 'docs'>('dashboard');
  
  const applicants = useLiveQuery(() => dbLocal.applicants.toArray()) || [];
  const staff = useLiveQuery(() => dbLocal.staff.toArray()) || [];
  const workDays = useLiveQuery(() => dbLocal.workDays.toArray()) || [];
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];

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
            onClick={() => setActiveTab('docs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${activeTab === 'docs' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <BookOpen className="w-5 h-5" />
            Kullanım Kılavuzu
          </button>
        </nav>

        <div className="p-6 border-t border-gray-100">
          <div className="bg-blue-50 rounded-2xl p-4">
            <p className="text-xs font-bold text-blue-700 uppercase mb-1">Sistem Durumu</p>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-xs text-blue-900 font-medium">Çevrimdışı Mod (Yerel)</span>
            </div>
          </div>
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
          {activeTab === 'docs' && <Documentation />}
        </div>
      </main>
    </div>
  );
}
