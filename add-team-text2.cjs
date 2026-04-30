const fs = require('fs');
const file = 'src/components/ScheduleView.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('Görevli Ekip') && lines[i-2].includes('<label')) {
    // We found it! The label ends at lines[i+1].
    // Let's insert the code at i+2
    lines.splice(i+2, 0, 
      `                                {item.staffMembers.length > 0 && (`,
      `                                  <div className="text-[11px] font-bold text-slate-700 bg-institution-blue/5 border border-institution-blue/20 p-2 rounded-xl text-center mb-2 shadow-sm">`,
      `                                    {item.staffMembers.map(s => s.name + ' ' + s.surname).join(' - ')}`,
      `                                  </div>`,
      `                                )}`
    );
    break;
  }
}

fs.writeFileSync(file, lines.join('\n'), 'utf8');
console.log('Done!');
