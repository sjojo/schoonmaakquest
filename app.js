'use strict';

/* ---------- Pure logica (ook testbaar in node) ---------- */

const DAY = 86400000;

const FREQS = {
  daily:     { label: 'Dagelijks',   days: 1 },
  weekly:    { label: 'Wekelijks',   days: 7 },
  biweekly:  { label: '2-wekelijks', days: 14 },
  monthly:   { label: 'Maandelijks', days: 30 },
  quarterly: { label: 'Per kwartaal',  days: 91 },
  yearly:    { label: 'Jaarlijks',   days: 365 },
};

const POINT_OPTIONS = [5, 10, 15, 25];

function uid() {
  return 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function hashPin(pin) {
  const s = 'schoonmaakquest:' + String(pin);
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    h1 = Math.imul(h1 ^ s.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ s.charCodeAt(i), 0x811c9dc5) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function freqDays(freq) {
  return (FREQS[freq] || FREQS.weekly).days;
}

function taskEntries(state, taskId) {
  return state.history
    .filter((h) => h.taskId === taskId)
    .slice()
    .sort((a, b) => a.ts - b.ts);
}

function taskStats(state, task, now) {
  const entries = taskEntries(state, task.id);
  const lastDone = entries.length ? entries[entries.length - 1].ts : null;
  const interval = freqDays(task.freq) * DAY;
  let streak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (i === entries.length - 1) {
      streak = 1;
      continue;
    }
    const gap = entries[i + 1].ts - entries[i].ts;
    if (gap <= interval * 2) streak += 1;
    else break;
  }
  const due = lastDone === null || now - lastDone >= interval;
  return { lastDone, totalDone: entries.length, streak, due };
}

function roomScore(state, roomId, now) {
  const tasks = state.tasks.filter((t) => t.roomId === roomId);
  if (!tasks.length) return 100;
  const done = tasks.filter((t) => !taskStats(state, t, now).due).length;
  return Math.round((done / tasks.length) * 100);
}

function xpTotal(state) {
  return state.history.reduce((s, h) => s + (h.points || 0), 0);
}

function levelInfo(state) {
  const xp = xpTotal(state);
  let level = 1;
  let need = level * 100;
  let remaining = xp;
  while (remaining >= need) {
    remaining -= need;
    level += 1;
    need = level * 100;
  }
  return { xp, level, remaining, need, progress: need > 0 ? remaining / need : 0 };
}

function bestStreak(state, now) {
  let best = 0;
  for (const t of state.tasks) best = Math.max(best, taskStats(state, t, now).streak);
  return best;
}

function startOfToday(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function doneToday(state, now) {
  const start = startOfToday(now);
  return state.history.filter((h) => h.ts >= start).length;
}

function dueTasks(state, now) {
  return state.tasks
    .map((t) => ({ task: t, stats: taskStats(state, t, now) }))
    .filter((x) => x.stats.due);
}

/* ---------- Agenda-planner (pure, testbaar) ---------- */

function pad2(n) { return String(n).padStart(2, '0'); }
function isoDate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function monthKey(y, m) { return `${y}-${pad2(m + 1)}`; }
function dayNum(iso) { const p = iso.split('-').map(Number); return p[0] * 372 + p[1] * 31 + p[2]; }
function sameMonth(ts, y, m) { const d = new Date(ts); return d.getFullYear() === y && d.getMonth() === m; }

function busyFromEvents(events) {
  const map = {};
  for (const ev of events || []) {
    const s = ev.start && (ev.start.date || ev.start.dateTime);
    if (!s) continue;
    const day = s.slice(0, 10);
    map[day] = (map[day] || 0) + 1;
  }
  return map;
}

function demoBusyMap(y, m) {
  const map = {};
  let seed = (y * 372 + (m + 1) * 31) % 2147483647;
  if (seed <= 0) seed += 2147483646;
  const rnd = () => { seed = (seed * 48271) % 2147483647; return seed / 2147483647; };
  const dim = daysInMonth(y, m);
  for (let d = 1; d <= dim; d++) {
    const r = rnd();
    map[isoDate(y, m, d)] = r < 0.55 ? 0 : r < 0.8 ? 1 : r < 0.93 ? 2 : 3;
  }
  return map;
}

function nextDueDate(stats, freq, now) {
  const interval = freqDays(freq) * DAY;
  let base = stats.lastDone ? stats.lastDone + interval : now;
  if (base < now) base = now;
  const d = new Date(base);
  return isoDate(d.getFullYear(), d.getMonth(), d.getDate());
}

function spreadOverDays(items, days, busy, assigned) {
  const load = {};
  for (const d of days) load[d] = (busy[d] || 0) + (assigned[d] || 0);
  const used = [];
  const out = [];
  const sorted = items.slice().sort((a, b) => b.points - a.points || (a.taskId < b.taskId ? -1 : 1));
  for (const it of sorted) {
    let best = null;
    let bestKey = null;
    for (const d of days) {
      const dist = used.length ? Math.min(...used.map((u) => Math.abs(dayNum(d) - dayNum(u)))) : 999;
      const key = [load[d], -dist, dayNum(d)];
      if (!bestKey || key[0] < bestKey[0] || (key[0] === bestKey[0] && key[1] > bestKey[1]) || (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])) {
        best = d;
        bestKey = key;
      }
    }
    out.push({ taskId: it.taskId, date: best });
    load[best] += 1;
    if (assigned) assigned[best] = (assigned[best] || 0) + 1;
    used.push(best);
  }
  return out;
}

function planMonth(tasks, statsOf, now, busyByMonth, plannedKeys) {
  const nowD = new Date(now);
  const y = nowD.getFullYear();
  const m = nowD.getMonth();
  const todayIso = isoDate(y, m, nowD.getDate());
  const planned = new Set(plannedKeys || []);
  const assigned = {};
  const assignments = [];
  const push = (taskId, date, freq) => {
    const key = taskId + '@' + date;
    assigned[date] = (assigned[date] || 0) + 1;
    if (planned.has(key)) return false;
    planned.add(key);
    assignments.push({ taskId, date, freq });
    return true;
  };

  for (const t of tasks) {
    if (t.freq !== 'weekly' && t.freq !== 'biweekly') continue;
    const st = statsOf(t);
    if (!st.due) continue;
    const date = t.deadline && t.deadline >= todayIso ? t.deadline : nextDueDate(st, t.freq, now);
    push(t.id, date, t.freq);
  }

  const monthDays = [];
  const dim = daysInMonth(y, m);
  for (let d = 1; d <= dim; d++) {
    const iso = isoDate(y, m, d);
    if (iso >= todayIso) monthDays.push(iso);
  }
  const monthly = tasks.filter((t) => t.freq === 'monthly' && !(statsOf(t).lastDone && sameMonth(statsOf(t).lastDone, y, m)));
  const mk = monthKey(y, m);
  const hasOwnDeadline = (t, keys) => t.deadline && t.deadline >= todayIso && keys.has(t.deadline.slice(0, 7));
  for (const t of monthly) {
    if (hasOwnDeadline(t, new Set([mk]))) push(t.id, t.deadline, 'monthly');
  }
  const monthlyRest = monthly.filter((t) => !hasOwnDeadline(t, new Set([mk])));
  for (const a of spreadOverDays(monthlyRest.map((t) => ({ taskId: t.id, points: t.points })), monthDays, busyByMonth[mk] || {}, assigned)) {
    push(a.taskId, a.date, 'monthly');
  }

  if (m % 3 === 0) {
    const qMonths = [m, m + 1, m + 2];
    const qDays = [];
    const qBusy = {};
    for (const qm of qMonths) {
      Object.assign(qBusy, busyByMonth[monthKey(y, qm)] || {});
      const dim2 = daysInMonth(y, qm);
      for (let d = 1; d <= dim2; d++) {
        const iso = isoDate(y, qm, d);
        if (iso >= todayIso) qDays.push(iso);
      }
    }
    const quarterly = tasks.filter((t) => (t.freq === 'quarterly' || t.freq === 'yearly') && !(statsOf(t).lastDone && sameMonth(statsOf(t).lastDone, y, m)));
    const qKeys = new Set(qMonths.map((qm) => monthKey(y, qm)));
    for (const t of quarterly) {
      if (hasOwnDeadline(t, qKeys)) push(t.id, t.deadline, 'quarterly');
    }
    const qRest = quarterly.filter((t) => !hasOwnDeadline(t, qKeys));
    for (const a of spreadOverDays(qRest.map((t) => ({ taskId: t.id, points: t.points })), qDays, qBusy, assigned)) {
      push(a.taskId, a.date, 'quarterly');
    }
  }
  return assignments;
}

/* ---------- Agenda-bundels (taken groeperen per dag) ---------- */

const GROUPS = {
  sanitair: '🚿 Sanitair (badkamer + wc)',
  stofzuigen: '🧹 Stofzuigen (alle kamers)',
  planten: '🪴 Plantenzorgen',
};

const GROUP_RULES = [
  { group: 'sanitair', match: (t) => t.roomId === 'ba' || t.roomId === 'wc' },
  { group: 'stofzuigen', match: (t) => /stofzuig/i.test(t.title) },
  { group: 'planten', match: (t) => /plant/i.test(t.title) },
];

function bundleAssignments(assignments, taskById) {
  const byKey = {};
  const order = [];
  for (const a of assignments) {
    const t = taskById(a.taskId);
    const g = (t && t.group) || null;
    const key = g ? a.date + '|' + g : a.date + '|' + a.taskId;
    if (!byKey[key]) {
      byKey[key] = { date: a.date, group: g, taskIds: [] };
      order.push(key);
    }
    byKey[key].taskIds.push(a.taskId);
  }
  return order.map((k) => byKey[k]);
}

const BADGES = [
  { id: 'first',    icon: '🌱', name: 'Eerste klus',          desc: 'Rond je eerste schoonmaakklus af.',            check: (s) => s.history.length >= 1 },
  { id: 'ten',      icon: '🧽', name: 'Handig bezig',         desc: '10 klussen voltooid.',                         check: (s) => s.history.length >= 10 },
  { id: 'fifty',    icon: '🧹', name: 'Schoonmaak-pro',       desc: '50 klussen voltooid.',                         check: (s) => s.history.length >= 50 },
  { id: 'hundred',  icon: '👑', name: 'Meester van het huis', desc: '100 klussen voltooid.',                        check: (s) => s.history.length >= 100 },
  { id: 'streak3',  icon: '🔥', name: 'In de flow',           desc: '3x op rij dezelfde klus op tijd.',            check: (s, now) => s.tasks.some((t) => taskStats(s, t, now).streak >= 3) },
  { id: 'streak7',  icon: '⚡', name: 'Streak-beest',         desc: '7x op rij dezelfde klus op tijd.',            check: (s, now) => s.tasks.some((t) => taskStats(s, t, now).streak >= 7) },
  { id: 'spotless', icon: '✨', name: 'Spik en span',         desc: 'Alle klussen in alle kamers zijn bij.',         check: (s, now) => s.tasks.length > 0 && s.tasks.every((t) => !taskStats(s, t, now).due) },
  { id: 'early',    icon: '🐦', name: 'Vroege vogel',         desc: 'Een klus geklaard vóór 08:00 uur.',            check: (s) => s.history.some((h) => new Date(h.ts).getHours() < 8) },
  { id: 'xp500',    icon: '💎', name: 'XP-jager',             desc: 'Verzamel in totaal 500 XP.',                   check: (s) => xpTotal(s) >= 500 },
];

function checkBadges(state, now) {
  const unlocked = [];
  for (const b of BADGES) {
    if (!state.badges[b.id] && b.check(state, now)) {
      state.badges[b.id] = now;
      unlocked.push(b);
    }
  }
  return unlocked;
}

function seedState() {
  const now = Date.now();
  const rooms = [
    { id: 'wk',  name: 'Woonkamer',  icon: '🛋️' },
    { id: 'ke',  name: 'Keuken',      icon: '🍳' },
    { id: 'we',  name: 'Werkplek',    icon: '💻' },
    { id: 'sl',  name: 'Slaapkamer',  icon: '🛏️' },
    { id: 'ba',  name: 'Badkamer',    icon: '🚿' },
    { id: 'wc',  name: 'Wc',          icon: '🚽' },
    { id: 'ga',  name: 'Gang',        icon: '🚪' },
    { id: 'bal', name: 'Balkon',      icon: '🌿' },
    { id: 'pl',  name: 'Planten',     icon: '🪴' },
  ];
  const T = (roomId, title, freq, points) => ({ id: uid(), roomId, title, freq, points });
  const tasks = [
    T('wk', 'Stofzuigen', 'weekly', 10),
    T('wk', 'Stof afnemen', 'biweekly', 10),
    T('wk', 'Vloer dweilen', 'biweekly', 10),
    T('wk', 'Bank en kussens uitkloppen', 'monthly', 5),
    T('wk', 'Ramen lappen', 'quarterly', 15),
    T('ke', 'Aanrecht en kraan schoonmaken', 'daily', 5),
    T('ke', 'Vaatwasser leegruimen', 'daily', 5),
    T('ke', 'Prullenbak legen', 'daily', 5),
    T('ke', 'Kookplaat reinigen', 'weekly', 10),
    T('ke', 'Keukenvloer vegen en dweilen', 'weekly', 10),
    T('ke', 'Koelkast nakijken en schoonmaken', 'monthly', 10),
    T('ke', 'Keukenkastjes afnemen', 'quarterly', 15),
    T('we', 'Bureau afnemen', 'weekly', 5),
    T('we', 'Stofzuigen onder en om het bureau', 'weekly', 10),
    T('we', 'Kabels en bureaula opruimen', 'weekly', 5),
    T('we', 'Beeldscherm schoonmaken', 'biweekly', 5),
    T('we', 'Bureaustoel afnemen', 'monthly', 5),
    T('sl', 'Bed verschonen', 'biweekly', 10),
    T('sl', 'Stofzuigen', 'weekly', 10),
    T('sl', 'Kleding opruimen', 'daily', 5),
    T('sl', 'Stof afnemen', 'monthly', 10),
    T('ba', 'Douche en tegels schoonmaken', 'weekly', 15),
    T('ba', 'Wastafel en spiegel afnemen', 'weekly', 5),
    T('ba', 'Badkamervloer dweilen', 'weekly', 10),
    T('ba', 'Handdoeken wassen', 'biweekly', 5),
    T('ba', 'Douchewand/gordijn ontkalken', 'monthly', 15),
    T('wc', 'Wc schoonmaken', 'weekly', 10),
    T('wc', 'Wc-vloer dweilen', 'weekly', 5),
    T('wc', 'Handdoekje en zeep aanvullen', 'weekly', 5),
    T('ga', 'Stofzuigen', 'weekly', 10),
    T('ga', 'Schoenen en jassen opruimen', 'daily', 5),
    T('ga', 'Deurmat uitslaan', 'monthly', 5),
    T('bal', 'Balkonvloer vegen', 'weekly', 10),
    T('bal', 'Balkonplanten water geven', 'weekly', 10),
    T('bal', 'Balkonplanten checken op zieke bladeren', 'weekly', 5),
    T('bal', 'Balkondeur en ramen lappen', 'quarterly', 10),
    T('pl', 'Binnenplanten water geven', 'weekly', 10),
    T('pl', 'Bladeren afnemen (stof verwijderen)', 'biweekly', 10),
    T('pl', 'Vergeelde of zieke bladeren verwijderen', 'weekly', 5),
    T('pl', 'Onderzetters en potten schoonmaken', 'monthly', 10),
    T('pl', 'Grote planten verpotten', 'quarterly', 15),
  ];
  for (const t of tasks) {
    const r = GROUP_RULES.find((x) => x.match(t));
    if (r) t.group = r.group;
  }
  return { version: 1, createdAt: now, rooms, tasks, history: [], badges: {}, planned: [], lastPlanMonth: null, gcalClientId: '', pinEnabled: false, pinHash: null };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DAY, FREQS, POINT_OPTIONS, BADGES,
    uid, hashPin, freqDays, taskEntries, taskStats, roomScore, xpTotal, levelInfo,
    bestStreak, startOfToday, doneToday, dueTasks, checkBadges, seedState,
    pad2, isoDate, daysInMonth, monthKey, dayNum, sameMonth, busyFromEvents,
    demoBusyMap, nextDueDate, spreadOverDays, planMonth,
    GROUPS, GROUP_RULES, bundleAssignments,
  };
}

