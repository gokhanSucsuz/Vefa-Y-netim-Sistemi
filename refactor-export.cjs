const fs = require('fs');

const file = 'src/components/ScheduleView.tsx';
let content = fs.readFileSync(file, 'utf8');

// 1. Add imports
content = content.replace(
  "import { geocodeAddress } from '../services/geocoding';",
  "import { geocodeAddress } from '../services/geocoding';\nimport { exportToExcel, exportToPDF, formatSafe } from '../utils/exportUtils';"
);

// 2. Remove formatSafe definition
content = content.replace(
  /const formatSafe = \([\s\S]*?return '-';\s*\}\s*\};\s*/m,
  "// formatSafe imported from exportUtils\n"
);

// 3. Replace export functions body
const regex = /const exportToExcel = \(\) => \{[\s\S]*?pdfMake\.createPdf\(docDefinition\)\.download\([^)]+\);\s*\};/m;

content = content.replace(
  regex,
  `const handleExportExcel = () => exportToExcel(assignments, selectedMonth);
  const handleExportPDF = () => exportToPDF(assignments, selectedMonth, currentUser);`
);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully refactored exports from ScheduleView.tsx');
