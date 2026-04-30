const fs = require('fs');
const file = 'src/components/ScheduleView.tsx';
let content = fs.readFileSync(file, 'utf8');

// Replace updateStaffAssignment logic
const logicToReplace = `      if (a.applicantId === applicantId) {
        const newStaffIds = [...(a.staffIds || [])];
        
        if (!staffId) {
          // Remove staff from this slot
          newStaffIds[staffIndex] = '';
        } else {
          newStaffIds[staffIndex] = staffId;
          // If this staff has a partner, automatically set the partner in the other slot
          if (selectedStaff?.partnerId) {
            const otherIndex = staffIndex === 0 ? 1 : 0;
            newStaffIds[otherIndex] = selectedStaff.partnerId;
          }
        }
        return { ...a, staffIds: newStaffIds.filter(Boolean) }; // Filter out empty strings
      }`;

const newLogic = `      if (a.applicantId === applicantId) {
        if (!staffId) {
          // Clear entire team if selection is cleared
          return { ...a, staffIds: [] };
        }
        
        const newStaffIds = [...(a.staffIds || [])];
        newStaffIds[staffIndex] = staffId;
        
        if (selectedStaff?.partnerId) {
          const otherIndex = staffIndex === 0 ? 1 : 0;
          newStaffIds[otherIndex] = selectedStaff.partnerId;
        }
        return { ...a, staffIds: newStaffIds.filter(Boolean) };
      }`;

content = content.replace(logicToReplace, newLogic);

// Replace the UI part
const uiToReplace = `<div className="grid grid-cols-2 gap-2">
                                  {[0, 1].map(sIdx => (
                                    <select
                                      key={sIdx}
                                      value={item.staffMembers[sIdx]?.id || ''}
                                      disabled={isCompleted}
                                      onChange={(e) => updateStaffAssignment(a.date, item.applicant.id!, sIdx, e.target.value)}
                                      className="w-full text-[10px] font-bold bg-slate-50 border border-slate-100 rounded-xl px-2 py-2.5 outline-none focus:ring-2 focus:ring-institution-blue/20 transition-all disabled:opacity-50 appearance-none text-center"
                                    >
                                      <option value="">Seç...</option>
                                      {staff.map(s => {
                                        const isAlreadyInThisApp = item.staffMembers.some((sm, idx) => sm.id === s.id && idx !== sIdx);
                                        const assignmentsOnSameDay = a.items.filter(i => i.staffMembers.some(sm => sm.id === s.id));
                                        const isAssignedElsewhere = assignmentsOnSameDay.length >= 2 && !assignmentsOnSameDay.some(i => i.applicant.id === item.applicant.id);
                                        
                                        return (
                                          <option 
                                            key={s.id} 
                                            value={s.id} 
                                            disabled={isAlreadyInThisApp || isAssignedElsewhere}
                                          >
                                            {s.name} {s.surname} {s.isBackup ? '(Yedek)' : ''}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  ))}
                                </div>`;

const newUi = `<div className="flex gap-2 items-center">
                                  <select
                                    value={item.staffMembers[0]?.id || ''}
                                    disabled={isCompleted}
                                    onChange={(e) => updateStaffAssignment(a.date, item.applicant.id!, 0, e.target.value)}
                                    className="flex-1 text-[10px] font-bold bg-slate-50 border border-slate-100 rounded-xl px-2 py-2.5 outline-none focus:ring-2 focus:ring-institution-blue/20 transition-all disabled:opacity-50 appearance-none text-center"
                                  >
                                    <option value="">Ekip Seç...</option>
                                    {staff.map(s => {
                                      // Yalnızca seçili günde farklı bir görevde olmayan personeller listelensin
                                      const assignmentsOnSameDay = a.items.filter(i => i.staffMembers.some(sm => sm.id === s.id));
                                      const isAssignedElsewhere = assignmentsOnSameDay.length > 0 && !assignmentsOnSameDay.some(i => i.applicant.id === item.applicant.id);
                                      
                                      return (
                                        <option 
                                          key={s.id} 
                                          value={s.id} 
                                          disabled={isAssignedElsewhere}
                                        >
                                          {s.name} {s.surname} {s.isBackup ? '(Yedek)' : ''}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {item.staffMembers.length > 0 && !isCompleted && (
                                    <button 
                                      onClick={() => updateStaffAssignment(a.date, item.applicant.id!, 0, '')}
                                      className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl border border-slate-100 transition-colors"
                                      title="Ekibi Bu Görevden Çıkar"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>`;

content = content.replace(uiToReplace, newUi);

fs.writeFileSync(file, content, 'utf8');
console.log('UI replacements done via JS script.');
