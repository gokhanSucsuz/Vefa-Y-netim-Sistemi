const fs = require('fs');
const file = 'src/components/ScheduleView.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /const isAssignedElsewhere = assignmentsOnSameDay\.length > 0 && !assignmentsOnSameDay\.some\(i => i\.applicant\.id === item\.applicant\.id\);\s*return \(\s*<option \s*key={s\.id} \s*value={s\.id} \s*disabled={isAssignedElsewhere}\s*>/g;

content = content.replace(regex, `return (
                                        <option 
                                          key={s.id} 
                                          value={s.id} 
                                        >`);

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed disabled logic in UI.');
