import React, { useMemo, useEffect } from 'react';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { dbLocal } from '../db';
import { format } from 'date-fns';
import { Applicant, Staff, Schedule } from '../types';
import { Users, Clock, CheckCircle2, Play, AlertCircle, MapPin, Navigation } from 'lucide-react';
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export default function ActiveTasksTracker() {
  const staff = useLiveQuery(() => dbLocal.staff.toArray()) || [];
  const applicants = useLiveQuery(() => dbLocal.applicants.toArray()) || [];
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaySchedule = schedules.find(s => s.date === todayStr);

  // Auto-fix inconsistent active tasks (multiple active tasks for same person or team mismatch)
  useEffect(() => {
    if (!todaySchedule || !todaySchedule.assignments) return;

    let modified = false;
    const assignments = [...todaySchedule.assignments];

    // Find the primary active task per team (first one that has a started but not ended approval)
    const teamActiveAssignmentIds: Record<string, string> = {};

    assignments.forEach(a => {
      const teamKey = [...(a.staffIds || [])].sort().join(',');
      const isActive = a.approvals?.some(apr => apr.startTime && !apr.endTime);
      
      if (isActive) {
        if (!teamActiveAssignmentIds[teamKey]) {
          teamActiveAssignmentIds[teamKey] = a.applicantId;
        } else if (teamActiveAssignmentIds[teamKey] !== a.applicantId) {
          // Team is already active on another task. We must cancel this one's active status.
          a.approvals = a.approvals?.map(apr => {
            if (apr.startTime && !apr.endTime) {
              modified = true;
              return { ...apr, startTime: undefined } as any; // Revert start
            }
            return apr;
          }).filter(apr => apr.startTime || apr.endTime || apr.date); // clean empty
        }
      }
    });

    if (modified && todaySchedule.id) {
      dbLocal.schedules.update(todaySchedule.id, { assignments }).catch(console.error);
    }
  }, [todaySchedule]);

  const activeAssignments = useMemo(() => {
    if (!todaySchedule) return [];
    
    // Calculate timing labels (Sabah / Öğleden Sonra) based on team's tasks
    const teamTasksCount: Record<string, number> = {};
    const teamTasksIndex: Record<string, number> = {};
    
    todaySchedule.assignments.forEach(a => {
      const teamKey = [...(a.staffIds || [])].sort().join(',');
      teamTasksCount[teamKey] = (teamTasksCount[teamKey] || 0) + 1;
    });

    return todaySchedule.assignments.map(a => {
      const applicant = applicants.find(app => app.id === a.applicantId);
      const staffMembers = (a.staffIds || []).map(id => staff.find(s => s.id === id)).filter(Boolean) as Staff[];
      
      const teamKey = [...(a.staffIds || [])].sort().join(',');
      const tIndex = teamTasksIndex[teamKey] || 0;
      teamTasksIndex[teamKey] = tIndex + 1;

      let timingLabel = '';
      if (teamTasksCount[teamKey] === 2) {
        timingLabel = tIndex === 0 ? 'Sabah' : 'Öğleden Sonra';
      }

      // Calculate overall status
      const totalStaffCount = staffMembers.length;
      const startedCount = a.approvals?.filter(apr => apr.startTime && !apr.endTime).length || 0;
      const finishedCount = a.approvals?.filter(apr => apr.endTime).length || 0;

      let status: 'not_started' | 'in_progress' | 'completed' = 'not_started';
      if (a.isCompleted || finishedCount >= totalStaffCount) {
        status = 'completed';
      } else if (startedCount > 0 || finishedCount > 0) {
        status = 'in_progress';
      }

      const activeStaffApprovals = a.approvals || [];
      const latestCoord = activeStaffApprovals.reverse().find(apr => apr.lat && apr.lng);
      
      const lat = latestCoord?.lat || applicant?.lat;
      const lng = latestCoord?.lng || applicant?.lng;

      return {
        assignment: a,
        applicant,
        staffMembers,
        status,
        approvals: activeStaffApprovals,
        lat,
        lng,
        timingLabel,
      };
    });
  }, [todaySchedule, applicants, staff]);

  const mapMarkers = activeAssignments
    .filter(a => a.lat && a.lng && a.applicant)
    .map(a => ({
      ...a,
      pos: [a.lat!, a.lng!] as [number, number]
    }));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">Aktif Saha Görevleri</h2>
          <p className="text-slate-500 font-medium">Sahadaki personelin anlık durumlarını ve konumlarını takip edin.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column: List of today's tasks and their staff status */}
        <div className="xl:col-span-1 space-y-4 max-h-[80vh] overflow-y-auto pr-2 custom-scrollbar">
          {!todaySchedule && (
            <div className="bg-white p-8 rounded-3xl border border-slate-100 text-center">
              <Clock className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 font-bold mb-2">Bugün İçin Plan Bulunmuyor</p>
            </div>
          )}

          {activeAssignments.map((task, idx) => (
            <div key={idx} className="bg-white rounded-3xl border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-900">{task.applicant?.name} {task.applicant?.surname}</h3>
                    {task.timingLabel && (
                      <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest ${task.timingLabel === 'Sabah' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                        {task.timingLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1 mt-1">
                    <MapPin className="w-3 h-3" /> {task.applicant?.neighborhood || task.applicant?.address}
                  </p>
                </div>
                <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                  task.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                  task.status === 'in_progress' ? 'bg-blue-50 text-blue-600' : 'bg-slate-100 text-slate-500'
                }`}>
                  {task.status === 'completed' ? 'Tamamlandı' : task.status === 'in_progress' ? 'Devam Ediyor' : 'Başlamadı'}
                </div>
              </div>

              <div className="space-y-2 mt-4 bg-slate-50 rounded-2xl p-3 border border-slate-100">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mb-2">
                  <Users className="w-3.5 h-3.5" /> Atanan Personel
                </p>
                {task.staffMembers.map(staffMember => {
                  const staffApproval = task.approvals.find(apr => apr.staffId === staffMember.id);
                  const isStarted = !!staffApproval?.startTime;
                  const isFinished = !!staffApproval?.endTime;
                  
                  return (
                    <div key={staffMember.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2 bg-white rounded-xl border border-slate-100">
                      <span className="text-xs font-bold text-slate-700">{staffMember.name} {staffMember.surname}</span>
                      <div className="flex items-center gap-1">
                        {isFinished ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg w-fit">
                              <CheckCircle2 className="w-3 h-3" /> BİTİRDİ
                            </span>
                            {(staffApproval?.startTime || staffApproval?.endTime) && (
                              <span className="text-[9px] text-emerald-700 font-medium">
                                {staffApproval.startTime ? new Date(staffApproval.startTime).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'}) : '--:--'} 
                                {' - '}
                                {staffApproval.endTime ? new Date(staffApproval.endTime).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                              </span>
                            )}
                          </div>
                        ) : isStarted ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className="flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-lg w-fit animate-pulse">
                              <Play className="w-3 h-3" /> İŞLEMDE
                            </span>
                            {staffApproval?.startTime && (
                              <span className="text-[9px] text-blue-700 font-medium">
                                Başlangıç: {new Date(staffApproval.startTime).toLocaleTimeString('tr-TR', {hour: '2-digit', minute:'2-digit'})}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-lg w-fit">
                            <Clock className="w-3 h-3" /> BEKLİYOR
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Right Column: Live Map */}
        <div className="xl:col-span-2 bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm h-[60vh] xl:h-[80vh] relative">
          <div className="absolute top-4 left-4 z-10 bg-white/90 backdrop-blur-sm p-3 rounded-2xl shadow-xl border border-slate-100/50">
            <h4 className="text-xs font-bold text-slate-900 flex items-center gap-2 mb-2">
              <Navigation className="w-4 h-4 text-blue-600" />
              Saha Canlı Görünüm
            </h4>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Tamamlandı
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" /> Devam Ediyor
              </div>
              <div className="flex items-center gap-2 text-[10px] font-bold text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-400" /> Başlamadı
              </div>
            </div>
          </div>

          <Map
            mapLib={maplibregl}
            initialViewState={{
              longitude: mapMarkers[0]?.lng || 26.570,
              latitude: mapMarkers[0]?.lat || 41.675,
              zoom: 13
            }}
            mapStyle="https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
          >
            <NavigationControl position="bottom-right" />
            
            {mapMarkers.map((marker, i) => (
              <Marker 
                key={i}
                longitude={marker.lng!} 
                latitude={marker.lat!}
                anchor="bottom"
              >
                <div className="relative group cursor-pointer">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white shadow-xl border-2 border-white 
                    ${marker.status === 'completed' ? 'bg-emerald-500 ring-2 ring-emerald-100' :
                      marker.status === 'in_progress' ? 'bg-blue-600 ring-4 ring-blue-200 animate-pulse' : 'bg-slate-400 ring-2 ring-slate-100'
                    }`}
                  >
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-xl z-50 pointer-events-none">
                    {marker.applicant?.name} {marker.applicant?.surname}
                    <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
                  </div>
                </div>
              </Marker>
            ))}
          </Map>

          {mapMarkers.length === 0 && (
             <div className="absolute inset-0 bg-slate-50 flex items-center justify-center text-center p-8">
               <div>
                  <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 font-bold mb-2">Haritada Gösterilecek Konum Yok</p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto">Personelin sahada konum kaydetmesi veya hanelerin adres koordinatlarının dolu olması gerekmektedir.</p>
               </div>
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
