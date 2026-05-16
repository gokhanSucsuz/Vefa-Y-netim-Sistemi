import * as fs from 'fs';
import * as path from 'path';

const srcDir = path.join(process.cwd(), 'src', 'components');

const files = fs.readdirSync(srcDir).filter((f: string) => f.endsWith('.tsx'));

for (const file of files) {
  const filePath = path.join(srcDir, file);
  let content = fs.readFileSync(filePath, 'utf-8');
  
  if (!content.includes('confirm(') && !content.includes('window.confirm(') && !content.includes('prompt(') && !content.includes('window.prompt(')) {
    continue;
  }
  
  if (!content.includes('useConfirmDialog')) {
    content = "import { useConfirmDialog } from '../hooks/useConfirmDialog';\n" + content;
  }
  
  const compMatch = content.match(/export default function [A-Za-z0-9_]+\([^)]*\)[\s]*{/);
  if (compMatch && !content.includes('const { confirm } = useConfirmDialog();')) {
     content = content.replace(compMatch[0], compMatch[0] + "\n  const { confirm } = useConfirmDialog();");
  }

  content = content.replace(/(?:window\.)?confirm\((.*?)\)/g, '(await confirm({ message: $1, type: "warning" }))');
  
  content = content.replace(/(?:window\.)?prompt\((.*?)\)/g, '(await confirm({ message: $1, type: "info", withPrompt: true, promptPlaceholder: "Yanıtınız..." }))');
  
  fs.writeFileSync(filePath, content);
}
console.log('done');
