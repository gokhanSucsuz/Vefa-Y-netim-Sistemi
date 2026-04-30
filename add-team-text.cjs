const fs = require('fs');
const file = 'src/components/ScheduleView.tsx';
let content = fs.readFileSync(file, 'utf8');

const target = `<label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                  <Users className="w-3 h-3" />
                                  Görevli Ekip
                                </label>`;

const replacement = `<label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 mb-1">
                                  <Users className="w-3 h-3" />
                                  Görevli Ekip
                                </label>
                                {item.staffMembers.length > 0 && (
                                  <div className="text-[11px] font-bold text-slate-700 bg-institution-blue/5 border border-institution-blue/20 p-2 rounded-xl text-center mb-2 shadow-sm">
                                    {item.staffMembers.map(s => \`\${s.name} \${s.surname}\`).join(' - ')}
                                  </div>
                                )}`;

content = content.replace(target, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('Added explicit text for assigned team.');
