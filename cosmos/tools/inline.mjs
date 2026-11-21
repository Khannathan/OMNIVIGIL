// Inline the Vite build (app.js + style.css) into one HTML file: build/omnivigil-cosmos.html
import fs from 'fs'; import path from 'path';
const dir = path.resolve('build/vite'); let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const cssf = fs.readdirSync(dir).find(f => f.endsWith('.css'));
html = html.replace(/<script type="module"[^>]*src="[^"]*app\.js"[^>]*><\/script>/, '');
html = html.replace(/<link rel="stylesheet"[^>]*href="[^"]*\.css"[^>]*>/, '');
if (cssf) { const css = fs.readFileSync(path.join(dir, cssf), 'utf8'); html = html.replace('</head>', () => `<style>${css}</style>\n</head>`); }
html = html.replace('</body>', () => `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>\n</body>`);
fs.writeFileSync('build/omnivigil-cosmos.html', html); console.log('build/omnivigil-cosmos.html', (html.length / 1024).toFixed(0) + ' KB');
