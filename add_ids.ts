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
      let changed = false;

      // Regex to find <input, <select, <textarea
      // We'll use a replacer function
      const tagRegex = /<(input|select|textarea)(\s+[^>]*?)(\/?)>/g;

      content = content.replace(tagRegex, (match, tag, attrs, selfClosing) => {
        // Simple check if id= or name= exists in attrs
        // This is a naive regex but works for well-formatted JSX
        if (!/\b(id|name)\s*=\s*['"{]/.test(attrs)) {
          changed = true;
          const newId = `field-${Math.random().toString(36).substring(2, 9)}`;
          return `<${tag}${attrs} id="${newId}"${selfClosing ? ' /' : ''}>`;
        }
        return match;
      });

      if (changed) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated ${fullPath}`);
      }
    }
  }
}

processDirectory(path.join(process.cwd(), 'src'));
console.log('done');
