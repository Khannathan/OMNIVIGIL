// OMNIVIGIL entry point. Loads the legacy game modules in order, then the WebGL renderer,
// then any art layers, then boots (js/main.js).
import './legacy';
import './gl/globe';
import '../js/render/atlas-render.js';
import '../js/render/atlas-specs.js';
import './gl/system';
import './feel/index';
import './mind/mind';
import './loop/econ';
import './loop/advisor';
import './loop/ops';
import './loop/ledger';
import './loop/codebase';
import './loop/docks';
import './loop/earthfall';
import './loop/balance';
import './loop/cosmos';
import './ui/cosmos';
import '../css/mind.css';
// optional art layers (the art thread's land/city art); either path may exist
const art = import.meta.glob(['../js/render/landart.js', './art/*.ts', '!./art/*.worker.ts'], { eager: true });
void art;
import '../js/main.js';
import '../css/prism-ui.css';
import '../css/prism-icons.css';
import './ui/armory';
