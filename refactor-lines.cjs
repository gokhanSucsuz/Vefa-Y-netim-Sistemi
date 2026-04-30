const fs = require('fs');

const file = 'src/components/ScheduleView.tsx';
let lines = fs.readFileSync(file, 'utf8').split('\n');

if (!lines[0].includes('exportUtils')) {
  lines.splice(10, 0, "import { exportToExcel, exportToPDF, formatSafe } from '../utils/exportUtils';");
}

let newLines = [];
let skip = false;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const formatSafe = (dateStr: string, formatStr: string, options?: any) => {')) skip = true;
  if (!skip) newLines.push(lines[i]);
  if (skip && lines[i].includes('  };') && i > 80 && i < 110) skip = false;
}

lines = newLines;
newLines = [];
skip = false;
let exportReplaced = false;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const exportToExcel = () => {')) {
    skip = true;
    if (!exportReplaced) {
      newLines.push("  const handleExportExcel = () => exportToExcel(assignments, selectedMonth);");
      newLines.push("  const handleExportPDF = () => exportToPDF(assignments, selectedMonth, currentUser);");
      exportReplaced = true;
    }
  }
  
  if (!skip) newLines.push(lines[i]);
  
  if (skip && lines[i].includes('pdfMake.createPdf(docDefinition).download') && lines[i].includes('pdf')) {
    i++; // skip closing brace
    skip = false;
  }
}

fs.writeFileSync(file, newLines.join('\n'), 'utf8');
console.log('Done');
