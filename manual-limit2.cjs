const fs = require('fs');
const file = 'src/components/ManualSchedulePlanner.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('{teams.map((team, tIdx) => (') && lines[i+1].includes('<option')) {
    // Delete the 5 lines
    lines.splice(i, 5, 
      `                               {teams.map((team, tIdx) => {`,
      `                                 const teamIds = team.map(t => t.id);`,
      `                                 const existingCountForTeam = currentDaySchedule?.assignments.filter(a => a.staffIds && a.staffIds.some(id => teamIds.includes(id))).length || 0;`,
      `                                 const newCountForTeam = selectedAssignments.filter(a => a.applicantId !== assignment.applicantId && a.staffIds && a.staffIds.some(id => teamIds.includes(id))).length;`,
      `                                 const totalTasksForTeam = existingCountForTeam + newCountForTeam;`,
      `                                 const isDisabled = totalTasksForTeam >= 2;`,
      ``,
      `                                 return (`,
      `                                   <option key={tIdx} value={teamIds.join(',')} disabled={isDisabled}>`,
      `                                     Ekip {tIdx + 1}: {team.map(t => t.name).join(' & ')} {isDisabled ? '(Dolu)' : ''}`,
      `                                   </option>`,
      `                                 );`,
      `                               })}`
    );
    break;
  }
}

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('Manual Schedule Planner limit applied with line split.');
