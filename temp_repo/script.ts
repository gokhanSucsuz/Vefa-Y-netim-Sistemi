import * as fs from 'fs';

function replaceInFile(file: string, replacements: [RegExp, string][]) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [regex, replacement] of replacements) {
    content = content.replace(regex, replacement);
  }
  fs.writeFileSync(file, content, 'utf8');
}

replaceInFile('src/components/ScheduleView.tsx', [
  [/await dbLocal\.programs\.orderBy\('id'\)\.last\(\)/g, 'await dbLocal.programs.orderBy("id").last()'],
  [/await dbLocal\.workDays\s*\.where\('date'\)\.aboveOrEqual\(actualPlanningStartDate\)\s*\.filter\(wd => wd\.isWorkDay\)\s*\.toArray\(\)/g, '(await dbLocal.workDays.where("date").aboveOrEqual(actualPlanningStartDate).toArray()).filter(wd => wd.isWorkDay)'],
  [/const teams: number\[\]\[\] = \[\];/g, 'const teams: string[][] = [];'],
  [/const processedStaff = new Set<number>\(\);/g, 'const processedStaff = new Set<string>();'],
  [/let lastAssignedId: number \| undefined;/g, 'let lastAssignedId: string | undefined;'],
  [/const lastVisitMap = new Map<number, string>\(\);/g, 'const lastVisitMap = new Map<string, string>();'],
  [/const unassignedPool: \{ applicantId: number; globalIndex: number \}\[\] = \[\];/g, 'const unassignedPool: { applicantId: string; globalIndex: number }[] = [];'],
  [/let currentTeamIdx = 0;/g, 'let currentTeamIdx = 0;'],
]);

console.log('Done');
