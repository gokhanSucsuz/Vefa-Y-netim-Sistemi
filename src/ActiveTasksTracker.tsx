import toast from 'react-hot-toast';
import React, { useMemo, useEffect } from 'react';
import { useLiveQuery } from '../hooks/useLiveQuery';
import { dbLocal } from '../db';
import { format, parseISO } from 'date-fns';
import { Applicant, Staff, Schedule, SystemUser } from '../types';
import { Users, Clock, CheckCircle2, Play, AlertCircle, MapPin, Navigation, FileText, CheckSquare } from 'lucide-react';
import { setupPdfMakeFonts } from '../lib/pdfFonts';
import { Map, Marker, NavigationControl } from 'react-map-gl/maplibre';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { logAction } from '../services/auditService';

interface Props {
  currentUser: SystemUser;
}

export default function ActiveTasksTracker({ currentUser }: Props) {
  const staff = useLiveQuery(() => dbLocal.staff.toArray()) || [];
  const applicants = useLiveQuery(() => dbLocal.applicants.toArray()) || [];
  const schedules = useLiveQuery(() => dbLocal.schedules.toArray()) || [];

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todaySchedule = schedules.find(s => s.date === todayStr);

  // Auto-fix inconsistent active tasks and handle 17:20 automatic completion
  useEffect(() => {
    if (!todaySchedule || !todaySchedule.assignments) return;

    let modified = false;
    let assignments = [...todaySchedule.assignments];

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

    const check1720Completion = () => {
      const now = new Date();
      if (now.getHours() > 17 || (now.getHours() === 17 && now.getMinutes() >= 20)) {
        let needsCompletion = false;
        const autoCompletedAssignments = assignments.map(a => {
          if (!a.isCompleted) {
            needsCompletion = true;
            
            const teamKey = [...(a.staffIds || [])].sort().join(',');
            const teamTasks = assignments.filter(sa => [...(sa.staffIds || [])].sort().join(',') === teamKey);
            const tIndex = teamTasks.findIndex(ta => ta.applicantId === a.applicantId);
            const isMorning = tIndex === 0;

            const targetDateObj = parseISO(todayStr);
            const startDate = new Date(targetDateObj);
            const endDate = new Date(targetDateObj);
            
            if (isMorning) {
              startDate.setHours(9, 30, 0, 0);
              endDate.setHours(11, 30, 0, 0);
            } else {
              startDate.setHours(13, 30, 0, 0);
              endDate.setHours(16, 0, 0, 0);
            }

            const approvals = (a.staffIds || []).map(staffId => {
              const existing = a.approvals?.find(apr => apr.staffId === staffId) || { staffId, date: todayStr };
              return {
                ...existing,
                startTime: startDate.toISOString(),
                endTime: endDate.toISOString()
              };
            });

            return {
              ...a,
              isCompleted: true,
              completionDate: new Date().toISOString(),
              completionNote: 'Sistem tarafından otomatik olarak tamamlandı (17:20).',
              approvals
            };
          }
          return a;
        });
        
        if (needsCompletion) {
          assignments = autoCompletedAssignments;
          modified = true;
        }
      }
      
      if (modified && todaySchedule.id) {
        dbLocal.schedules.update(todaySchedule.id, { assignments }).catch(console.error);
        modified = false; // Reset flag after save
      }
    };

    check1720Completion();
    const intervalId = setInterval(check1720Completion, 60000); // Check every minute

    return () => clearInterval(intervalId);
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

  const handleAdminComplete = async (applicantId: string) => {
    if (!todaySchedule || !todaySchedule.id) return;
    if (!confirm('Bu ziyareti tamamlandı olarak işaretlemek istediğinize emin misiniz? (Personellerin listesinden de tamamlanmış olarak düşecektir.)')) return;

    try {
      const taskData = activeAssignments.find(a => a.applicant?.id === applicantId);
      const isMorning = taskData?.timingLabel !== 'Öğleden Sonra';

      const updatedAssignments = todaySchedule.assignments.map(a => {
        if (a.applicantId === applicantId) {
          const applicant = applicants.find(p => p.id === applicantId);
          logAction(currentUser?.id || 'admin', `${currentUser?.name || 'Sistem'} ${currentUser?.surname || ''}`, 'Yönetici Tamamlama', `${todayStr} tarihindeki ${applicant?.name} ziyareti yönetici tarafından tamamlandı olarak işaretlendi.`);
          
          const startDate = new Date();
          const endDate = new Date();
          
          if (isMorning) {
            startDate.setHours(9, 30, 0, 0);
            endDate.setHours(11, 30, 0, 0);
          } else {
            startDate.setHours(13, 30, 0, 0);
            endDate.setHours(16, 0, 0, 0);
          }

          const approvals = (a.staffIds || []).map(staffId => {
            const existing = a.approvals?.find(apr => apr.staffId === staffId) || { staffId, date: todayStr };
            return {
              ...existing,
              startTime: startDate.toISOString(),
              endTime: endDate.toISOString()
            };
          });

          return {
            ...a,
            isCompleted: true,
            completionDate: new Date().toISOString(),
            completionNote: 'Yönetici tarafından tamamlandı olarak işaretlendi.',
            approvals,
          };
        }
        return a;
      });

      await dbLocal.schedules.update(todaySchedule.id, { assignments: updatedAssignments });
    } catch (error) {
      console.error('Tamamlama hatası:', error);
      toast.error('İşlem sırasında bir hata oluştu');
    }
  };

  const mapMarkers = activeAssignments
    .filter(a => a.lat && a.lng && a.applicant)
    .map(a => ({
      ...a,
      pos: [a.lat!, a.lng!] as [number, number]
    }));

  const generateDayChecklists = async () => {
    if (!todaySchedule || activeAssignments.length === 0) return;
    
    await setupPdfMakeFonts();
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

    const pages = activeAssignments.map((task, idx) => {
      const { assignment, applicant, staffMembers } = task;
      
      const pastSchedulesCount = schedules.filter(s => 
        s.assignments?.some(pa => pa.applicantId === assignment.applicantId && pa.isCompleted) &&
        s.date < todaySchedule.date
      ).length;
      const visitCount = pastSchedulesCount + 1;

      return [
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
                { text: format(new Date(), 'dd.MM.yyyy'), colSpan: 2 },
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
              ].map(t => [
                { text: t, margin: [0, 1, 0, 1] },
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
                    { text: staffMembers[0] ? `${staffMembers[0].name} ${staffMembers[0].surname}` : '-', margin: [0, 2, 0, 2] },
                    { text: 'İmza', fontSize: 7, color: '#666', margin: [0, 10, 0, 0] }
                  ]
                },
                {
                  stack: [
                    { text: 'Personel Adı Soyadı', fontSize: 7, color: '#666' },
                    { text: staffMembers[1] ? `${staffMembers[1].name} ${staffMembers[1].surname}` : '-', margin: [0, 2, 0, 2] },
                    { text: 'İmza', fontSize: 7, color: '#666', margin: [0, 10, 0, 0] }
                  ]
                }
              ],
              ['', '', ''],
              [
                { text: 'İŞE BAŞLAMA SAATİ\nİŞİ BİTİRME SAATİ', bold: true, fontSize: 8 },
                {
                  stack: [
                    { text: 'İşe Başlama: ' + (staffMembers[0] && assignment.approvals?.find((ap:any) => ap.staffId === staffMembers[0].id)?.startTime ? format(new Date(assignment.approvals.find((ap:any) => ap.staffId === staffMembers[0].id).startTime), 'HH:mm') : '____:____') },
                    { text: 'İşi Bitirme: ' + (staffMembers[0] && assignment.approvals?.find((ap:any) => ap.staffId === staffMembers[0].id)?.endTime ? format(new Date(assignment.approvals.find((ap:any) => ap.staffId === staffMembers[0].id).endTime), 'HH:mm') : '____:____') }
                  ],
                  fontSize: 8
                },
                {
                  stack: [
                    { text: 'İşe Başlama: ' + (staffMembers[1] && assignment.approvals?.find((ap:any) => ap.staffId === staffMembers[1].id)?.startTime ? format(new Date(assignment.approvals.find((ap:any) => ap.staffId === staffMembers[1].id).startTime), 'HH:mm') : '____:____') },
                    { text: 'İşi Bitirme: ' + (staffMembers[1] && assignment.approvals?.find((ap:any) => ap.staffId === staffMembers[1].id)?.endTime ? format(new Date(assignment.approvals.find((ap:any) => ap.staffId === staffMembers[1].id).endTime), 'HH:mm') : '____:____') }
                  ],
                  fontSize: 8
                }
              ]
            ]
          },
          margin: [0, 10, 0, 15]
        },
        {
          columns: [
            { text: 'Görevli\nİmza', alignment: 'center', fontSize: 8 },
            { text: 'Onaylayan\nVakıf Müdürü\nİmza', alignment: 'center', fontSize: 8 },
            { text: 'Yararlanıcı\nİmza', alignment: 'center', fontSize: 8 }
          ]
        },
        idx < activeAssignments.length - 1 ? { text: '', pageBreak: 'after' } : {}
      ];
    }).flat();

    const docDefinition: any = {
      pageSize: 'A4',
      pageMargins: [40, 40, 40, 40],
      content: pages,
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
    pdfMake.createPdf(docDefinition).download(`Gunluk_Faaliyet_Listeleri_${todayStr}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl lg:text-3xl font-extrabold text-slate-900 tracking-tight">Aktif Saha Görevleri</h2>
          <p className="text-slate-500 font-medium">Sahadaki personelin anlık durumlarını ve konumlarını takip edin.</p>
        </div>
        {todaySchedule && activeAssignments.length > 0 && (
          <button
            onClick={generateDayChecklists}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-2xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-all"
          >
            <FileText className="w-4 h-4" /> Toplu Faaliyet Listesi İndir
          </button>
        )}
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
              {task.status !== 'completed' && currentUser?.role !== 'staff' && (
                <button
                  onClick={() => handleAdminComplete(task.applicant!.id!)}
                  className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 bg-slate-800 text-white hover:bg-slate-900 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  <CheckSquare className="w-4 h-4" />
                  Yönetici Olarak Tamamla
                </button>
              )}
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
            mapStyle="https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json"
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
