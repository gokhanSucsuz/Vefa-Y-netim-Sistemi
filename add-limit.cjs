const fs = require('fs');
const file = 'src/components/ScheduleView.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `                                      if (!acc.some(t => t.id === teamId)) {
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
                                    ))}`;

const replacementStr = `                                      if (!acc.some(t => t.id === teamId)) {
                                        const partner = staff.find(p => p.id === s.partnerId);
                                        acc.push({
                                          id: teamId,
                                          name: partner ? \`\${s.name} \${s.surname} - \${partner.name} \${partner.surname}\` : \`\${s.name} \${s.surname}\`,
                                          staff1Id: s.id,
                                          staff2Id: s.partnerId
                                        });
                                      }
                                      return acc;
                                    }, [] as {id: string, name: string, staff1Id: string, staff2Id?: string}[]).map(t => {
                                      // Check how many tasks this team already has today
                                      const assignmentsOnSameDay = a.items.filter(i => 
                                        i.staffMembers.some(sm => sm.id === t.staff1Id || sm.id === t.staff2Id)
                                      );
                                      // If they already have 2 tasks, and THIS task is not one of them, disable!
                                      const isAlreadyInThisTask = item.staffMembers.some(sm => sm.id === t.staff1Id || sm.id === t.staff2Id);
                                      const isDisabled = assignmentsOnSameDay.length >= 2 && !isAlreadyInThisTask;
                                      
                                      return (
                                        <option key={t.id} value={t.id} disabled={isDisabled}>
                                          {t.name} {isDisabled ? '(Dolu)' : ''}
                                        </option>
                                      );
                                    })}`;

content = content.replace(targetStr, replacementStr);
fs.writeFileSync(file, content, 'utf8');
console.log('Re-added max 2 assignments per day limit.');
