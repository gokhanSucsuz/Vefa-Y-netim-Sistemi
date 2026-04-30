const fs = require('fs');
const file = 'src/components/ScheduleView.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

let newLines = [];
let skip = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('<div className="grid grid-cols-2 gap-2">') && lines[i+1].includes('{[0, 1].map(sIdx => (')) {
    skip = true;
    newLines.push(`                                <div className="flex gap-2 items-center">
                                  <select
                                    value={item.staffMembers[0]?.id || ''}
                                    disabled={isCompleted}
                                    onChange={(e) => updateStaffAssignment(a.date, item.applicant.id!, 0, e.target.value)}
                                    className="flex-1 text-[10px] font-bold bg-slate-50 border border-slate-100 rounded-xl px-2 py-2.5 outline-none focus:ring-2 focus:ring-institution-blue/20 transition-all disabled:opacity-50 appearance-none text-center"
                                  >
                                    <option value="">Ekip Seç...</option>
                                    {staff.map(s => (
                                      <option key={s.id} value={s.id}>
                                        {s.name} {s.surname} {s.isBackup ? '(Yedek)' : ''}
                                      </option>
                                    ))}
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
                                </div>`);
  }
  
  if (!skip) {
    newLines.push(lines[i]);
  }
  
  if (skip && lines[i].includes('</div>') && lines[i-1].includes('))}')) {
    skip = false;
  }
}

fs.writeFileSync(file, newLines.join('\n'), 'utf8');
console.log('UI replaced by lines.');
