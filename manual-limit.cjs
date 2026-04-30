const fs = require('fs');
const file = 'src/components/ManualSchedulePlanner.tsx';
let content = fs.readFileSync(file, 'utf8');

const targetStr = `                               {teams.map((team, tIdx) => (
                                 <option key={tIdx} value={team.map(t => t.id).join(',')}>
                                   Ekip {tIdx + 1}: {team.map(t => t.name).join(' & ')}
                                 </option>
                               ))}`;

const replacementStr = `                               {teams.map((team, tIdx) => {
                                 const teamIds = team.map(t => t.id);
                                 const existingCountForTeam = currentDaySchedule?.assignments.filter(a => a.staffIds && a.staffIds.some(id => teamIds.includes(id))).length || 0;
                                 const newCountForTeam = selectedAssignments.filter(a => a.applicantId !== assignment.applicantId && a.staffIds && a.staffIds.some(id => teamIds.includes(id))).length;
                                 const totalTasksForTeam = existingCountForTeam + newCountForTeam;
                                 const isDisabled = totalTasksForTeam >= 2;

                                 return (
                                   <option key={tIdx} value={teamIds.join(',')} disabled={isDisabled}>
                                     Ekip {tIdx + 1}: {team.map(t => t.name).join(' & ')} {isDisabled ? '(Dolu)' : ''}
                                   </option>
                                 );
                               })}`;

content = content.replace(targetStr, replacementStr);
fs.writeFileSync(file, content, 'utf8');
console.log('Manual Schedule Planner limit applied.');
