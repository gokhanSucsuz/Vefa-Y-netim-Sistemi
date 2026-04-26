import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { dbLocal } from '../db';
import { Applicant, Staff, Schedule, SystemUser } from '../types';
import { format, parseISO, isToday, isSameDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import { 
  MapPin, Clock, CheckCircle2, Play, Square, 
  User, Users, Calendar, AlertCircle, Route,
  ChevronRight, LogOut, Navigation, Info, Search
} from 'lucide-react';
import { logAction } from '../services/auditService';
import { formatPhone } from '../lib/format';

interface Props {
  currentUser: SystemUser;
  onLogout: () => void;
}

export default function StaffPanel({ currentUser, onLogout }: Props) {
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [activeVisitId, setActiveVisitId] = useState<string | null>(null);
  const [visitNotes, setVisitNotes] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [revealedItems, setRevealedItems] = useState<Set<string>>(new Set());
  const [showLocationMap, setShowLocationMap] = useState<{ lat: number, lng: number, name: string } | null>(null);

  // Get staff record matching this system user
  const staff = useLiveQuery(() => dbLocal.staff.toArray()) || [];
  const myStaffRecord = useMemo(() => staff.find(s => s.tcNo === currentUser.tcNo), [staff, currentUser.tcNo]);
  
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];
  const applicants = useLiveQuery(() => dbLocal.applicants.toArray()) || [];

  const isTodayDate = useMemo(() => isToday(parseISO(selectedDate)), [selectedDate]);

  // Filter schedules where I am assigned
  const myAssignmentsByDate = useMemo(() => {
    if (!myStaffRecord) return new Map<string, any[]>();
    
    const map = new Map<string, any[]>();
    schedules.forEach(s => {
      const myItems = s.assignments.filter(a => (a.staffIds || []).includes(myStaffRecord.id!));
      if (myItems.length > 0) {
        map.set(s.date, myItems.map(item => ({
          ...item,
          applicant: applicants.find(app => app.id === item.applicantId)
        })));
      }
    });
    return map;
  }, [schedules, myStaffRecord, applicants]);

  const assignmentDates = useMemo(() => Array.from(myAssignmentsByDate.keys()).sort(), [myAssignmentsByDate]);

  useEffect(() => {
    if (assignmentDates.length > 0 && !assignmentDates.includes(selectedDate)) {
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const nextDate = assignmentDates.find(d => d >= todayStr) || assignmentDates[0];
        setSelectedDate(nextDate);
    }
  }, [assignmentDates, selectedDate]);

  const currentAssignments = myAssignmentsByDate.get(selectedDate) || [];
  const partner = useMemo(() => {
    if (!myStaffRecord || !myStaffRecord.partnerId) return null;
    return staff.find(s => s.id === myStaffRecord.partnerId);
  }, [myStaffRecord, staff]);

  const toggleReveal = (id: string) => {
    const newItems = new Set(revealedItems);
    if (newItems.has(id)) newItems.delete(id);
    else newItems.add(id);
    setRevealedItems(newItems);
  };

  const handleStartVisit = async (applicantId: string) => {
    if (!isTodayDate) {
      alert('Sadece bugün için temizlik başlatabilirsiniz.');
      return;
    }
    
    const schedule = schedules.find(s => s.date === selectedDate);
    if (!schedule) return;

    try {
      const updatedAssignments = schedule.assignments.map(a => {
        if (a.applicantId === applicantId) {
          const myApproval = a.approvals?.find(apr => apr.staffId === myStaffRecord?.id);
          if (myApproval) return a; // Already started/finished by me

          const newApproval = {
            staffId: myStaffRecord!.id!,
            date: new Date().toISOString(),
            startTime: new Date().toISOString()
          };
          return {
            ...a,
            approvals: [...(a.approvals || []), newApproval]
          };
        }
        return a;
      });

      await dbLocal.schedules.update(schedule.id!, { assignments: updatedAssignments });
      setActiveVisitId(applicantId);
      setVisitNotes('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleFinishVisit = async () => {
    if (!activeVisitId || !myStaffRecord) return;
    if (!isTodayDate) {
      alert('Sadece bugün için işlem yapabilirsiniz.');
      return;
    }

    setIsProcessing(true);
    try {
      const schedule = schedules.find(s => s.date === selectedDate);
      if (!schedule) return;

      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 5000 });
      }).catch(() => null); // Allow finishing without GPS if it fails, but try to get it

      const updatedAssignments = schedule.assignments.map(a => {
        if (a.applicantId === activeVisitId) {
          const otherApprovals = (a.approvals || []).filter(apr => apr.staffId !== myStaffRecord.id);
          const myOldApproval = (a.approvals || []).find(apr => apr.staffId === myStaffRecord.id);
          
          const myFinalApproval = {
            ...myOldApproval,
            staffId: myStaffRecord.id!,
            date: new Date().toISOString(),
            endTime: new Date().toISOString(),
            note: visitNotes,
            lat: position?.coords.latitude,
            lng: position?.coords.longitude
          };

          const allApprovals = [...otherApprovals, myFinalApproval];
          
          // Check if ALL assigned staff have approved
          // If a partner is assigned but not present in staffIds (weird case), we trust staffIds
          const isFullyCompleted = allApprovals.filter(apr => apr.endTime).length >= a.staffIds.length;

          return {
            ...a,
            approvals: allApprovals,
            isCompleted: isFullyCompleted,
            completionDate: isFullyCompleted ? new Date().toISOString() : a.completionDate,
            completionNote: isFullyCompleted ? (a.completionNote ? a.completionNote + " | " + visitNotes : visitNotes) : a.completionNote
          };
        }
        return a;
      });

      const targetAssignment = updatedAssignments.find(a => a.applicantId === activeVisitId);
      const isVisitFullyCompleted = targetAssignment?.isCompleted;

      await dbLocal.schedules.update(schedule.id!, { assignments: updatedAssignments });
      
      const applicant = applicants.find(app => app.id === activeVisitId);
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Ziyaret Onayı', 
        `${applicant?.name} ${applicant?.surname} ziyareti onaylandı. ${isVisitFullyCompleted ? 'Tamamlandı' : 'Beklemede'}`);

      alert(isVisitFullyCompleted ? 'Ziyaret her iki personel tarafından onaylandı ve tamamlandı.' : 'Onayınız kaydedildi. Partnerinizin onayı bekleniyor.');
      setActiveVisitId(null);
      setVisitNotes('');
    } catch (err) {
      console.error(err);
      alert('Bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const markers = useMemo(() => {
    return currentAssignments
      .map(a => a.applicant)
      .filter((app): app is Applicant => app !== undefined && app !== null)
      .map((app, i) => {
        const lat = (app.lat !== undefined && app.lat !== null && !isNaN(Number(app.lat))) 
          ? Number(app.lat) 
          : (41.675 + (i * 0.002));
        const lng = (app.lng !== undefined && app.lng !== null && !isNaN(Number(app.lng))) 
          ? Number(app.lng) 
          : (26.570 + (i * 0.002));

        return {
          pos: [lat, lng] as [number, number],
          name: `${app.name} ${app.surname}`
        };
      });
  }, [currentAssignments]);

  if (!myStaffRecord) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 max-w-sm">
          <AlertCircle className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Personel Kaydı Bulunamadı</h2>
          <p className="text-gray-500 text-sm mb-6">Sistem kullanıcı bilgileriniz ile eşleşen bir saha personeli kaydı bulunamadı. Lütfen yönetici ile iletişime geçin.</p>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 bg-red-50 text-red-600 py-3 rounded-xl font-bold">
            <LogOut className="w-5 h-5" /> Çıkış Yap
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20">
      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-[100] px-4 py-4">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-blue-600 w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900 leading-none mb-1">{myStaffRecord.name} {myStaffRecord.surname}</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Saha Personeli Paneli</p>
            </div>
          </div>
          <button onClick={onLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-4">
        {/* Date Selector */}
        <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3 block">Görev Tarihi Seçin</label>
          <div className="flex overflow-x-auto gap-2 pb-2 scrollbar-hide">
            {assignmentDates.length > 0 ? assignmentDates.map(date => (
              <button
                key={date}
                onClick={() => setSelectedDate(date)}
                className={`shrink-0 px-4 py-2 rounded-2xl text-xs font-bold transition-all ${selectedDate === date ? 'bg-blue-600 text-white shadow-md shadow-blue-100' : 'bg-slate-50 text-slate-500 border border-slate-100'}`}
              >
                {format(parseISO(date), 'dd MMM', { locale: tr })}
              </button>
            )) : (
              <p className="text-xs text-slate-400 font-medium py-2 italic font-mono uppercase tracking-tighter">Henüz görev atanmamış</p>
            )}
          </div>
        </div>

        {/* Team Info */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-5 rounded-3xl text-white shadow-xl shadow-blue-100/50">
          <div className="flex items-center gap-3 mb-4">
            <Users className="w-5 h-5 text-blue-200" />
            <h3 className="font-bold text-sm">Günün Takım Arkadaşı</h3>
          </div>
          <div className="flex items-center gap-3 bg-white/10 p-3 rounded-2xl backdrop-blur-sm border border-white/10">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-white font-black">
              {partner?.name ? partner.name[0] : '?'}
            </div>
            <div>
              <p className="font-bold text-sm tracking-tight">{partner ? `${partner.name} ${partner.surname}` : 'Partner Tanımlanmamış'}</p>
              <p className="text-[10px] text-blue-100 font-medium uppercase tracking-widest">{partner ? formatPhone(partner.phone) : '-'}</p>
            </div>
            {partner && (
               <a href={`tel:${partner.phone}`} className="ml-auto w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center hover:bg-white/30 transition-all">
                  <Navigation className="w-4 h-4" />
               </a>
            )}
          </div>
        </div>

        {/* Assignments List */}
        <div className="space-y-3">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1">
            <Calendar className="w-3.5 h-3.5" />
            Günlük Ziyaret Listesi ({currentAssignments.length})
          </h3>
          
          {currentAssignments.length > 0 ? currentAssignments.map((a, idx) => {
            const applicant = a.applicant as Applicant;
            const isSelected = activeVisitId === applicant.id;
            const isPast = selectedDate < format(new Date(), 'yyyy-MM-dd');
            const isFutureDate = selectedDate > format(new Date(), 'yyyy-MM-dd');
            
            const myApproval = a.approvals?.find(apr => apr.staffId === myStaffRecord.id);
            const isApprovedByMe = !!(myApproval && myApproval.endTime);
            const isStartedByMe = !!(myApproval && myApproval.startTime && !myApproval.endTime);
            
            const isCompleted = a.isCompleted;
            const canStart = !isApprovedByMe && !isPast && !isFutureDate && !isSelected;

            return (
              <div key={idx} className={`bg-white rounded-3xl border border-slate-100 overflow-hidden transition-all shadow-sm ${isSelected || isStartedByMe ? 'ring-2 ring-blue-500 ring-offset-2 scale-[1.02]' : ''}`}>
                <div className="p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black shadow-sm ${isCompleted ? 'bg-emerald-500 text-white' : isApprovedByMe ? 'bg-blue-100 text-blue-600' : 'bg-slate-900 text-white'}`}>
                        {idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900 text-sm leading-none mb-1">{applicant.name} {applicant.surname}</h4>
                        <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">{applicant.neighborhood}</p>
                      </div>
                    </div>
                    {isCompleted ? (
                      <div className="flex items-center gap-2">
                        {a.approvals?.some(apr => apr.lat && apr.lng) && (
                          <button 
                            onClick={() => {
                              const apr = a.approvals?.find(p => p.lat && p.lng);
                              if (apr && apr.lat && apr.lng) {
                                setShowLocationMap({ 
                                  lat: apr.lat, 
                                  lng: apr.lng, 
                                  name: `${applicant.name} ${applicant.surname}` 
                                });
                              }
                            }}
                            className="bg-blue-50 text-blue-600 p-1.5 rounded-lg border border-blue-100 hover:bg-blue-100 transition-all"
                            title="Konumu Gör"
                          >
                            <MapPin className="w-4 h-4" />
                          </button>
                        )}
                        <div className="bg-emerald-50 text-emerald-600 p-1.5 rounded-lg flex items-center gap-1">
                          <CheckCircle2 className="w-4 h-4" />
                        </div>
                      </div>
                    ) : isApprovedByMe ? (
                      <div className="bg-blue-50 text-blue-600 p-1.5 rounded-lg flex items-center gap-1 text-[10px] font-bold">
                        ONAYINIZ ALINDI
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-start gap-2 text-xs text-slate-500">
                      <MapPin className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                      <span className="flex-1 leading-relaxed">
                        {applicant.address}
                      </span>
                    </div>
                  </div>

                  {canStart && (
                    <button 
                      onClick={() => handleStartVisit(applicant.id!)}
                      className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-50 text-blue-600 py-3 rounded-2xl text-xs font-bold border border-blue-100 hover:bg-blue-100 transition-all uppercase tracking-widest"
                    >
                      <Play className="w-4 h-4 fill-current" /> {isStartedByMe ? 'Devam Et' : 'Temizliği Başlat'}
                    </button>
                  )}

                  {(isSelected || isStartedByMe) && (
                    <div className="mt-4 p-4 bg-slate-50 rounded-2xl space-y-3 border border-slate-100">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">Temizlik Notları / Açıklama</label>
                        <textarea
                          placeholder="Yapılan işlemler, hane durumu vb..."
                          value={visitNotes}
                          onChange={e => setVisitNotes(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all h-20"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => setActiveVisitId(null)}
                          className="flex-1 py-3 text-xs font-bold text-slate-400 uppercase tracking-widest"
                        >
                          İptal
                        </button>
                        <button 
                          onClick={handleFinishVisit}
                          disabled={isProcessing}
                          className="flex-[2] flex items-center justify-center gap-2 bg-emerald-500 text-white py-3 rounded-xl text-xs font-bold shadow-lg shadow-emerald-100 active:scale-95 transition-all uppercase tracking-widest"
                        >
                          {isProcessing ? <Clock className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4 fill-current" />}
                          Temizliği Bitir ve Onayla
                        </button>
                      </div>
                      <div className="flex items-center gap-2 text-[9px] text-amber-600 font-bold justify-center">
                        <Navigation className="w-3 h-3" />
                        KONUMUNUZ KAYDEDİLECEKTİR
                      </div>
                    </div>
                  )}

                  {isCompleted && (
                    <div className="mt-3 text-[10px] text-slate-400 font-bold bg-slate-50 p-2 rounded-xl border border-slate-100 flex items-center gap-2">
                       <Clock className="w-3.5 h-3.5" />
                       Tamamlanma: {format(parseISO(a.completionDate!), 'HH:mm - dd.MM.yyyy')}
                    </div>
                  )}
                </div>
              </div>
            );
          }) : (
            <div className="bg-white p-12 rounded-3xl border border-slate-100 text-center">
               <Calendar className="w-12 h-12 text-slate-100 mx-auto mb-4" />
               <p className="text-slate-400 text-sm font-bold uppercase tracking-widest">Bu tarihte göreviniz bulunmuyor</p>
            </div>
          )}
        </div>

        {/* Map View */}
        {markers.length > 0 && (
          <div className="bg-white p-2 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-50 mb-2">
              <Route className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Günün Rotası</h3>
            </div>
            <div className="p-4 grid gap-2">
               <a 
                 href={`https://www.google.com/maps/dir/${markers.map(m => `${m.pos[0]},${m.pos[1]}`).join('/')}`}
                 target="_blank"
                 rel="noreferrer"
                 className="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-sm py-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors border border-blue-100"
               >
                 <Route className="w-6 h-6" />
                 Tüm Rota İçin Yol Tarifi Al
               </a>
               <p className="text-center text-[10px] text-slate-400">Rotadaki {markers.length} noktayı Google Haritalar üzerinde görüntüleyebilirsiniz.</p>
            </div>
          </div>
        )}
      </main>

      {showLocationMap && (
          <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowLocationMap(null)}>
            <div className="bg-white w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl relative" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                 <div>
                    <h3 className="font-bold text-slate-800 text-sm">{showLocationMap.name}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Temizlik Konumu</p>
                 </div>
                 <button onClick={() => setShowLocationMap(null)} className="p-2 bg-white rounded-xl shadow-sm text-slate-400 hover:text-slate-600 transition-all border border-slate-100">
                    <AlertCircle className="w-5 h-5 text-slate-300" />
                 </button>
              </div>
              <div className="h-64 sm:h-80 bg-slate-100 relative">
                 <iframe
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    style={{ border: 0 }}
                    src={`https://maps.google.com/maps?q=${showLocationMap.lat},${showLocationMap.lng}&hl=tr&z=15&output=embed`}
                    allowFullScreen
                  />
                  <div className="absolute bottom-4 left-0 right-0 px-4">
                    <a 
                      href={`https://www.google.com/maps?q=${showLocationMap.lat},${showLocationMap.lng}`}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full bg-white shadow-xl py-3 rounded-2xl flex items-center justify-center gap-2 text-blue-600 font-bold text-xs ring-1 ring-slate-100 hover:bg-slate-50 transition-colors"
                    >
                      <MapPin className="w-4 h-4" /> Google Haritalarda Aç
                    </a>
                  </div>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}


