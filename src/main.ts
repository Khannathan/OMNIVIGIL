// OMNIVIGIL entry point. Loads the legacy game modules in order, then the WebGL renderer,
// then any art layers, then boots (js/main.js).
import './legacy';
import './gl/globe';
import './feel/index';
import './mind/mind';
import './loop/econ';
import '../css/mind.css';
// optional art layers (the art thread's land/city art); either path may exist
const art = import.meta.glob(['../js/render/landart.js', './art/*.ts', '!./art/*.worker.ts'], { eager: true });
void art;
import '../js/main.js';
import '../css/prism-ui.css';
