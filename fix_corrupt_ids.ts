import * as fs from 'fs';
import * as path from 'path';

function processDirectory(dir: string) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const corruptedRegex = /=\s*id="field-[a-zA-Z0-9]+">/g;
      if (corruptedRegex.test(content)) {
        content = content.replace(corruptedRegex, '=>');
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log('Fixed ' + fullPath);
      }
    }
  }
}

processDirectory(path.join(process.cwd(), 'src'));
console.log('done');
