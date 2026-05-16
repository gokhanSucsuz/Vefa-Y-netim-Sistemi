import { useConfirmDialog } from '../hooks/useConfirmDialog';
import toast from 'react-hot-toast';
import React, { useState, useMemo, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { dbLocal } from '../db';
import { Applicant, Staff, Schedule, SystemUser } from '../types';
import { format, parseISO, isToday, isSameDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import { 
  MapPin, Clock, CheckCircle2, Play, Square, 
  User, Users, Calendar, AlertCircle, Route,
  ChevronRight, LogOut, Navigation, Info, Search, Map as MapIcon, Smartphone,
  FileText
} from 'lucide-react';
import { logAction } from '../services/auditService';
import { formatPhone } from '../lib/format';
import { setupPdfMakeFonts } from '../lib/pdfFonts';
import { Map as MapGL, Marker, NavigationControl, Popup, useMap } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import InstallPrompt from './InstallPrompt';

function MapUpdater({ markers }: { markers: { pos: [number, number] }[] }) {
  const { current: map } = useMap();
  useEffect(() => {
    if (map && markers.length > 0) {
      try {
        const bounds = new maplibregl.LngLatBounds();
        markers.forEach(m => {
          if (m.pos && !isNaN(m.pos[0]) && !isNaN(m.pos[1])) {
            bounds.extend([m.pos[1], m.pos[0]]);
          }
        });
        map.fitBounds(bounds, { padding: 50, duration: 1000 });
      } catch (err) {
        console.error("Map bounds error:", err);
      }
    }
  }, [map, markers]);
  return null;
}

interface Props {
  currentUser: SystemUser;
  onLogout: () => void;
}

export default function StaffPanel({ currentUser, onLogout }: Props) {
  const { confirm } = useConfirmDialog();
  const [selectedDate, setSelectedDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [activeVisitId, setActiveVisitId] = useState<string | null>(() => localStorage.getItem('vefa_active_visit_id'));
  const [visitNotes, setVisitNotes] = useState<string>(() => localStorage.getItem('vefa_visit_notes') || '');
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync state to localStorage
  useEffect(() => {
    if (activeVisitId) localStorage.setItem('vefa_active_visit_id', activeVisitId);
    else localStorage.removeItem('vefa_active_visit_id');
  }, [activeVisitId]);

  useEffect(() => {
    localStorage.setItem('vefa_visit_notes', visitNotes);
  }, [visitNotes]);
  const [revealedItems, setRevealedItems] = useState<Set<string>>(new Set());
  const [showLocationMap, setShowLocationMap] = useState<{ lat: number, lng: number, name: string } | null>(null);
  const [showRouteMap, setShowRouteMap] = useState(false);

  // Get staff record matching this system user
  const staff = useLiveQuery(() => dbLocal.staff.toArray()) || [];
  const myStaffRecord = useMemo(() => staff.find(s => s.tcNo === currentUser.tcNo), [staff, currentUser.tcNo]);
  
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];
  const applicants = useLiveQuery(() => dbLocal.applicants.toArray()) || [];
  const pendingSyncCount = useLiveQuery(() => dbLocal.syncQueue.count()) || 0;
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const isTodayDate = useMemo(() => {
    try {
      const d = parseISO(selectedDate);
      return !isNaN(d.getTime()) && isToday(d);
    } catch {
      return false;
    }
  }, [selectedDate]);

  // Filter schedules where I am assigned
  const myAssignmentsByDate = useMemo(() => {
    if (!myStaffRecord || !schedules || !applicants) return new Map<string, any[]>();
    
    const map = new Map<string, any[]>();
    schedules.forEach(s => {
      if (!s.assignments) return;
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

  const formatSafe = (dateStr: string, formatStr: string, options?: any) => {
    if (!dateStr) return '-';
    try {
      const d = parseISO(dateStr);
      if (isNaN(d.getTime())) return '-';
      return format(d, formatStr, options);
    } catch {
      return '-';
    }
  };

  const toggleReveal = (id: string) => {
    const newItems = new Set(revealedItems);
    if (newItems.has(id)) newItems.delete(id);
    else newItems.add(id);
    setRevealedItems(newItems);
  };

  const handleStartVisit = async (applicantId: string) => {
    if (!isTodayDate) {
      toast.error('Sadece bugün için temizlik başlatabilirsiniz.');
      return;
    }
    
    const schedule = schedules.find(s => s.date === selectedDate);
    if (!schedule) return;

    const hasActiveTask = schedule.assignments.some(a => {
      const myApproval = a.approvals?.find(apr => apr.staffId === myStaffRecord?.id);
      return myApproval && myApproval.startTime && !myApproval.endTime;
    });

    if (hasActiveTask) {
      toast.error('Lütfen yeni bir işe başlamadan önce devam eden temizlik işinizi bitirin.');
      return;
    }

    const myAssignments = schedule.assignments.filter(a => a.staffIds.includes(myStaffRecord?.id || ''));
    const teamActiveTask = myAssignments.find(a => {
      return a.approvals?.some(apr => apr.staffId !== myStaffRecord?.id && apr.startTime && !apr.endTime);
    });

    if (teamActiveTask && teamActiveTask.applicantId !== applicantId) {
      toast.error('Ekip arkadaşınız başka bir temizlik işine başlamış. Lütfen sadece ekip arkadaşınızın başladığı temizlik işine başlayın.');
      return;
    }

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
      setVisitNotes('');
    } catch (err) {
      console.error(err);
    }
  };

  const handleFinishVisit = async (visitApplicantId: string) => {
    if (!visitApplicantId || !myStaffRecord) return;
    if (!isTodayDate) {
      toast.error('Sadece bugün için işlem yapabilirsiniz.');
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
        if (a.applicantId === visitApplicantId) {
          const otherApprovals = (a.approvals || []).filter(apr => apr.staffId !== myStaffRecord.id);
          const myOldApproval = (a.approvals || []).find(apr => apr.staffId === myStaffRecord.id);
          
          const myFinalApproval = {
            ...myOldApproval,
            staffId: myStaffRecord.id!,
            date: myOldApproval?.date || new Date().toISOString(),
            startTime: myOldApproval?.startTime || new Date().toISOString(),
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

      const targetAssignment = updatedAssignments.find(a => a.applicantId === visitApplicantId);
      const isVisitFullyCompleted = targetAssignment?.isCompleted;

      await dbLocal.schedules.update(schedule.id!, { assignments: updatedAssignments });
      
      const applicant = applicants.find(app => app.id === visitApplicantId);
      logAction(currentUser.id!, `${currentUser.name} ${currentUser.surname}`, 'Ziyaret Onayı', 
        `${applicant?.name} ${applicant?.surname} ziyareti onaylandı. ${isVisitFullyCompleted ? 'Tamamlandı' : 'Beklemede'}`);

      if (!navigator.onLine) {
        toast.success('İnternet bağlantınız zayıf. İşleminiz cihazınıza kaydedildi ve internet geldiğinde otomatik olarak merkeze gönderilecektir.');
      } else {
        toast.error(isVisitFullyCompleted ? 'Ziyaret her iki personel tarafından onaylandı ve tamamlandı.' : 'Onayınız kaydedildi. Partnerinizin onayı bekleniyor.');
      }
      
      setActiveVisitId(null);
      setVisitNotes('');
      localStorage.removeItem('vefa_active_visit_id');
      localStorage.removeItem('vefa_visit_notes');
    } catch (err) {
      console.error(err);
      toast.error('Bir hata oluştu.');
    } finally {
      setIsProcessing(false);
    }
  };

  const { markers, noLocationApplicants } = useMemo(() => {
    const validMarkers: { pos: [number, number], name: string }[] = [];
    const missing: string[] = [];

    if (!currentAssignments) return { markers: [], noLocationApplicants: [] };

    currentAssignments
      .map(a => a.applicant)
      .filter((app): app is Applicant => app !== undefined && app !== null)
      .forEach((app) => {
        const hasLat = app.lat !== undefined && app.lat !== null && !isNaN(Number(app.lat));
        const hasLng = app.lng !== undefined && app.lng !== null && !isNaN(Number(app.lng));

        if (hasLat && hasLng) {
          validMarkers.push({
            pos: [Number(app.lat), Number(app.lng)],
            name: `${app.name} ${app.surname}`
          });
        } else {
          missing.push(`${app.name} ${app.surname}`);
        }
      });

    return { markers: validMarkers, noLocationApplicants: missing };
  }, [currentAssignments]);

  const generateActivityChecklist = async (schedule: Schedule, assignment: any) => {
    await setupPdfMakeFonts();
    const applicant = applicants.find(a => a.id === assignment.applicantId);
    const assignedStaff = staff.filter(s => assignment.staffIds.includes(s.id!));
    
    // Calculate visit count
    const pastSchedulesCount = schedules.filter(s => 
      s.assignments?.some(a => a.applicantId === assignment.applicantId && a.isCompleted) &&
      s.date < schedule.date
    ).length;
    const visitCount = pastSchedulesCount + 1;

    const logoUrlRight = 'https://pbs.twimg.com/profile_images/1456143975845404674/xGjOJe4S_400x400.jpg';
    const logoUrlLeft = 'https://www.aile.gov.tr/media/4336/logo-department.svg';
    
    let logoBase64Right = '';
    let logoBase64Left = '';

    const getBase64ImageFromURL = (url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.setAttribute('crossOrigin', 'anonymous');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0);
          const dataURL = canvas.toDataURL('image/png');
          resolve(dataURL);
        };
        img.onerror = (error) => reject(error);
        img.src = url;
      });
    };

    try {
      logoBase64Right = await getBase64ImageFromURL(`https://images.weserv.nl/?url=${encodeURIComponent(logoUrlRight)}`);
    } catch (e) {
      console.error("Right Logo could not be fetched", e);
    }

    try {
      logoBase64Left = await getBase64ImageFromURL(`https://images.weserv.nl/?url=${encodeURIComponent(logoUrlLeft)}`);
    } catch (e) {
      console.error("Left Logo could not be fetched", e);
    }

    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      content: [
        {
          columns: [
            {
              width: 'auto',
              columns: [
                logoBase64Left ? { image: logoBase64Left, width: 45 } : { text: '', width: 45 },
                {
                  stack: [
                    { text: 'T.C. AİLE VE SOSYAL', color: '#C8102E', bold: true, fontSize: 8 },
                    { text: 'HİZMETLER BAKANLIĞI', color: '#C8102E', bold: true, fontSize: 8 },
                    { text: 'Sosyal Yardımlar Genel Müdürlüğü', color: '#C8102E', fontSize: 6.5, margin: [0, 1, 0, 0] }
                  ],
                  margin: [5, 2, 0, 0]
                }
              ]
            },
            { text: '', width: '*' },
            logoBase64Right ? { image: logoBase64Right, width: 45, alignment: 'right' } : { text: '', width: 45 }
          ],
          margin: [0, 0, 0, 15]
        },
        { 
          text: 'VEFA (YAŞLI EVDE BAKIM) YARDIM PROGRAMI FAALİYET KONTROL LİSTESİ', 
          style: 'mainTitle',
          alignment: 'center',
          margin: [0, 5, 0, 15]
        },
        {
          table: {
            widths: [70, 70, '*'],
            body: [
              [
                { text: 'Hane Sahibi:', bold: true, rowSpan: 3, margin: [0, 12, 0, 0] },
                { text: 'İsim Soyisim', fontSize: 7, color: '#666' },
                { text: applicant ? `${applicant.name} ${applicant.surname}` : '-', bold: true }
              ],
              [
                '',
                { text: 'Telefon', fontSize: 7, color: '#666' },
                { text: applicant?.phone || '-' }
              ],
              [
                '',
                { text: 'Adres', fontSize: 7, color: '#666' },
                { text: applicant?.address || '-', fontSize: 8 }
              ],
              [
                { text: 'Tarih:', bold: true },
                { text: format(parseISO(schedule.date), 'dd.MM.yyyy'), colSpan: 2 },
                ''
              ],
              [
                { text: 'Ziyaret:', bold: true },
                { text: `${visitCount}. ziyaret`, colSpan: 2 },
                ''
              ]
            ]
          },
          margin: [0, 0, 0, 10]
        },
        {
          table: {
            headerRows: 1,
            widths: ['*', 130, 130],
            body: [
              [
                { text: 'GÖREV', style: 'tableHeader' },
                { text: 'DURUM (Tamamlandı, Başlamadı...)', style: 'tableHeader' },
                { text: 'NOTLAR', style: 'tableHeader' }
              ],
              ...[
                'Süpürme', 'Silme', 'Toz Alma', 'Yemek Pişirme', 'Banyo Yaptırma', 
                'Saç-Sakal Tıraşı', 'Kişisel Temizlik-Tırnak Kesimi', 'Mutfak Temizliği',
                'Bulaşıkların Yıkanması', 'Banyo Temizliği', 'Oda Temizliği (Halı, koltuk vb.)',
                'Yaşlı/Engelli Yatak Temizliği ve Nevresim Değişimi', 'Çamaşır Yıkama',
                'Ütü', 'Cam Silme', 'Perde Yıkama', 'Alışveriş', 'Hane Önü Temizliği'
              ].map(task => [
                { text: task, margin: [0, 1, 0, 1] },
                '',
                ''
              ]),
              [
                { text: 'İhtiyaç Tespiti', margin: [0, 6, 0, 6], bold: true },
                { text: '', colSpan: 2 },
                ''
              ],
              [
                { text: 'Görevlinin Genel Görüşü', margin: [0, 6, 0, 6], bold: true },
                { text: '', colSpan: 2 },
                ''
              ]
            ]
          }
        },
        {
          table: {
            widths: [100, '*', '*'],
            body: [
              [
                { text: 'PERSONEL', bold: true, rowSpan: 2, margin: [0, 15, 0, 0] },
                {
                  stack: [
                    { text: 'Personel Adı Soyadı', fontSize: 7, color: '#666' },
                    { text: assignedStaff[0] ? `${assignedStaff[0].name} ${assignedStaff[0].surname}` : '-', margin: [0, 2, 0, 2] },
                    { text: 'İmza', fontSize: 7, color: '#666', margin: [0, 10, 0, 0] }
                  ]
                },
                {
                  stack: [
                    { text: 'Personel Adı Soyadı', fontSize: 7, color: '#666' },
                    { text: assignedStaff[1] ? `${assignedStaff[1].name} ${assignedStaff[1].surname}` : '-', margin: [0, 2, 0, 2] },
                    { text: 'İmza', fontSize: 7, color: '#666', margin: [0, 10, 0, 0] }
                  ]
                }
              ],
              ['', '', ''],
              [
                { text: 'İŞE BAŞLAMA SAATİ\nİŞİ BİTİRME SAATİ', bold: true, fontSize: 8 },
                {
                  stack: [
                    { text: 'İşe Başlama: ' + (assignedStaff[0] && assignment.approvals?.find((ap:any) => ap.staffId === assignedStaff[0].id)?.startTime ? format(parseISO(assignment.approvals.find((ap:any) => ap.staffId === assignedStaff[0].id).startTime), 'HH:mm') : '____:____') },
                    { text: 'İşi Bitirme: ' + (assignedStaff[0] && assignment.approvals?.find((ap:any) => ap.staffId === assignedStaff[0].id)?.endTime ? format(parseISO(assignment.approvals.find((ap:any) => ap.staffId === assignedStaff[0].id).endTime), 'HH:mm') : '____:____') }
                  ],
                  fontSize: 8
                },
                {
                  stack: [
                    { text: 'İşe Başlama: ' + (assignedStaff[1] && assignment.approvals?.find((ap:any) => ap.staffId === assignedStaff[1].id)?.startTime ? format(parseISO(assignment.approvals.find((ap:any) => ap.staffId === assignedStaff[1].id).startTime), 'HH:mm') : '____:____') },
                    { text: 'İşi Bitirme: ' + (assignedStaff[1] && assignment.approvals?.find((ap:any) => ap.staffId === assignedStaff[1].id)?.endTime ? format(parseISO(assignment.approvals.find((ap:any) => ap.staffId === assignedStaff[1].id).endTime), 'HH:mm') : '____:____') }
                  ],
                  fontSize: 8
                }
              ]
            ]
          },
          margin: [0, 10, 0, 20]
        },
        {
          columns: [
            { text: 'Görevli\nİmza', alignment: 'center', fontSize: 8 },
            { text: 'Onaylayan\nVakıf Müdürü\nİmza', alignment: 'center', fontSize: 8 },
            { text: 'Yararlanıcı\nİmza', alignment: 'center', fontSize: 8 }
          ]
        }
      ],
      styles: {
        mainTitle: { fontSize: 11, bold: true },
        tableHeader: { bold: true, fontSize: 8, fillColor: '#f1f5f9' }
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 9
      }
    };

    const pdfMakeModule = await import('pdfmake/build/pdfmake');
    const pdfMake = pdfMakeModule.default || pdfMakeModule;
    pdfMake.createPdf(docDefinition).download(`Faaliyet_Listesi_${applicant?.name || 'Hane'}.pdf`);
  };

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
              <div className="flex items-center gap-2">
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Saha Personeli</p>
                <div className="flex items-center gap-1.5">
                  <div className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-rose-500'} animate-pulse`} />
                  <span className={`text-[9px] font-bold ${isOnline ? 'text-emerald-600' : 'text-rose-600'} uppercase`}>
                    {isOnline ? 'Çevrimiçi' : 'Çevrimdışı'}
                  </span>
                  {pendingSyncCount > 0 && (
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-black animate-bounce">
                      {pendingSyncCount} VERİ BEKLİYOR
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                // We'll dispatch a custom event to show the InstallPrompt if hidden
                window.dispatchEvent(new CustomEvent('show-install-prompt'));
              }} 
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-xl transition-all flex flex-col items-center justify-center gap-0.5"
              title="Uygulamayı İndir"
            >
              <Smartphone className="w-5 h-5" />
              <span className="text-[8px] font-bold uppercase">Yükle</span>
            </button>
            <button onClick={onLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          </div>
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
                {formatSafe(date, 'dd MMM', { locale: tr })}
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
            const applicant = a.applicant as Applicant | undefined;
            if (!applicant) return null;
            
            const isSelected = activeVisitId === applicant.id;
            const isPast = selectedDate < format(new Date(), 'yyyy-MM-dd');
            const isFutureDate = selectedDate > format(new Date(), 'yyyy-MM-dd');
            
            const myApproval = a.approvals?.find(apr => apr.staffId === myStaffRecord.id);
            const isCompleted = a.isCompleted;
            const isApprovedByMe = !!(myApproval && myApproval.endTime) || isCompleted;
            const isStartedByMe = !!(myApproval && myApproval.startTime && !myApproval.endTime) && !isCompleted;
            
            const canStart = !isApprovedByMe && !isPast && !isFutureDate && !isSelected && !isStartedByMe;

            return (
              <div key={idx} className={`bg-white rounded-3xl border border-slate-100 overflow-hidden transition-all shadow-sm ${isSelected || isStartedByMe ? 'ring-2 ring-blue-500 ring-offset-2 scale-[1.02]' : ''}`}>
                <div className="p-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 flex items-center justify-center rounded-xl text-xs font-black shadow-sm ${isCompleted ? 'bg-emerald-500 text-white' : isApprovedByMe ? 'bg-blue-100 text-blue-600' : 'bg-slate-900 text-white'}`}>
                        {idx + 1}
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-900 text-sm leading-none">{applicant.name} {applicant.surname}</h4>
                          {currentAssignments.length === 2 && idx === 0 && <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">Sabah</span>}
                          {currentAssignments.length === 2 && idx === 1 && <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest">Öğleden S.</span>}
                        </div>
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
                      <Play className="w-4 h-4 fill-current" /> Başlat
                    </button>
                  )}

                  {isStartedByMe && !isSelected && (
                    <div className="mt-4 p-4 bg-amber-50 rounded-2xl border border-amber-100 flex flex-col gap-3">
                      <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-widest justify-center">
                        <Clock className="w-4 h-4 animate-pulse" />
                        Temizlik Devam Ediyor
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={async () => {
                            if ((await confirm({ message: 'Temizliğe başlamayı iptal etmek istediğinize emin misiniz?', type: "warning" }))) {
                              try {
                                const schedule = schedules.find(s => s.date === selectedDate);
                                if (!schedule) return;
                                const updatedAssignments = schedule.assignments.map(a => {
                                  if (a.applicantId === applicant.id) {
                                    return {
                                      ...a,
                                      approvals: (a.approvals || []).filter(apr => apr.staffId !== myStaffRecord.id)
                                    };
                                  }
                                  return a;
                                });
                                await dbLocal.schedules.update(schedule.id!, { assignments: updatedAssignments });
                              } catch (err) {}
                            }
                          }}
                          className="flex-1 py-3 text-[10px] font-bold text-rose-500 bg-white border border-rose-200 hover:bg-rose-50 hover:border-rose-300 rounded-xl transition-all uppercase tracking-widest"
                        >
                          İptal Et
                        </button>
                        <button 
                          onClick={() => setActiveVisitId(applicant.id!)}
                          className="flex-[2] flex items-center justify-center gap-2 bg-amber-500 text-white py-3 rounded-xl text-[11px] font-bold shadow-lg shadow-amber-200 active:scale-95 transition-all uppercase tracking-widest"
                        >
                          <Square className="w-4 h-4 fill-current" />
                          Temizliği Bitir
                        </button>
                      </div>
                    </div>
                  )}

                  {isSelected && (
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
                          className="flex-1 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
                        >
                          Vazgeç
                        </button>
                        <button 
                          onClick={() => handleFinishVisit(applicant.id!)}
                          disabled={isProcessing}
                          className="flex-[2] flex items-center justify-center gap-2 bg-emerald-500 text-white py-3 rounded-xl text-xs font-bold shadow-lg shadow-emerald-100 active:scale-95 transition-all uppercase tracking-widest"
                        >
                          {isProcessing ? <Clock className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                          Onayla ve Bitir
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
                       Tamamlanma: {formatSafe(a.completionDate!, 'HH:mm - dd.MM.yyyy')}
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
        {currentAssignments.length > 0 && (
          <div className="bg-white p-2 rounded-3xl border border-slate-100 shadow-sm">
            <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-50 mb-2">
              <MapIcon className="w-4 h-4 text-slate-400" />
              <h3 className="text-xs font-bold text-slate-600 uppercase tracking-widest">Günün Rotası</h3>
            </div>
            <div className="p-4 grid gap-2">
               <button 
                 onClick={() => {
                   if (markers.length === 0) {
                     toast.error('Konum adresleri kayıtlı değil');
                   } else {
                     setShowRouteMap(true);
                   }
                 }}
                 className="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold text-sm py-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-colors border border-blue-100"
               >
                 <MapIcon className="w-6 h-6" />
                 O Günkü Temizlik Yapılacak Haneleri Haritada Gör
               </button>
               {markers.length > 0 && (
                 <p className="text-center text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-2">{markers.length} hane haritada görüntülenebilir.</p>
               )}
            </div>
          </div>
        )}
      </main>

      {showRouteMap && (
          <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm" onClick={() => setShowRouteMap(false)}>
            <div className="bg-white w-full max-w-2xl rounded-3xl overflow-hidden shadow-2xl relative flex flex-col h-[80vh]" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                 <div>
                    <h3 className="font-bold text-slate-800 text-sm">Günün Rotası</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase">Tüm Haneler</p>
                 </div>
                 <button onClick={() => setShowRouteMap(false)} className="p-2 bg-white rounded-xl shadow-sm text-slate-400 hover:text-slate-600 transition-all border border-slate-100">
                    <AlertCircle className="w-5 h-5 text-slate-300" />
                 </button>
              </div>

              {noLocationApplicants.length > 0 && (
                <div className="p-3 bg-amber-50 border-b border-amber-100 text-amber-700 text-xs shrink-0 max-h-32 overflow-y-auto">
                  <div className="font-bold mb-1 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5"/> Konum Bilgisi Eksik Haneler:</div>
                  <ul className="list-disc pl-5 opacity-90 font-medium">
                    {noLocationApplicants.map((name, idx) => (
                      <li key={idx}>{name}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex-1 bg-slate-100 relative min-h-0">
                  <MapGL
                    mapLib={maplibregl}
                    initialViewState={{
                      longitude: markers[0]?.pos[1] || 26.570,
                      latitude: markers[0]?.pos[0] || 41.675,
                      zoom: 12
                    }}
                    mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
                  >
                    <NavigationControl position="top-right" />
                    <MapUpdater markers={markers} />
                    
                    {markers.map((marker, i) => (
                      <div key={i}>
                        <Marker 
                          longitude={marker.pos[1]} 
                          latitude={marker.pos[0]}
                          anchor="bottom"
                        >
                          <div className="relative group cursor-pointer">
                            <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-900/20 border-2 border-white ring-2 ring-blue-100">
                              <MapPin className="w-4 h-4" />
                            </div>
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-900 text-white text-[10px] font-bold px-3 py-1.5 rounded-xl whitespace-nowrap opacity-100 shadow-xl z-50">
                              {marker.name}
                              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45"></div>
                            </div>
                          </div>
                        </Marker>
                      </div>
                    ))}
                  </MapGL>
              </div>
            </div>
          </div>
      )}

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
      
      <InstallPrompt />
    </div>
  );
}


