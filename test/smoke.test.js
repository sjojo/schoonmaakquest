'use strict';

// Minimale DOM-stub zodat we de browser-code van app.js in node kunnen draaien.
const assert = require('assert');

const elements = {};
function fakeEl(id) {
  if (!elements[id]) {
    elements[id] = {
      id,
      innerHTML: '',
      textContent: '',
      value: '',
      style: {},
      dataset: {},
      files: null,
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {},
      appendChild() {},
    };
  }
  return elements[id];
}

const handlers = {};
let stored = null;

global.localStorage = {
  getItem: () => null,
  setItem: (k, v) => { stored = JSON.parse(v); },
};
global.document = {
  getElementById: (id) => fakeEl(id),
  querySelectorAll: () => [],
  createElement: () => fakeEl('created-' + Math.random()),
  addEventListener: (ev, fn) => { handlers[ev] = fn; },
};
global.confirm = () => true;

require('../app.js');

function click(action, extra = {}) {
  handlers.click({ target: { closest: () => ({ dataset: { action, ...extra } }) } });
}

// 1. Alle tabbladen renderen zonder crash
for (const tab of ['dashboard', 'tasks', 'rooms', 'badges', 'stats', 'settings']) {
  click('tab', { tab });
}
assert.ok(elements['view-dashboard'].innerHTML.includes('Kamers'), 'dashboard rendert kamers');
assert.ok(elements['view-tasks'].innerHTML.includes('Stofzuigen'), 'taken renderen met seed-data');
assert.ok(elements['view-badges'].innerHTML.includes('Badges'), 'badges renderen');

// 2. Reset slaat seed-data op in localStorage
click('reset');
assert.ok(stored && stored.tasks.length >= 25, 'seed opgeslagen');
const taskId = stored.tasks[0].id;

// 3. Een taak afvinken: history groeit, XP telt mee, badge 'first' ontgrendeld
click('complete', { id: taskId });
assert.strictEqual(stored.history.length, 1);
assert.strictEqual(stored.history[0].taskId, taskId);
assert.ok(stored.badges.first, 'badge "first" ontgrendeld');
assert.ok(elements['levelBadge'].textContent.includes('Lv'), 'level badge bijgewerkt');

// 4. Ongedaan maken: history leegt weer
click('undo-last');
assert.strictEqual(stored.history.length, 0);

// 5. Kamer filteren vanaf dashboard
click('filter-room', { id: stored.rooms[0].id });
assert.ok(elements['view-tasks'].innerHTML.length > 0, 'taken-filter rendert');

// 6. Taak verwijderen
click('reset');
const before = stored.tasks.length;
const victim = stored.tasks[1].id;
click('delete-task', { id: victim });
assert.strictEqual(stored.tasks.length, before - 1, 'taak verwijderd');
assert.ok(!stored.tasks.some((t) => t.id === victim), 'taak weg uit state');

console.log('Smoke-test geslaagd ✔');
process.exit(0);
