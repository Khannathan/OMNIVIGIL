// Inline the Vite build (app.js + style.css) into one HTML file: build/omnivigil-zero.html
import fs from 'fs'; import path from 'path';
const dir = path.resolve('build/vite'); let html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const cssf = fs.readdirSync(dir).find(f => f.endsWith('.css'));
html = html.replace(/<script type="module"[^>]*src="[^"]*app\.js"[^>]*><\/script>/, '');
html = html.replace(/<link rel="stylesheet"[^>]*href="[^"]*\.css"[^>]*>/, '');
if (cssf) { const css = fs.readFileSync(path.join(dir, cssf), 'utf8'); html = html.replace('</head>', () => `<style>${css}</style>\n</head>`); }
html = html.replace('</body>', () => `<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>\n</body>`);
fs.writeFileSync('build/omnivigil-zero.html', html); console.log('build/omnivigil-zero.html', (html.length / 1024).toFixed(0) + ' KB');
// Artifact variant: the publisher wraps the page in its own doctype/head/body skeleton, so strip ours.
let art = html.replace(/<!doctype html>\s*/i, '').replace(/<html[^>]*>/i, '').replace(/<\/html>/i, '').replace(/<\/?head>/gi, '').replace(/<body>/i, '').replace(/<\/body>/i, '');
art = art.replace(/<meta charset="utf-8">\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '');
art = art.replace('<title>OMNIVIGIL Zero</title>', '<title>OMNIVIGIL Zero</title>\n<meta name="description" content="A turn-based strategy game: you are an Ascendant AI on an alien world.">');
fs.writeFileSync('build/artifact.html', art.trimStart()); console.log('build/artifact.html', (art.length / 1024).toFixed(0) + ' KB');
