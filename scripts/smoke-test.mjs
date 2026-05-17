import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const html = await readFile('index.html', 'utf8');
const source = await readFile('main.js', 'utf8');
const idPattern = /\bid\s*=\s*(["'])(.*?)\1/g;
const ids = [];
let idMatch;

while ((idMatch = idPattern.exec(html)) !== null) {
  ids.push(idMatch[2]);
}

class ClassList {
  constructor(initial = '') {
    this.tokens = new Set(initial.split(/\s+/).filter(Boolean));
  }

  add(...tokens) {
    for (const token of tokens) this.tokens.add(token);
  }

  remove(...tokens) {
    for (const token of tokens) this.tokens.delete(token);
  }

  contains(token) {
    return this.tokens.has(token);
  }

  toggle(token, force) {
    if (force === true) {
      this.tokens.add(token);
      return true;
    }

    if (force === false) {
      this.tokens.delete(token);
      return false;
    }

    if (this.tokens.has(token)) {
      this.tokens.delete(token);
      return false;
    }

    this.tokens.add(token);
    return true;
  }
}

class FakeElement {
  constructor(id, className = '') {
    this.id = id;
    this.classList = new ClassList(className);
    this.style = {};
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = '';
    this.disabled = false;
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) || [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  click() {
    this.dispatch('click', { target: this });
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners.get(type) || []) {
      handler(event);
    }
  }
}

function classNameForId(id) {
  const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagPattern = new RegExp(`<[^>]*\\bid=["']${escapedId}["'][^>]*>`, 'i');
  const tag = html.match(tagPattern)?.[0] || '';
  return tag.match(/\bclass\s*=\s*(["'])(.*?)\1/i)?.[2] || '';
}

const elements = new Map(ids.map((id) => [id, new FakeElement(id, classNameForId(id))]));
const documentListeners = new Map();
const document = {
  getElementById(id) {
    return elements.get(id) || null;
  },
  addEventListener(type, handler) {
    const handlers = documentListeners.get(type) || [];
    handlers.push(handler);
    documentListeners.set(type, handlers);
  }
};

const timers = [];
const context = vm.createContext({
  document,
  Date,
  console,
  window: {
    setTimeout(handler) {
      timers.push(handler);
      return timers.length;
    }
  }
});

vm.runInContext(source, context, { filename: 'main.js' });

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function keydown(key) {
  for (const handler of documentListeners.get('keydown') || []) {
    handler({ key, preventDefault() {} });
  }
}

const playfield = elements.get('playfield');
const startButton = elements.get('startButton');
const actionButton = elements.get('actionButton');
const boostButton = elements.get('boostButton');
const menuButton = elements.get('menuButton');
const resumeButton = elements.get('resumeButton');
const resetButton = elements.get('resetButton');
const hudButton = elements.get('hudButton');
const hudPanel = elements.get('hudPanel');
const progressText = elements.get('progressText');
const vehicleText = elements.get('vehicleText');

assert(playfield.classList.contains('menu-open'), 'Initial state must open the main menu.');
assert(actionButton.textContent === 'ENTRA', 'Action button must start as ENTRA.');
assert(boostButton.disabled === true, 'Boost must be disabled before game start.');

startButton.click();
assert(!playfield.classList.contains('menu-open'), 'Start button must enter the game.');
assert(boostButton.disabled === false, 'Boost must be enabled after game start.');

actionButton.click();
assert(vehicleText.textContent === 'Escavatore', 'First action click must enter the excavator.');
assert(actionButton.textContent === 'SCAVA', 'Action button must become SCAVA in the excavator.');

actionButton.click();
assert(progressText.textContent === '7%', 'Digging must advance progress.');

hudButton.click();
assert(hudPanel.classList.contains('open'), 'HUD button must open the HUD after start.');

menuButton.click();
assert(playfield.classList.contains('menu-open'), 'MENU must pause/open the menu after start.');
assert(!resumeButton.classList.contains('hidden'), 'Pause menu must show RIPRENDI.');
assert(!resetButton.classList.contains('hidden'), 'Pause menu must show RESET MISSIONE.');

resumeButton.click();
assert(!playfield.classList.contains('menu-open'), 'RIPRENDI must close the pause menu.');

keydown('Escape');
assert(playfield.classList.contains('menu-open'), 'Escape must open the pause menu during gameplay.');
resetButton.click();
assert(progressText.textContent === '0%', 'Reset must restore progress to 0%.');
assert(vehicleText.textContent === 'A piedi', 'Reset must leave the player on foot.');
assert(!playfield.classList.contains('menu-open'), 'Reset must return to gameplay.');

console.log('Smoke test passed: menu, HUD, controls, reset, and keyboard flow are executable.');
