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
  setItem: (k, v) => { try { stored = JSON.parse(v); } catch (e) { stored = v; } },
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
for (const tab of ['dashboard', 'tasks', 'rooms', 'badges', 'stats', 'agenda', 'settings']) {
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

(async () => {
  // 6. Taak verwijderen
  click('reset');
  const before = stored.tasks.length;
  const victim = stored.tasks[1].id;
  click('delete-task', { id: victim });
  assert.strictEqual(stored.tasks.length, before - 1, 'taak verwijderd');
  assert.ok(!stored.tasks.some((t) => t.id === victim), 'taak weg uit state');

  // 7. Agenda-tab rendert en demo-plan slaat planning op
  click('tab', { tab: 'agenda' });
  assert.ok(elements['view-agenda'].innerHTML.includes('Google Calendar'), 'agenda rendert');
  click('plan-demo');
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(stored.planned && stored.planned.length > 0, 'demo-plan slaat planning op');
  assert.ok(stored.planned.every((p) => /\d{4}-\d{2}-\d{2}/.test(p.date)), 'planning heeft geldige datums');

  // 8. Progress-overlay, vandaag-filter en taak-edit renderen
  click('show-progress');
  assert.ok(elements['progress-card'].innerHTML.includes('Level'), 'progress-overlay rendert');
  click('close-progress');
  click('today-tasks');
  assert.ok(elements['view-tasks'].innerHTML.includes('Te doen'), 'vandaag-filter actief in taken-tab');
  click('edit-task', { id: stored.tasks[0].id });
  assert.strictEqual(elements['edit-task-title'].value, stored.tasks[0].title, 'edit-formulier gevuld met taak');
  click('close-edit');

  // 9. Drive-backup zonder token geeft nette melding (geen crash)
  click('drive-backup');
  assert.ok(elements['toast'].innerHTML.includes('Verbind eerst'), 'drive-backup zonder token meldt netjes');

  // 10. plan-real zonder Client ID geeft nette melding (knop is niet meer disabled)
  click('plan-real');
  await new Promise((r) => setTimeout(r, 20));
  assert.ok(elements['toast'].innerHTML.includes('Client ID'), 'plan-real zonder client-id meldt netjes');

  // 11. Toggle-bug: afgevinkte taak nogmaals aanklikken = undo (geen dubbele XP/history)
  click('reset');
  const tid = stored.tasks[0].id;
  click('complete', { id: tid });
  assert.strictEqual(stored.history.length, 1, 'eerste klik voegt history toe');
  click('complete', { id: tid });
  assert.strictEqual(stored.history.length, 0, 'tweede klik op klare taak undo-et (geen extra XP)');

  // 12. Theme-toggle werkt zonder crash
  click('toggle-theme');
  assert.ok(true, 'theme toggle klik ok');

  console.log('Smoke-test geslaagd ✔');
  process.exit(0);
})();
