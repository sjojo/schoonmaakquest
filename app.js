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
  return { version: 1, createdAt: now, rooms, tasks, history: [], badges: {} };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DAY, FREQS, POINT_OPTIONS, BADGES,
    uid, freqDays, taskEntries, taskStats, roomScore, xpTotal, levelInfo,
    bestStreak, startOfToday, doneToday, dueTasks, checkBadges, seedState,
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
        if (s && Array.isArray(s.tasks) && Array.isArray(s.rooms)) return s;
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
  }

  function undoLast() {
    if (!state.history.length) return;
    state.history.pop();
    save();
    render();
    showToast('Laatste klus ongedaan gemaakt.', null);
  }

  function addTask(title, roomId, freq, points) {
    state.tasks.push({ id: uid(), roomId, title, freq, points: Number(points) });
    save();
    render();
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
            <span class="tag freq">${freq.label}</span>
            <span class="tag pts">⭐ ${t.points}</span>
            ${st.streak > 1 ? `<span class="tag streak">🔥 ${st.streak}x</span>` : ''}
            ${st.due ? '<span class="tag due">te doen</span>' : `<span class="tag">klaar · ${fmtDate(st.lastDone)}</span>`}
          </div>
        </div>
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
    const roomOptions = ['<option value="all"' + (roomFilter === 'all' ? ' selected' : '') + '>Alle kamers</option>']
      .concat(state.rooms.map((r) => `<option value="${r.id}"${roomFilter === r.id ? ' selected' : ''}>${esc(r.icon + ' ' + r.name)}</option>`))
      .join('');

    const freqOptions = Object.entries(FREQS)
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
    const pointsOptions = POINT_OPTIONS.map((p) => `<option value="${p}">⭐ ${p} XP</option>`).join('');
    const roomSelectOptions = state.rooms
      .map((r) => `<option value="${r.id}">${esc(r.icon + ' ' + r.name)}</option>`).join('');

    let tasks = state.tasks.slice();
    if (roomFilter !== 'all') tasks = tasks.filter((t) => t.roomId === roomFilter);
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
        document.getElementById('new-task-points').value
      );
    });
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
        <div class="task">
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
    }
  });

  render();
}
