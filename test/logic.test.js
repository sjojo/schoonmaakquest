'use strict';

const assert = require('assert');
const {
  DAY, FREQS, taskStats, roomScore, xpTotal, levelInfo,
  bestStreak, doneToday, dueTasks, checkBadges, seedState, BADGES,
} = require('../app.js');

const NOW = Date.parse('2025-06-15T12:00:00');

function makeState() {
  const s = seedState();
  s.rooms = [{ id: 'r1', name: 'Keuken', icon: '🍳' }];
  s.tasks = [
    { id: 't1', roomId: 'r1', title: 'Afwassen', freq: 'daily', points: 5 },
    { id: 't2', roomId: 'r1', title: 'Stofzuigen', freq: 'weekly', points: 10 },
    { id: 't3', roomId: 'r1', title: 'Ramen', freq: 'monthly', points: 15 },
  ];
  s.history = [];
  s.badges = {};
  return s;
}

// 1. Nooit gedaan => direct te doen
{
  const s = makeState();
  assert.strictEqual(taskStats(s, s.tasks[0], NOW).due, true);
  assert.strictEqual(dueTasks(s, NOW).length, 3);
  assert.strictEqual(roomScore(s, 'r1', NOW), 0);
}

// 2. Dagelijkse taak 12 uur geleden gedaan => niet te doen; 2 dagen geleden => wel (interval = 24u)
{
  const s = makeState();
  s.history.push({ id: 'h1', taskId: 't1', ts: NOW - 12 * 3600000, points: 5 });
  assert.strictEqual(taskStats(s, s.tasks[0], NOW).due, false);
  const s2 = makeState();
  s2.history.push({ id: 'h1', taskId: 't1', ts: NOW - 2 * DAY, points: 5 });
  assert.strictEqual(taskStats(s2, s2.tasks[0], NOW).due, true);
}

// 3. Wekelijkse taak 6 dagen geleden gedaan => niet te doen; 8 dagen => wel
{
  const s = makeState();
  s.history.push({ id: 'h1', taskId: 't2', ts: NOW - 6 * DAY, points: 10 });
  assert.strictEqual(taskStats(s, s.tasks[0 + 1], NOW).due, false);
  const s2 = makeState();
  s2.history.push({ id: 'h1', taskId: 't2', ts: NOW - 8 * DAY, points: 10 });
  assert.strictEqual(taskStats(s2, s2.tasks[1], NOW).due, true);
}

// 4. Streak: wekelijkse taak om de 7 dagen, 3x => streak 3; gat van 20 dagen breekt de streak
{
  const s = makeState();
  [0, 7, 14].forEach((d) => s.history.push({ id: 'h' + d, taskId: 't2', ts: NOW - d * DAY, points: 10 }));
  assert.strictEqual(taskStats(s, s.tasks[1], NOW).streak, 3);
  const s2 = makeState();
  [0, 7, 30].forEach((d) => s2.history.push({ id: 'h' + d, taskId: 't2', ts: NOW - d * DAY, points: 10 }));
  // laatste twee (0 en 7 dagen geleden) waren op tijd; die van 30 dagen geleden niet => streak 2
  assert.strictEqual(taskStats(s2, s2.tasks[1], NOW).streak, 2);
  assert.strictEqual(bestStreak(s, NOW), 3);
}

// 5. XP en levels: 0 xp => Lv1; 100 xp => Lv2 met 0/200; 250 xp => Lv2 met 150/200; 600 => Lv3 (100+200=300 -> Lv3, rest 300/300 -> Lv4? check)
{
  const s = makeState();
  assert.deepStrictEqual([levelInfo(s).level, levelInfo(s).xp], [1, 0]);
  for (let i = 0; i < 20; i++) s.history.push({ id: 'x' + i, taskId: 't1', ts: NOW - i * 3600000, points: 5 }); // 100 xp
  let li = levelInfo(s);
  assert.strictEqual(li.level, 2);
  assert.strictEqual(li.remaining, 0);
  assert.strictEqual(li.need, 200);
  for (let i = 0; i < 30; i++) s.history.push({ id: 'y' + i, taskId: 't1', ts: NOW - 100 * DAY + i * 1000, points: 5 }); // +150 xp
  li = levelInfo(s);
  assert.strictEqual(li.level, 2);
  assert.strictEqual(li.remaining, 150);
  assert.strictEqual(xpTotal(s), 250);
}

// 6. Room score: 1 van 3 klaar => 33%
{
  const s = makeState();
  s.history.push({ id: 'h1', taskId: 't1', ts: NOW - 1, points: 5 });
  s.history.push({ id: 'h2', taskId: 't2', ts: NOW - 1, points: 10 });
  // t1 daily (1 dag interval) gedaan nu -> niet due; t2 weekly gedaan nu -> niet due; t3 monthly nooit -> due
  assert.strictEqual(roomScore(s, 'r1', NOW), 67);
}

// 7. doneToday telt alleen van vandaag
{
  const s = makeState();
  const start = doneToday ? null : null;
  s.history.push({ id: 'h1', taskId: 't1', ts: NOW, points: 5 });
  s.history.push({ id: 'h2', taskId: 't1', ts: NOW - 2 * DAY, points: 5 });
  assert.strictEqual(doneToday(s, NOW), 1);
}

// 8. Badges: first bij 1 klus, spotless als alles bij is, early bij klus voor 8:00
{
  const s = makeState();
  let unlocked = checkBadges(s, NOW);
  assert.strictEqual(unlocked.length, 0);
  s.history.push({ id: 'h1', taskId: 't1', ts: NOW, points: 5 });
  unlocked = checkBadges(s, NOW);
  assert.ok(unlocked.some((b) => b.id === 'first'));
  // alles afgevinkt -> spotless
  s.history.push({ id: 'h2', taskId: 't2', ts: NOW, points: 10 });
  s.history.push({ id: 'h3', taskId: 't3', ts: NOW, points: 15 });
  unlocked = checkBadges(s, NOW);
  assert.ok(unlocked.some((b) => b.id === 'spotless'));
  // badge wordt niet dubbel geteld
  unlocked = checkBadges(s, NOW);
  assert.strictEqual(unlocked.length, 0);
  // early bird: klus om 06:00
  const s2 = makeState();
  const early = new Date(NOW); early.setHours(6, 0, 0, 0);
  s2.history.push({ id: 'h1', taskId: 't1', ts: early.getTime(), points: 5 });
  assert.ok(checkBadges(s2, NOW).some((b) => b.id === 'early'));
}

// 9. Seed-data is valide en bevat typische appartement-taken
{
  const s = seedState();
  assert.ok(s.rooms.length >= 6);
  assert.ok(s.tasks.length >= 25);
  for (const t of s.tasks) {
    assert.ok(FREQS[t.freq], 'onbekende frequentie: ' + t.freq);
    assert.ok(s.rooms.some((r) => r.id === t.roomId), 'taak zonder kamer: ' + t.title);
  }
  assert.ok(BADGES.length >= 8);
}

console.log('Alle logica-tests geslaagd ✔');
