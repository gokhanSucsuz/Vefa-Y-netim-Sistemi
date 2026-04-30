const fs = require('fs');
const file = 'src/components/ScheduleView.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /<div className="flex gap-2 items-center">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<div className="pt-2">/m;

const newUi = `<div className="flex gap-2 items-center">
                                  <select
                                    value={item.staffMembers[0]?.id ? (staff.find(st => st.id === item.staffMembers[0]?.id)?.partnerId ? (item.staffMembers[0].id < staff.find(st => st.id === item.staffMembers[0]?.id)!.partnerId! ? item.staffMembers[0].id : staff.find(st => st.id === item.staffMembers[0]?.id)!.partnerId!) : item.staffMembers[0].id) : ''}
                                    disabled={isCompleted}
                                    onChange={(e) => updateStaffAssignment(a.date, item.applicant.id!, 0, e.target.value)}
                                    className="flex-1 text-[10px] font-bold bg-slate-50 border border-slate-100 rounded-xl px-2 py-2.5 outline-none focus:ring-2 focus:ring-institution-blue/20 transition-all disabled:opacity-50 appearance-none text-center"
                                  >
                                    <option value="">Ekip Seç...</option>
                                    {staff.reduce((acc, s) => {
                                      const teamId = s.partnerId ? (s.id < s.partnerId ? s.id : s.partnerId) : s.id;
                                      if (!acc.some(t => t.id === teamId)) {
                                        const partner = staff.find(p => p.id === s.partnerId);
                                        acc.push({
                                          id: teamId,
                                          name: partner ? \`\${s.name} \${s.surname} - \${partner.name} \${partner.surname}\` : \`\${s.name} \${s.surname}\`
                                        });
                                      }
                                      return acc;
                                    }, [] as {id: string, name: string}[]).map(t => (
                                      <option key={t.id} value={t.id}>
                                        {t.name}
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
                                </div>
                              </div>
                            </div>
                            
                            <div className="pt-2">`;

content = content.replace(regex, newUi);
fs.writeFileSync(file, content, 'utf8');
console.log('Done replacing UI.');