/* ---------- App (alleen in de browser) ---------- */

if (typeof document !== 'undefined') {
  const STORAGE_KEY = 'schoonmaakQuest.v1';
  const ROOM_ICONS = ['🛋️', '🍳', '🛏️', '🚿', '🚽', '🚪', '🌿', '📚', '🧺', '🖥️', '🐱', '🎸', '🏠', '🚲', '🧸'];

  let state = load();
  let currentTab = 'dashboard';
  let roomFilter = 'all';
  let toastTimer = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s && Array.isArray(s.tasks) && Array.isArray(s.rooms)) {
          if (!Array.isArray(s.planned)) s.planned = [];
          if (!s.lastPlanMonth) s.lastPlanMonth = null;
          if (!s.gcalClientId) s.gcalClientId = '';
          if (typeof s.pinEnabled !== 'boolean') s.pinEnabled = false;
          if (!s.pinHash) s.pinHash = null;
          return s;
        }
      }
    } catch (e) { /* kapotte data -> seed */ }
    return seedState();
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtDate(ts) {
    return new Date(ts).toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  function fmtDay(ts) {
    return new Date(ts).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' });
  }

  function scoreColor(p) {
    if (p >= 80) return 'var(--green)';
    if (p >= 50) return 'var(--amber)';
    return 'var(--red)';
  }

  function roomName(roomId) {
    const r = state.rooms.find((x) => x.id === roomId);
    return r ? r.name : 'Onbekend';
  }

  function roomOf(task) {
    return state.rooms.find((x) => x.id === task.roomId);
  }

  function greeting(now) {
    const h = new Date(now).getHours();
    if (h < 12) return 'Goedemorgen';
    if (h < 18) return 'Goedemiddag';
    return 'Goedenavond';
  }

  /* ----- Acties ----- */

  function completeTask(taskId) {
    const task = state.tasks.find((t) => t.id === taskId);
    if (!task) return;
    const now = Date.now();
    state.history.push({ id: uid(), taskId, ts: now, points: task.points });
    const unlocked = checkBadges(state, now);
    save();
    render();
    showToast(`+${task.points} XP — “${task.title}” geklaard!`, { label: 'Ongedaan maken', action: 'undo-last' });
    unlocked.forEach((b, i) => {
      setTimeout(() => showToast(`🏆 Badge ontgrendeld: ${b.icon} ${b.name}`, null), 400 * (i + 1));
    });
    scheduleNextEvent(task).catch(() => {});
  }

  function undoLast() {
    if (!state.history.length) return;
    state.history.pop();
    save();
    render();
    showToast('Laatste klus ongedaan gemaakt.', null);
  }

  function addTask(title, roomId, freq, points, group, deadline) {
    state.tasks.push({
      id: uid(), roomId, title, freq, points: Number(points),
      group: group || null,
      deadline: freq === 'daily' ? null : (deadline || null),
    });
    save();
    render();
  }

  function updateTask(id, fields) {
    const t = state.tasks.find((x) => x.id === id);
    if (!t) return;
    t.title = fields.title;
    t.roomId = fields.roomId;
    t.freq = fields.freq;
    t.points = Number(fields.points);
    t.group = fields.group || null;
    t.deadline = fields.freq === 'daily' ? null : (fields.deadline || null);
    save();
    render();
    showToast('✏️ Taak opgeslagen.', null);
  }

  function deleteTask(taskId) {
    state.tasks = state.tasks.filter((t) => t.id !== taskId);
    state.history = state.history.filter((h) => h.taskId !== taskId);
    save();
    render();
  }

  function addRoom(name, icon) {
    state.rooms.push({ id: uid(), name, icon });
    save();
    render();
  }

  function deleteRoom(roomId) {
    if (!confirm('Kamer verwijderen inclusief alle taken en historie?')) return;
    state.rooms = state.rooms.filter((r) => r.id !== roomId);
    const taskIds = new Set(state.tasks.filter((t) => t.roomId === roomId).map((t) => t.id));
    state.tasks = state.tasks.filter((t) => t.roomId !== roomId);
    state.history = state.history.filter((h) => !taskIds.has(h.taskId));
    save();
    render();
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'schoonmaakquest-backup.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const s = JSON.parse(reader.result);
        if (!s || !Array.isArray(s.tasks) || !Array.isArray(s.rooms)) throw new Error('ongeldig');
        state = s;
        save();
        render();
        showToast('Backup geïmporteerd.', null);
      } catch (e) {
        showToast('Importeren mislukt: ongeldig bestand.', null);
      }
    };
    reader.readAsText(file);
  }

  function resetData() {
    if (!confirm('Alle data wissen en opnieuw beginnen met de standaardkamers?')) return;
    state = seedState();
    save();
    render();
    showToast('Opnieuw begonnen met standaardindeling.', null);
  }

  /* ----- Toast ----- */

  function showToast(msg, action) {
    const toast = document.getElementById('toast');
    clearTimeout(toastTimer);
    toast.innerHTML = `<span>${esc(msg)}</span>`;
    if (action) {
      const btn = document.createElement('button');
      btn.textContent = action.label;
      btn.dataset.action = action.action;
      toast.appendChild(btn);
    }
    toast.classList.remove('hidden');
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
  }

  /* ----- Rendering ----- */

  function renderHeader(now) {
    const li = levelInfo(state);
    document.getElementById('levelBadge').textContent = 'Lv ' + li.level;
    document.getElementById('xpFill').style.width = Math.round(li.progress * 100) + '%';
    document.getElementById('xpText').textContent = `${li.remaining} / ${li.need} XP (totaal ${li.xp})`;
    document.getElementById('doneTodayChip').textContent = `✅ ${doneToday(state, now)} vandaag`;
  }

  function taskRow(t, now) {
    const st = taskStats(state, t, now);
    const room = roomOf(t);
    const freq = FREQS[t.freq] || FREQS.weekly;
    return `
      <div class="task ${st.due ? '' : 'done'}">
        <button class="check-btn" data-action="complete" data-id="${t.id}" title="Afvinken">${st.due ? '' : '✓'}</button>
        <div class="task-body">
          <div class="task-title">${esc(t.title)}</div>
          <div class="task-meta">
            <span class="tag room">${room ? esc(room.icon + ' ' + room.name) : ''}</span>
            ${t.group ? `<span class="tag">${esc(GROUPS[t.group] || t.group)}</span>` : ''}
            <span class="tag freq">${freq.label}</span>
            <span class="tag pts">⭐ ${t.points}</span>
            ${t.deadline ? `<span class="tag deadline">⏰ ${esc(t.deadline)}</span>` : ''}
            ${st.streak > 1 ? `<span class="tag streak">🔥 ${st.streak}x</span>` : ''}
            ${st.due ? '<span class="tag due">te doen</span>' : `<span class="tag">klaar · ${fmtDate(st.lastDone)}</span>`}
          </div>
        </div>
        <button class="icon-btn" data-action="edit-task" data-id="${t.id}" title="Taak aanpassen">✏️</button>
        <button class="icon-btn" data-action="delete-task" data-id="${t.id}" title="Taak verwijderen">🗑️</button>
      </div>`;
  }

  function renderDashboard(now) {
    const el = document.getElementById('view-dashboard');
    const due = dueTasks(state, now);
    const done = doneToday(state, now);
    const streak = bestStreak(state, now);
    const cleanRooms = state.rooms.filter((r) => roomScore(state, r.id, now) === 100).length;

    const roomCards = state.rooms.map((r) => {
      const score = roomScore(state, r.id, now);
      const tasks = state.tasks.filter((t) => t.roomId === r.id);
      const dueCount = tasks.filter((t) => taskStats(state, t, now).due).length;
      return `
        <div class="card room-card" data-action="filter-room" data-id="${r.id}" title="Bekijk taken van ${esc(r.name)}">
          <div class="room-left">
            <div class="room-icon">${esc(r.icon)}</div>
            <div class="room-text">
              <div class="room-name">${esc(r.name)}</div>
              <div class="room-sub">${tasks.length - dueCount}/${tasks.length} klaar${dueCount ? ` · ${dueCount} te doen` : ''}</div>
            </div>
          </div>
          <div class="ring" style="--p:${score}; --c:${scoreColor(score)}" title="Schoonmaak-score: ${score}%"><span>${score}%</span></div>
        </div>`;
    }).join('');

    const dueList = due.length
      ? due.slice(0, 8).map((x) => taskRow(x.task, now)).join('') +
        (due.length > 8 ? `<div class="room-sub">… en nog ${due.length - 8} meer op het tabblad ✅ Taken</div>` : '')
      : `<div class="empty">🎉 Alles is spik en span! Geen openstaande klussen.</div>`;

    el.innerHTML = `
      <h2>${greeting(now)}! 👋</h2>
      <div class="summary">
        <span class="chip">📌 ${due.length} te doen</span>
        <span class="chip">✅ ${done} vandaag gedaan</span>
        <span class="chip">🔥 beste streak ${streak}x</span>
        <span class="chip">✨ ${cleanRooms}/${state.rooms.length} kamers 100%</span>
      </div>
      <h3>Kamers</h3>
      <div class="grid">${roomCards || '<div class="empty">Nog geen kamers — voeg ze toe op het tabblad 🚪 Kamers.</div>'}</div>
      <h3>Nu te doen</h3>
      <div class="list">${dueList}</div>`;
  }

  function renderTasks(now) {
    const el = document.getElementById('view-tasks');
    const roomOptions = ['<option value="all"' + (roomFilter === 'all' ? ' selected' : '') + '>Alle kamers</option>',
      '<option value="__vandaag__"' + (roomFilter === '__vandaag__' ? ' selected' : '') + '>📌 Te doen (vandaag)</option>']
      .concat(state.rooms.map((r) => `<option value="${r.id}"${roomFilter === r.id ? ' selected' : ''}>${esc(r.icon + ' ' + r.name)}</option>`))
      .join('');

    const freqOptions = Object.entries(FREQS)
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    const pointsOptions = POINT_OPTIONS.map((p) => `<option value="${p}">⭐ ${p} XP</option>`).join('');
    const roomSelectOptions = state.rooms
      .map((r) => `<option value="${r.id}">${esc(r.icon + ' ' + r.name)}</option>`).join('');
    const groupOptions = Object.entries(GROUPS)
      .map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

    let tasks = state.tasks.slice();
    if (roomFilter === '__vandaag__') tasks = dueTasks(state, now).map((x) => x.task);
    else if (roomFilter !== 'all') tasks = tasks.filter((t) => t.roomId === roomFilter);
    tasks.sort((a, b) => {
      const sa = taskStats(state, a, now);
      const sb = taskStats(state, b, now);
      if (sa.due !== sb.due) return sa.due ? -1 : 1;
      if (sa.due) return freqDays(a.freq) - freqDays(b.freq);
      return (sa.lastDone || 0) - (sb.lastDone || 0);
    });

    el.innerHTML = `
      <h2>Taken</h2>
      <form class="form" id="add-task-form">
        <input type="text" id="new-task-title" placeholder="Nieuwe klus, bijv. 'Spiegel blinkend maken'" required maxlength="80" />
        <select id="new-task-room">${roomSelectOptions}</select>
        <select id="new-task-freq">${freqOptions}</select>
        <select id="new-task-points">${pointsOptions}</select>
        <select id="new-task-group" title="Bundel in de agenda"><option value="">Geen agenda-bundel</option>${groupOptions}</select>
        <label class="room-sub" title="Deadline (alleen voor wekelijks of langer)">⏰ <input type="date" id="new-task-deadline" /></label>
        <button type="submit">+ Toevoegen</button>
      </form>
      <div class="controls">
        <label class="room-sub">Filter:</label>
        <select id="room-filter">${roomOptions}</select>
      </div>
      <div class="list">
        ${tasks.length ? tasks.map((t) => taskRow(t, now)).join('') : '<div class="empty">Geen taken in deze selectie.</div>'}
      </div>`;

    document.getElementById('add-task-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const title = document.getElementById('new-task-title').value.trim();
      if (!title) return;
      addTask(
        title,
        document.getElementById('new-task-room').value,
        document.getElementById('new-task-freq').value,
        document.getElementById('new-task-points').value,
        document.getElementById('new-task-group').value,
        document.getElementById('new-task-deadline').value
      );
    });
    const freqSel = document.getElementById('new-task-freq');
    const dlInput = document.getElementById('new-task-deadline');
    if (freqSel && dlInput) {
      const syncDl = () => { dlInput.disabled = freqSel.value === 'daily'; if (freqSel.value === 'daily') dlInput.value = ''; };
      freqSel.addEventListener('change', syncDl);
      syncDl();
    }
    document.getElementById('room-filter').addEventListener('change', (e) => {
      roomFilter = e.target.value;
      render();
    });
  }

  function renderRooms(now) {
    const el = document.getElementById('view-rooms');
    const iconOptions = ROOM_ICONS.map((ic) => `<option value="${ic}">${ic}</option>`).join('');
    const rows = state.rooms.map((r) => {
      const score = roomScore(state, r.id, now);
      const count = state.tasks.filter((t) => t.roomId === r.id).length;
      return `
        <div class="task room-row" data-action="filter-room" data-id="${r.id}" title="Bekijk taken van ${esc(r.name)}">
          <div class="room-icon">${esc(r.icon)}</div>
          <div class="task-body">
            <div class="task-title">${esc(r.name)}</div>
            <div class="task-meta">
              <span class="tag">${count} taken</span>
              <span class="tag" style="background:${score >= 80 ? '#f0fdf4' : score >= 50 ? '#fffbeb' : '#fef2f2'}">score ${score}%</span>
            </div>
          </div>
          <button class="icon-btn" data-action="delete-room" data-id="${r.id}" title="Kamer verwijderen">🗑️</button>
        </div>`;
    }).join('');

    el.innerHTML = `
      <h2>Kamers</h2>
      <form class="form" id="add-room-form">
        <input type="text" id="new-room-name" placeholder="Naam van de kamer" required maxlength="40" />
        <select id="new-room-icon">${iconOptions}</select>
        <button type="submit">+ Kamer toevoegen</button>
      </form>
      <div class="list">${rows || '<div class="empty">Nog geen kamers.</div>'}</div>`;

    document.getElementById('add-room-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = document.getElementById('new-room-name').value.trim();
      if (!name) return;
      addRoom(name, document.getElementById('new-room-icon').value);
    });
  }

  function renderBadges(now) {
    const el = document.getElementById('view-badges');
    const cards = BADGES.map((b) => {
      const ts = state.badges[b.id];
      return `
        <div class="card badge-card ${ts ? '' : 'locked'}">
          <div class="b-icon">${ts ? b.icon : '🔒'}</div>
          <div class="b-name">${esc(b.name)}</div>
          <div class="b-desc">${esc(b.desc)}</div>
          ${ts ? `<div class="b-date">ontgrendeld ${fmtDate(ts)}</div>` : ''}
        </div>`;
    }).join('');
    const count = Object.keys(state.badges).length;
    el.innerHTML = `<h2>Badges</h2>
      <div class="summary"><span class="chip">🏆 ${count}/${BADGES.length} ontgrendeld</span></div>
      <div class="badge-grid">${cards}</div>`;
  }

  function renderStats(now) {
    const el = document.getElementById('view-stats');
    const li = levelInfo(state);
    const days = [];
    for (let i = 13; i >= 0; i--) {
      const start = startOfToday(now) - i * DAY;
      const end = start + DAY;
      const count = state.history.filter((h) => h.ts >= start && h.ts < end).length;
      days.push({ label: new Date(start).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric' }), count });
    }
    const max = Math.max(1, ...days.map((d) => d.count));
    const chart = days.map((d) => `
      <div class="bar-wrap">
        <div class="bar" style="height:${Math.max(3, Math.round((d.count / max) * 100))}%" title="${d.count} klussen"></div>
        <div class="bar-label">${esc(d.label)}</div>
      </div>`).join('');

    const recent = state.history.slice().sort((a, b) => b.ts - a.ts).slice(0, 25).map((h) => {
      const t = state.tasks.find((x) => x.id === h.taskId);
      return `
        <div class="task history-item">
          <div class="task-body">
            <div class="task-title">${t ? esc(t.title) : '(verwijderde taak)'}</div>
            <div class="task-meta">
              <span class="tag">⭐ ${h.points} XP</span>
              <span class="when">${fmtDate(h.ts)}</span>
            </div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <h2>Statistieken</h2>
      <div class="stat-grid">
        <div class="card stat-card"><div class="stat-num">${state.history.length}</div><div class="stat-label">klussen totaal</div></div>
        <div class="card stat-card"><div class="stat-num">${li.xp}</div><div class="stat-label">XP totaal</div></div>
        <div class="card stat-card"><div class="stat-num">Lv ${li.level}</div><div class="stat-label">huidig level</div></div>
        <div class="card stat-card"><div class="stat-num">🔥 ${bestStreak(state, now)}x</div><div class="stat-label">beste streak</div></div>
        <div class="card stat-card"><div class="stat-num">${Object.keys(state.badges).length}/${BADGES.length}</div><div class="stat-label">badges</div></div>
        <div class="card stat-card"><div class="stat-num">${doneToday(state, now)}</div><div class="stat-label">vandaag gedaan</div></div>
      </div>
      <h3>Laatste 14 dagen</h3>
      <div class="card chart">${chart}</div>
      <h3>Recente activiteit</h3>
      <div class="list">${recent || '<div class="empty">Nog geen activiteit.</div>'}</div>`;
  }

  function renderSettings() {
    const el = document.getElementById('view-settings');
    el.innerHTML = `
      <h2>Instellingen</h2>
      <div class="settings-row">
        <div class="card">
          <h3 style="margin-top:0">💾 Backup</h3>
          <p>Je data staat lokaal in deze browser (localStorage). Maak regelmatig een backup of neem hem mee naar een ander apparaat.</p>
          <div class="settings-actions">
            <button class="btn" data-action="export">⬇️ Exporteer data (JSON)</button>
            <label class="btn secondary" style="cursor:pointer">⬆️ Importeer backup
              <input type="file" id="import-file" accept="application/json" class="hidden" />
            </label>
          </div>
        </div>
        <div class="card">
          <h3 style="margin-top:0">🔒 PIN-lock</h3>
          <p>Vergrendelt de app bij het openen met een PIN (handig op een gedeelde telefoon). Let op: client-side is dit een afschrikmiddel, geen echte beveiliging — voor echte toegangsbeveiliging zet je bijv. Cloudflare Access vóór je GitHub Pages-site (zie README).</p>
          ${state.pinEnabled ? `
            <div class="settings-actions">
              <button class="btn secondary" data-action="lock-now">🔒 Nu vergrendelen</button>
            </div>
            <form class="form" id="pin-disable-form" style="margin-top:10px">
              <input type="password" id="pin-disable" inputmode="numeric" placeholder="PIN (om uit te schakelen)" required />
              <button type="submit" class="btn danger">Uitschakelen</button>
            </form>` : `
            <form class="form" id="pin-setup-form">
              <input type="password" id="pin-new" inputmode="numeric" pattern="[0-9]*" placeholder="Kies een PIN (min. 4 tekens)" required />
              <input type="password" id="pin-new2" inputmode="numeric" pattern="[0-9]*" placeholder="Herhaal PIN" required />
              <button type="submit">PIN instellen</button>
            </form>`}
        </div>
        <div class="card">
          <h3 style="margin-top:0">🔄 Opnieuw beginnen</h3>
          <p>Wis alle voortgang en start opnieuw met de standaardindeling voor een appartement van ca. 60 m².</p>
          <div class="settings-actions">
            <button class="btn danger" data-action="reset">🗑️ Alles wissen en opnieuw beginnen</button>
          </div>
        </div>
      </div>`;
    document.getElementById('import-file').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) importData(e.target.files[0]);
      e.target.value = '';
    });
    const setupForm = document.getElementById('pin-setup-form');
    if (setupForm) setupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const a = document.getElementById('pin-new').value;
      const b = document.getElementById('pin-new2').value;
      if (a.length < 4) { showToast('PIN moet minstens 4 tekens zijn.', null); return; }
      if (a !== b) { showToast('PINs komen niet overeen.', null); return; }
      await setupPin(a);
    });
    const disableForm = document.getElementById('pin-disable-form');
    if (disableForm) disableForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await disablePin(document.getElementById('pin-disable').value);
    });
  }

  /* ----- PIN-lock (client-side) ----- */

  async function hashPinAsync(pin) {
    try {
      if (typeof window !== 'undefined' && window.crypto && window.crypto.subtle) {
        const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode('schoonmaakquest:' + pin));
        return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      }
    } catch (e) { /* val terug op sync hash */ }
    return hashPin(pin);
  }

  function isUnlocked() {
    try { return sessionStorage.getItem('schoonmaakQuest.unlocked') === '1'; } catch (e) { return false; }
  }

  function showLock() {
    const ov = document.getElementById('lock-overlay');
    if (ov) ov.classList.remove('hidden');
    const inp = document.getElementById('lock-pin');
    if (inp) inp.focus();
  }

  function hideLock() {
    try { sessionStorage.setItem('schoonmaakQuest.unlocked', '1'); } catch (e) { /* negeer */ }
    const ov = document.getElementById('lock-overlay');
    if (ov) ov.classList.add('hidden');
  }

  async function tryUnlock() {
    const inp = document.getElementById('lock-pin');
    const v = (inp && inp.value ? inp.value : '').trim();
    if (!v) return;
    const h = await hashPinAsync(v);
    if (state.pinEnabled && h === state.pinHash) {
      hideLock();
      showToast('🔓 Ontgrendeld.', null);
    } else {
      showToast('Onjuiste PIN.', null);
      if (inp) { inp.value = ''; inp.focus(); }
    }
  }

  async function setupPin(pin) {
    state.pinHash = await hashPinAsync(pin);
    state.pinEnabled = true;
    save();
    hideLock();
    render();
    showToast('🔒 PIN-lock ingeschakeld.', null);
  }

  async function disablePin(pin) {
    const h = await hashPinAsync(pin);
    if (h !== state.pinHash) { showToast('Onjuiste PIN.', null); return; }
    state.pinEnabled = false;
    state.pinHash = null;
    save();
    render();
    showToast('PIN-lock uitgeschakeld.', null);
  }

  function lockNow() {
    try { sessionStorage.removeItem('schoonmaakQuest.unlocked'); } catch (e) { /* negeer */ }
    showLock();
  }

  /* ----- Automatische agenda-events bij terugkerende taken ----- */

  async function scheduleNextEvent(task) {
    if (!gcalToken) return;
    if (!['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'].includes(task.freq)) return;
    const now = Date.now();
    const st = taskStats(state, task, now);
    const todayIso = isoDate(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate());
    const date = task.deadline && task.deadline >= todayIso ? task.deadline : nextDueDate(st, task.freq, now);
    const key = task.id + '@' + date;
    if (state.planned.some((p) => p.taskId + '@' + p.date === key)) return;
    const group = task.group || null;
    const existing = group
      ? state.planned.find((p) => p.date === date && p.eventId && p.taskId !== task.id && ((state.tasks.find((t) => t.id === p.taskId) || {}).group || null) === group)
      : null;
    try {
      if (existing) {
        const mates = state.planned
          .filter((p) => p.eventId === existing.eventId)
          .map((p) => state.tasks.find((t) => t.id === p.taskId))
          .filter(Boolean)
          .concat([task]);
        await gcalApi('/calendars/primary/events/' + existing.eventId, { method: 'PATCH', body: JSON.stringify({ description: eventDescription(mates) }) });
        state.planned.push({ taskId: task.id, date: date, freq: task.freq, eventId: existing.eventId, demo: false, plannedAt: now });
        save();
        showToast(`📅 “${task.title}” toegevoegd aan de bundel op ${date}.`, null);
      } else {
        const eventId = await gcalCreateEvent('🧹 ' + task.title, date, eventDescription([task]));
        state.planned.push({ taskId: task.id, date: date, freq: task.freq, eventId: eventId, demo: false, plannedAt: now });
        save();
        showToast(`📅 Volgende “${task.title}” in je agenda op ${date}.`, null);
      }
    } catch (err) {
      showToast('Agenda-event mislukt: ' + err.message, null);
    }
  }

  /* ----- Google Calendar (client-side OAuth, alleen in browser) ----- */

  const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
  let gcalToken = null;
  try { gcalToken = sessionStorage.getItem('schoonmaakQuest.gcalToken'); } catch (e) { /* geen sessionStorage */ }

  function setGcalToken(t) {
    gcalToken = t;
    try {
      if (t) sessionStorage.setItem('schoonmaakQuest.gcalToken', t);
      else sessionStorage.removeItem('schoonmaakQuest.gcalToken');
    } catch (e) { /* negeer */ }
  }

  function gcalLoadScript() {
    return new Promise((resolve, reject) => {
      if (window.google && window.google.accounts) return resolve();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Google Identity-script kon niet laden'));
      document.head.appendChild(s);
    });
  }

  async function gcalConnect(clientId) {
    await gcalLoadScript();
    return new Promise((resolve, reject) => {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: GCAL_SCOPE,
        callback: (resp) => {
          if (resp && resp.error) reject(new Error(resp.error));
          else { setGcalToken(resp.access_token); resolve(resp.access_token); }
        },
      });
      client.requestAccessToken({ prompt: 'consent' });
    });
  }

  async function gcalApi(path, options) {
    const resp = await fetch('https://www.googleapis.com/calendar/v3' + path, {
      ...(options || {}),
      headers: { Authorization: 'Bearer ' + gcalToken, 'Content-Type': 'application/json', ...((options && options.headers) || {}) },
    });
    if (!resp.ok) throw new Error('Google Calendar API fout ' + resp.status);
    return resp.json();
  }

  async function gcalFetchBusy(timeMin, timeMax) {
    const data = await gcalApi('/calendars/primary/events?singleEvents=true&orderBy=startTime&maxResults=250&timeMin=' + encodeURIComponent(timeMin) + '&timeMax=' + encodeURIComponent(timeMax));
    return busyFromEvents(data.items || []);
  }

  function eventDescription(tasks) {
    const lines = tasks.map((t) => {
      const r = roomOf(t);
      return '• ' + t.title + ' (' + (r ? r.name : '-') + ') · ' + (FREQS[t.freq] ? FREQS[t.freq].label : t.freq) + ' · ⭐ ' + t.points + ' XP';
    });
    return lines.join('\n') + '\n— Schoonmaak Huis Sjors';
  }

  async function gcalCreateEvent(summary, date, description) {
    const p = date.split('-').map(Number);
    const end = isoDate(p[0], p[1] - 1, p[2] + 1);
    const body = {
      summary: summary,
      description: description,
      start: { date: date },
      end: { date: end },
    };
    const ev = await gcalApi('/calendars/primary/events', { method: 'POST', body: JSON.stringify(body) });
    return ev.id;
  }

  async function syncCalendar(demo) {
    const now = Date.now();
    const nowD = new Date(now);
    const y = nowD.getFullYear();
    const m = nowD.getMonth();
    const quarterStart = m % 3 === 0;
    const monthsNeeded = quarterStart ? [m, m + 1, m + 2] : [m];
    let busyByMonth = {};
    if (demo) {
      for (const qm of monthsNeeded) busyByMonth[monthKey(y, qm)] = demoBusyMap(y, qm);
    } else {
      const timeMin = new Date(y, monthsNeeded[0], 1).toISOString();
      const timeMax = new Date(y, monthsNeeded[monthsNeeded.length - 1] + 1, 1).toISOString();
      const busy = await gcalFetchBusy(timeMin, timeMax);
      for (const day of Object.keys(busy)) {
        const mk = day.slice(0, 7);
        busyByMonth[mk] = busyByMonth[mk] || {};
        busyByMonth[mk][day] = busy[day];
      }
    }
    const plannedKeys = state.planned.map((p) => p.taskId + '@' + p.date);
    const assignments = planMonth(state.tasks, (t) => taskStats(state, t, now), now, busyByMonth, plannedKeys);
    const taskById = (id) => state.tasks.find((t) => t.id === id);
    const bundles = bundleAssignments(assignments, taskById);
    let created = 0;
    for (const b of bundles) {
      const tasksIn = b.taskIds.map(taskById).filter(Boolean);
      if (!tasksIn.length) continue;
      const summary = b.group ? (GROUPS[b.group] || b.group) : '🧹 ' + tasksIn[0].title;
      let eventId = null;
      if (!demo) {
        try {
          eventId = await gcalCreateEvent(summary, b.date, eventDescription(tasksIn));
        } catch (err) {
          showToast('Agenda-fout bij “' + summary + '”: ' + err.message, null);
        }
      }
      for (const t of tasksIn) {
        state.planned.push({ taskId: t.id, date: b.date, freq: t.freq, eventId: eventId, demo: demo, plannedAt: now });
        created += 1;
      }
    }
    state.lastPlanMonth = monthKey(y, m);
    save();
    render();
    return { planned: assignments.length, created: created };
  }

  function renderAgenda(now) {
    const el = document.getElementById('view-agenda');
    const d = new Date(now);
    const y = d.getFullYear();
    const m = d.getMonth();
    const mk = monthKey(y, m);
    const earlyMonth = d.getDate() <= 3;
    const monthStart = isoDate(y, m, 1);
    const monthEnd = isoDate(y, m, daysInMonth(y, m));
    const planned = state.planned
      .filter((p) => p.date >= monthStart && p.date <= monthEnd)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const taskById = (id) => state.tasks.find((x) => x.id === id);
    const bundles = bundleAssignments(planned.map((p) => ({ taskId: p.taskId, date: p.date, freq: p.freq })), taskById);
    const rows = bundles.map((b) => {
      const tasksIn = b.taskIds.map(taskById).filter(Boolean);
      const title = b.group ? (GROUPS[b.group] || b.group) : (tasksIn[0] ? tasksIn[0].title : '(verwijderde taak)');
      const sub = tasksIn.map((t) => (roomOf(t) ? roomOf(t).icon : '') + ' ' + t.title).join(' · ');
      const first = planned.find((p) => p.taskId === b.taskIds[0] && p.date === b.date);
      return `
        <div class="task">
          <div class="task-body">
            <div class="task-title">${esc(title)}${b.taskIds.length > 1 ? ` <span class="tag">bundel · ${b.taskIds.length} taken</span>` : ''}</div>
            <div class="task-meta">
              <span class="tag freq">${esc(b.date)}</span>
              <span class="tag">${esc(sub)}</span>
              ${first && first.demo ? '<span class="tag">demo</span>' : '<span class="tag" style="background:#eff6ff;color:#1d4ed8;border-color:#dbeafe">Google Agenda</span>'}
            </div>
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <h2>Agenda 📅</h2>
      ${earlyMonth && state.lastPlanMonth !== mk ? '<div class="empty">🎯 Begin van de maand en nog niet ingepland — plan deze maand! Maandelijkse en kwartaal-taken worden gespreid over je minst drukke dagen.</div>' : ''}
      <div class="card" style="margin-bottom:14px">
        <h3 style="margin-top:0">Google Calendar-koppeling</h3>
        <p class="room-sub">Wekelijkse/2-wekelijkse taken komen op hun vervaldatum in je agenda. Maandelijkse en kwartaal-taken worden op de 1ste van de maand verdeeld over de dagen met de minste afspraken in je Google Agenda. Dagelijkse taken zet ik niet in je agenda.</p>
        <form class="form" id="gcal-form">
          <input type="text" id="gcal-client-id" placeholder="Google OAuth Client ID (zie README)" value="${esc(state.gcalClientId || '')}" />
          <button type="submit">${gcalToken ? '🔁 Opnieuw verbinden' : '🔗 Verbind met Google'}</button>
        </form>
        <div class="settings-actions">
          <button class="btn secondary" data-action="plan-demo">🗓️ Plan deze maand (demo)</button>
          <button class="btn" data-action="plan-real" ${gcalToken ? '' : 'disabled style="opacity:.5;cursor:not-allowed"'}>☁️ Sync naar Google Agenda</button>
        </div>
        <p class="room-sub" style="margin:8px 0 0">${gcalToken ? '✅ Verbonden met Google Calendar.' : 'Nog niet verbonden — vul je Client ID in en klik “Verbind met Google”, of gebruik de demo.'}</p>
      </div>
      <h3>Gepland deze maand (${bundles.length} agenda-items, ${planned.length} taken)</h3>
      <div class="list">${rows || '<div class="empty">Nog niets gepland voor ' + mk + '. Klik op “Plan deze maand”.</div>'}</div>`;

    document.getElementById('gcal-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const clientId = document.getElementById('gcal-client-id').value.trim();
      if (!clientId) { showToast('Vul eerst een Google OAuth Client ID in (zie README).', null); return; }
      state.gcalClientId = clientId;
      save();
      try {
        await gcalConnect(clientId);
        showToast('✅ Verbonden met Google Calendar.', null);
      } catch (err) {
        showToast('Verbinding mislukt: ' + err.message, null);
      }
      render();
    });
  }

  function renderProgress(now) {
    const li = levelInfo(state);
    const cleanRooms = state.rooms.filter((r) => roomScore(state, r.id, now) === 100).length;
    const card = document.getElementById('progress-card');
    if (!card) return;
    card.innerHTML = `
      <div class="lock-icon">🏆</div>
      <div class="lock-title">Level ${li.level}</div>
      <div class="xp-wrap" style="margin:10px auto;max-width:240px">
        <div class="xp-bar" style="background:#e5e7eb"><div class="xp-fill" style="width:${Math.round(li.progress * 100)}%"></div></div>
        <div class="xp-text" style="color:var(--muted)">${li.remaining} / ${li.need} XP naar level ${li.level + 1} · totaal ${li.xp} XP</div>
      </div>
      <div class="stat-grid" style="margin-top:12px">
        <div class="card stat-card"><div class="stat-num">${state.history.length}</div><div class="stat-label">klussen totaal</div></div>
        <div class="card stat-card"><div class="stat-num">🔥 ${bestStreak(state, now)}x</div><div class="stat-label">beste streak</div></div>
        <div class="card stat-card"><div class="stat-num">${Object.keys(state.badges).length}/${BADGES.length}</div><div class="stat-label">badges</div></div>
        <div class="card stat-card"><div class="stat-num">${cleanRooms}/${state.rooms.length}</div><div class="stat-label">kamers 100%</div></div>
        <div class="card stat-card"><div class="stat-num">${doneToday(state, now)}</div><div class="stat-label">vandaag gedaan</div></div>
        <div class="card stat-card"><div class="stat-num">${state.planned.length}</div><div class="stat-label">agenda-items gepland</div></div>
      </div>
      <div class="settings-actions" style="justify-content:center;margin-top:14px">
        <button class="btn" data-action="close-progress">Sluiten</button>
      </div>`;
    document.getElementById('progress-overlay').classList.remove('hidden');
  }

  let editTaskId = null;

  function openTaskEdit(taskId) {
    const t = state.tasks.find((x) => x.id === taskId);
    if (!t) return;
    editTaskId = taskId;
    document.getElementById('edit-task-title').value = t.title;
    const roomSel = document.getElementById('edit-task-room');
    roomSel.innerHTML = state.rooms.map((r) => `<option value="${r.id}">${esc(r.icon + ' ' + r.name)}</option>`).join('');
    roomSel.value = t.roomId;
    const freqSel = document.getElementById('edit-task-freq');
    freqSel.innerHTML = Object.entries(FREQS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    freqSel.value = t.freq;
    const ptsSel = document.getElementById('edit-task-points');
    ptsSel.innerHTML = POINT_OPTIONS.map((p) => `<option value="${p}">⭐ ${p} XP</option>`).join('');
    ptsSel.value = String(t.points);
    const grpSel = document.getElementById('edit-task-group');
    grpSel.innerHTML = '<option value="">Geen agenda-bundel</option>' + Object.entries(GROUPS).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
    grpSel.value = t.group || '';
    const dl = document.getElementById('edit-task-deadline');
    dl.value = t.deadline || '';
    dl.disabled = t.freq === 'daily';
    freqSel.onchange = () => { dl.disabled = freqSel.value === 'daily'; if (freqSel.value === 'daily') dl.value = ''; };
    document.getElementById('task-edit-overlay').classList.remove('hidden');
  }

  function saveTaskEdit(e) {
    e.preventDefault();
    if (!editTaskId) return;
    updateTask(editTaskId, {
      title: document.getElementById('edit-task-title').value.trim(),
      roomId: document.getElementById('edit-task-room').value,
      freq: document.getElementById('edit-task-freq').value,
      points: document.getElementById('edit-task-points').value,
      group: document.getElementById('edit-task-group').value,
      deadline: document.getElementById('edit-task-deadline').value,
    });
    document.getElementById('task-edit-overlay').classList.add('hidden');
    editTaskId = null;
  }

  function render() {
    const now = Date.now();
    renderHeader(now);
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === currentTab));
    document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
    document.getElementById('view-' + currentTab).classList.remove('hidden');
    if (currentTab === 'dashboard') renderDashboard(now);
    else if (currentTab === 'tasks') renderTasks(now);
    else if (currentTab === 'rooms') renderRooms(now);
    else if (currentTab === 'badges') renderBadges(now);
    else if (currentTab === 'stats') renderStats(now);
    else if (currentTab === 'agenda') renderAgenda(now);
    else if (currentTab === 'settings') renderSettings();
  }

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (action === 'tab') {
      currentTab = el.dataset.tab;
      render();
    } else if (action === 'complete') {
      completeTask(el.dataset.id);
    } else if (action === 'delete-task') {
      if (confirm('Deze taak verwijderen?')) deleteTask(el.dataset.id);
    } else if (action === 'delete-room') {
      deleteRoom(el.dataset.id);
    } else if (action === 'undo-last') {
      undoLast();
    } else if (action === 'filter-room') {
      currentTab = 'tasks';
      roomFilter = el.dataset.id;
      render();
    } else if (action === 'export') {
      exportData();
    } else if (action === 'reset') {
      resetData();
    } else if (action === 'plan-demo') {
      syncCalendar(true)
        .then((r) => showToast(`🗓️ ${r.created} klussen gepland voor deze maand (demo).`, null))
        .catch((err) => showToast('Plannen mislukt: ' + err.message, null));
    } else if (action === 'plan-real') {
      if (!gcalToken) { showToast('Verbind eerst met Google Calendar.', null); return; }
      syncCalendar(false)
        .then((r) => showToast(`☁️ ${r.created} klussen naar je Google Agenda gestuurd.`, null))
        .catch((err) => showToast('Sync mislukt: ' + err.message, null));
    } else if (action === 'lock-now') {
      lockNow();
    } else if (action === 'show-progress') {
      renderProgress(Date.now());
    } else if (action === 'close-progress') {
      document.getElementById('progress-overlay').classList.add('hidden');
    } else if (action === 'today-tasks') {
      currentTab = 'tasks';
      roomFilter = '__vandaag__';
      render();
    } else if (action === 'edit-task') {
      openTaskEdit(el.dataset.id);
    } else if (action === 'close-edit') {
      document.getElementById('task-edit-overlay').classList.add('hidden');
      editTaskId = null;
    }
  });

  const bootD = new Date();
  if (bootD.getDate() <= 3 && state.lastPlanMonth !== monthKey(bootD.getFullYear(), bootD.getMonth()) && gcalToken) {
    syncCalendar(false).catch(() => {});
  }

  const lockForm = document.getElementById('lock-form');
  if (lockForm) lockForm.addEventListener('submit', (e) => { e.preventDefault(); tryUnlock(); });
  if (state.pinEnabled && !isUnlocked()) showLock();

  const editForm = document.getElementById('task-edit-form');
  if (editForm) editForm.addEventListener('submit', saveTaskEdit);
  const progressOverlay = document.getElementById('progress-overlay');
  if (progressOverlay) progressOverlay.addEventListener('click', (e) => {
    if (e.target === progressOverlay) progressOverlay.classList.add('hidden');
  });

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof location !== 'undefined' && location.protocol.indexOf('http') === 0) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  render();
}
