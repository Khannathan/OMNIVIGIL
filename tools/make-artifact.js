// Builds build/artifact.html (the page body used for the hosted artifact) from the Vite output
// build/index.html. Publish build/artifact.html with root build/ and files assets/*.
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..', 'build');
let h = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
h = h.replace(/<!doctype html>\s*/i, '').replace(/<\/?html[^>]*>\s*/gi, '').replace(/<\/?head>\s*/gi, '').replace(/<\/?body>\s*/gi, '')
  .replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
fs.writeFileSync(path.join(root, 'artifact.html'), h);
console.log('wrote build/artifact.html', h.length);
