const fs = require('fs');
const path = require('path');

function replaceAlertsInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;
  
  if (content.includes('alert(')) {
    // Add import if not exists
    if (!content.includes('react-hot-toast')) {
      content = 'import toast from \'react-hot-toast\';\n' + content;
    }
    
    // Replace alert with toast.success or toast.error
    content = content.replace(/alert\((['`"])(.*?)\1\)/g, (match, quote, msg) => {
      const lowerMsg = msg.toLowerCase();
      if (lowerMsg.includes('başarı') || lowerMsg.includes('tamamlan') || lowerMsg.includes('kaydedildi') || lowerMsg.includes('silindi')) {
        return 'toast.success(' + quote + msg + quote + ')';
      } else {
        return 'toast.error(' + quote + msg + quote + ')';
      }
    });

    // Replace alert(variable) with toast.error(variable) 
    content = content.replace(/alert\(([^'"`].*?)\)/g, 'toast.error($1)');

    fs.writeFileSync(filePath, content, 'utf8');
    changed = true;
    console.log('Updated', filePath);
  }
}

const dir = 'src/components';
const files = fs.readdirSync(dir);
files.forEach(f => {
  if (f.endsWith('.tsx') || f.endsWith('.ts')) {
    replaceAlertsInFile(path.join(dir, f));
  }
});
