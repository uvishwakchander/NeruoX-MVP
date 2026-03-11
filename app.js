const store = {
  focusHistory: JSON.parse(localStorage.getItem('neurox_focus') || '[]'),
  memoryHistory: JSON.parse(localStorage.getItem('neurox_memory') || '[]'),
  moods: JSON.parse(localStorage.getItem('neurox_moods') || '[]'),
  forum: JSON.parse(localStorage.getItem('neurox_forum') || '[]'),
  user: JSON.parse(localStorage.getItem('neurox_user') || '{"xp":0,"level":1,"streak":0,"missions":{"focus":false,"mood":false}}'),
};

const setStore = (key, value) => {
  store[key] = value;
  localStorage.setItem(`neurox_${key}`, JSON.stringify(value));
};

function dayStr(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function seedDummyData() {
  if (!localStorage.getItem('neurox_seeded')) {
    setStore('focusHistory', [{score: 8, reaction: 640, level: 2, date: dayStr(-2)}, {score: 11, reaction: 590, level: 3, date: dayStr(-1)}]);
    setStore('memoryHistory', [{level: 3, accuracy: 78, date: dayStr(-2)}, {level: 4, accuracy: 81, date: dayStr(-1)}]);
    setStore('moods', [{mood:'Neutral', energy:5, note:'Steady day', date: dayStr(-1)}]);
    setStore('forum', [{id: crypto.randomUUID(), section:'ADHD', title:'Best focus routines?', content:'What helps before study?', likes:2, comments:['Pomodoro + noise control works for me.']}]);
    localStorage.setItem('neurox_seeded', '1');
  }
}

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

$$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $$('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(btn.dataset.target).classList.add('active');
}));
$('#darkToggle').addEventListener('change', e => document.body.classList.toggle('dark', e.target.checked));
$('#sensoryToggle').addEventListener('change', e => document.body.classList.toggle('low-sensory', e.target.checked));

// Focus game (single-ball target)
let focusState = {score:0, streak:0, level:1, reaction:0, running:false, spawnMs:1200};
let lastSpawn = 0;
let focusTimer;

function renderFocusStats() {
  $('#focusScore').textContent = focusState.score;
  $('#focusStreak').textContent = focusState.streak;
  $('#focusLevel').textContent = focusState.level;
  $('#reactionTime').textContent = `${Math.round(focusState.reaction)} ms`;
}

function spawnFocusTarget() {
  if (!focusState.running) return;
  const arena = $('#focusArena');
  arena.innerHTML = '';

  // Visual distractions (not clickable) keep low sensory pressure while retaining challenge.
  for (let i = 0; i < 5; i++) {
    const dot = document.createElement('div');
    const size = 12 + Math.random() * 20;
    dot.className = 'bg-dot';
    dot.style.width = `${size}px`;
    dot.style.height = `${size}px`;
    dot.style.left = `${Math.random() * (arena.clientWidth - size)}px`;
    dot.style.top = `${Math.random() * (arena.clientHeight - size)}px`;
    arena.appendChild(dot);
  }

  const size = 30 + Math.random() * 28;
  const target = document.createElement('div');
  target.className = 'target';
  target.style.width = `${size}px`;
  target.style.height = `${size}px`;
  target.style.left = `${Math.random() * (arena.clientWidth - size)}px`;
  target.style.top = `${Math.random() * (arena.clientHeight - size)}px`;
  lastSpawn = performance.now();

  target.addEventListener('click', (e) => {
    e.stopPropagation();
    const rt = performance.now() - lastSpawn;
    focusState.reaction = (focusState.reaction * focusState.score + rt) / (focusState.score + 1);
    focusState.score += 1;
    focusState.streak += 1;
    if (focusState.score % 5 === 0) {
      focusState.level += 1;
      focusState.spawnMs = Math.max(400, focusState.spawnMs - 120);
      addXP(20);
    }
    renderFocusStats();
    spawnFocusTarget();
  });
  arena.appendChild(target);
  clearTimeout(focusTimer);
  focusTimer = setTimeout(spawnFocusTarget, focusState.spawnMs);
}

function focusMissPenalty() {
  if (!focusState.running) return;
  focusState.score = Math.max(0, focusState.score - 1);
  focusState.streak = 0;
  renderFocusStats();
}

function endFocusGame() {
  focusState.running = false;
  clearTimeout(focusTimer);
  const record = {score: focusState.score, reaction: Math.round(focusState.reaction || 0), level: focusState.level, date: dayStr()};
  setStore('focusHistory', [record, ...store.focusHistory].slice(0, 15));
  if (record.score > 0) {
    addXP(record.score * 2);
    completeMission('focus');
  }
  renderFocusHistory();
  renderDashboard();
}

$('#startFocus').addEventListener('click', () => {
  const arena = $('#focusArena');
  arena.onclick = focusMissPenalty;
  focusState = {score:0, streak:0, level:1, reaction:0, running:true, spawnMs:1200};
  renderFocusStats();
  spawnFocusTarget();
  setTimeout(endFocusGame, 30000);
});

function renderFocusHistory() {
  $('#focusHistory').innerHTML = store.focusHistory.map(h => `<li>${h.date} · Score ${h.score} · ${h.reaction}ms · L${h.level}</li>`).join('');
}

// Memory game with validation feedback
const memoryBoard = $('#memoryBoard');
let sequence = [];
let userSeq = [];
let accepting = false;
let memoryLevel = 1;
let memoryCorrect = 0;
let memoryTotal = 0;
let memoryPlaying = false;

for (let i = 0; i < 9; i++) {
  const tile = document.createElement('div');
  tile.className = 'memory-tile';
  tile.dataset.idx = i;
  tile.addEventListener('click', () => onTileClick(i));
  memoryBoard.appendChild(tile);
}

function setMemoryFeedback(msg) {
  $('#memoryFeedback').textContent = msg;
}

function flashTile(idx) {
  const tile = $$('.memory-tile')[idx];
  tile.classList.add('active');
  setTimeout(() => tile.classList.remove('active'), 350);
}

function nextMemoryRound() {
  accepting = false;
  userSeq = [];
  sequence.push(Math.floor(Math.random() * 9));
  setMemoryFeedback(`Watch carefully: sequence length ${sequence.length}`);
  sequence.forEach((val, i) => setTimeout(() => flashTile(val), i * 500 + 400));
  setTimeout(() => {
    accepting = true;
    setMemoryFeedback('Now repeat the exact pattern.');
  }, sequence.length * 500 + 600);
  $('#memoryLevel').textContent = memoryLevel;
}

function endMemoryRun(success) {
  memoryPlaying = false;
  accepting = false;
  const acc = Math.round((memoryCorrect / Math.max(1, memoryTotal)) * 100);
  const rec = {level: memoryLevel, accuracy: acc, date: dayStr()};
  setStore('memoryHistory', [rec, ...store.memoryHistory].slice(0, 15));
  addXP(memoryLevel * 3);
  renderMemoryStats(acc);
  renderDashboard();
  setMemoryFeedback(success ? `Great! Final level ${memoryLevel}.` : `Pattern mismatch. Final level ${memoryLevel}.`);
  sequence = [];
  memoryLevel = 1;
}

function onTileClick(idx) {
  if (!accepting || !memoryPlaying) return;
  flashTile(idx);
  userSeq.push(idx);
  const pos = userSeq.length - 1;
  memoryTotal++;

  if (sequence[pos] === idx) {
    memoryCorrect++;
    setMemoryFeedback(`Validated ${userSeq.length}/${sequence.length}`);
  } else {
    endMemoryRun(false);
    return;
  }

  if (userSeq.length === sequence.length) {
    accepting = false;
    memoryLevel++;
    addXP(10);
    setMemoryFeedback('Sequence validated ✅ Next level...');
    setTimeout(nextMemoryRound, 750);
  }

  renderMemoryStats(Math.round((memoryCorrect / Math.max(1, memoryTotal)) * 100));
}

$('#startMemory').addEventListener('click', () => {
  sequence = [];
  userSeq = [];
  memoryLevel = 1;
  memoryCorrect = 0;
  memoryTotal = 0;
  memoryPlaying = true;
  setMemoryFeedback('Starting new memory validation round...');
  nextMemoryRound();
});

function renderMemoryStats(acc = 100) {
  const best = Math.max(1, ...store.memoryHistory.map(m => m.level), memoryLevel);
  $('#memoryLevel').textContent = memoryLevel;
  $('#bestMemory').textContent = best;
  $('#memoryAccuracy').textContent = `${acc}%`;
}

// AR/VR Therapy game (mock immersive breathing)
let calmPoints = 0;
let therapyTimer;
let breathTimer;

function spawnCalmStar() {
  const scene = $('#therapyScene');
  const star = document.createElement('div');
  star.className = 'calm-star';
  star.style.left = `${Math.random() * (scene.clientWidth - 20)}px`;
  star.style.top = `${Math.random() * (scene.clientHeight - 20)}px`;
  star.onclick = () => {
    calmPoints += 5;
    $('#calmPoints').textContent = calmPoints;
    addXP(2);
    star.remove();
  };
  scene.appendChild(star);
  setTimeout(() => star.remove(), 3500);
}

$('#startTherapy').addEventListener('click', () => {
  const scene = $('#therapyScene');
  scene.innerHTML = '<div class="breath-orb"></div>';
  calmPoints = 0;
  $('#calmPoints').textContent = calmPoints;

  const phases = ['Inhale 4s', 'Hold 4s', 'Exhale 6s'];
  let i = 0;
  clearInterval(breathTimer);
  $('#breathState').textContent = phases[i];
  breathTimer = setInterval(() => {
    i = (i + 1) % phases.length;
    $('#breathState').textContent = phases[i];
  }, 4000);

  clearInterval(therapyTimer);
  therapyTimer = setInterval(spawnCalmStar, 1400);
  setTimeout(() => {
    clearInterval(therapyTimer);
    clearInterval(breathTimer);
    $('#breathState').textContent = 'Session complete';
    addXP(20);
    triggerBadge('🌌 Calm Session Completed');
  }, 45000);
});

// Mood tracker
let selectedMood = 'Neutral';
$$('#moodOptions button').forEach(btn => btn.addEventListener('click', () => {
  selectedMood = btn.dataset.mood;
  $$('#moodOptions button').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
}));

$('#saveMood').addEventListener('click', () => {
  const entry = { mood: selectedMood, energy: Number($('#energyRange').value), note: $('#moodNote').value.trim(), date: dayStr() };
  setStore('moods', [entry, ...store.moods].slice(0, 30));
  addXP(12);
  completeMission('mood');
  $('#moodNote').value = '';
  renderMoods();
  renderDashboard();
});

function renderMoods() {
  $('#moodList').innerHTML = store.moods.map(m => `<li>${m.date} · ${m.mood} · Energy ${m.energy}/10${m.note ? ` · ${m.note}` : ''}</li>`).join('');
}

// AI therapist mock
const botStarters = [
  'How did you feel during your most focused moment today?',
  'Would you like a 60-second breathing exercise?',
  'Try one round of the Focus Game to reset attention.',
];

function addChat(role, text) {
  const msg = document.createElement('div');
  msg.className = `msg ${role}`;
  msg.textContent = text;
  $('#chatBox').appendChild(msg);
  $('#chatBox').scrollTop = $('#chatBox').scrollHeight;
}

function botRespond(input) {
  const t = input.toLowerCase();
  if (t.includes('stress') || t.includes('overwhelm')) return 'Let’s pause. Inhale for 4, hold for 4, exhale for 6. Repeat 4 times.';
  if (t.includes('sad') || t.includes('bad')) return 'Thank you for sharing. One gentle step now can be enough. Want a reflection prompt?';
  if (t.includes('focus') || t.includes('distract')) return 'A quick win: play Focus Game for 2 minutes, then start your smallest task.';
  if (t.includes('help')) return 'I can guide reflection, breathing, and routine nudges. You are not alone.';
  return botStarters[Math.floor(Math.random() * botStarters.length)];
}

$('#sendChat').addEventListener('click', () => {
  const input = $('#chatInput').value.trim();
  if (!input) return;
  addChat('user', input);
  $('#chatInput').value = '';
  setTimeout(() => addChat('bot', botRespond(input)), 350);
});

// Forum mock
$('#createPost').addEventListener('click', () => {
  const title = $('#forumTitle').value.trim();
  const content = $('#forumContent').value.trim();
  if (!title || !content) return;
  const post = { id: crypto.randomUUID(), section: $('#forumSection').value, title, content, likes: 0, comments: [] };
  setStore('forum', [post, ...store.forum]);
  $('#forumTitle').value = '';
  $('#forumContent').value = '';
  renderForum();
});

function renderForum() {
  $('#forumPosts').innerHTML = '';
  store.forum.forEach(post => {
    const wrap = document.createElement('div');
    wrap.className = 'post';
    wrap.innerHTML = `<strong>[${post.section}] ${post.title}</strong><p>${post.content}</p>
      <button data-like="${post.id}">❤️ ${post.likes}</button>
      <div class="comments">${post.comments.map(c => `<p>💬 ${c}</p>`).join('')}</div>
      <input data-comment-input="${post.id}" placeholder="Write comment" />
      <button data-comment="${post.id}">Comment</button>`;
    $('#forumPosts').appendChild(wrap);
  });

  $$('button[data-like]').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.like;
    setStore('forum', store.forum.map(p => p.id === id ? {...p, likes: p.likes + 1} : p));
    renderForum();
  });

  $$('button[data-comment]').forEach(btn => btn.onclick = () => {
    const id = btn.dataset.comment;
    const input = document.querySelector(`input[data-comment-input="${id}"]`);
    const val = input.value.trim();
    if (!val) return;
    setStore('forum', store.forum.map(p => p.id === id ? {...p, comments:[...p.comments, val]} : p));
    renderForum();
  });
}

// Dashboard + charts
let charts = {};
function moodToNum(m) {
  return {Happy:4, Neutral:3, Stressed:2, Overwhelmed:1}[m] || 3;
}

function renderDashboard() {
  const streak = calcDailyStreak();
  store.user.streak = streak;
  setStore('user', store.user);

  const latestFocus = store.focusHistory[0]?.score || 0;
  const latestMemory = store.memoryHistory[0]?.level || 1;
  const latestMood = store.moods[0]?.mood || 'Neutral';

  $('#snapshotStats').innerHTML = `
    <div class="stat-pill">Daily Streak: <strong>${streak}</strong></div>
    <div class="stat-pill">Focus Best: <strong>${Math.max(0, ...store.focusHistory.map(f => f.score))}</strong></div>
    <div class="stat-pill">Memory Best: <strong>${Math.max(1, ...store.memoryHistory.map(m => m.level))}</strong></div>
    <div class="stat-pill">Latest Mood: <strong>${latestMood}</strong></div>`;

  $('#insightText').textContent = latestFocus >= 10
    ? 'Your focus improved this week. Keep your current rhythm and hydration breaks.'
    : 'You are building consistency. Small daily sessions can improve attention steadily.';

  drawChart('focusChart', 'line', store.focusHistory.slice().reverse().map(h => h.score), 'Focus Score');
  drawChart('memoryChart', 'line', store.memoryHistory.slice().reverse().map(h => h.level), 'Memory Level');
  drawChart('moodChart', 'line', store.moods.slice().reverse().map(h => moodToNum(h.mood)), 'Mood (1-4)');
  drawChart('radarChart', 'radar', [
    Math.min(100, latestFocus * 8),
    Math.min(100, latestMemory * 18),
    Math.max(10, 100 - (store.focusHistory[0]?.reaction || 900) / 12),
    Math.min(100, (store.moods[0]?.energy || 5) * 10)
  ], 'Cognitive Profile', ['Attention', 'Memory', 'Speed', 'Emotional State']);
  renderGamification();
}

function drawChart(id, type, data, label, labels) {
  charts[id]?.destroy();
  const ctx = document.getElementById(id);
  charts[id] = new Chart(ctx, {
    type,
    data: {
      labels: labels || data.map((_, i) => `${i + 1}`),
      datasets: [{ label, data, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.2)', fill: type !== 'radar', tension: 0.3 }]
    },
    options: { plugins: { legend: { display: type === 'radar' } }, scales: type === 'radar' ? {} : { y: { beginAtZero: true } } }
  });
}

function calcDailyStreak() {
  const days = new Set([...store.focusHistory, ...store.memoryHistory, ...store.moods].map(x => x.date));
  let s = 0;
  const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) {
    s++;
    d.setDate(d.getDate() - 1);
  }
  return s;
}

// Gamification
function addXP(amount) {
  store.user.xp += amount;
  const target = store.user.level * 100;
  if (store.user.xp >= target) {
    store.user.level += 1;
    store.user.xp -= target;
    triggerBadge(`🏅 Level ${store.user.level} reached!`);
  }
  setStore('user', store.user);
  renderGamification();
}

function completeMission(key) {
  if (!store.user.missions[key]) {
    store.user.missions[key] = true;
    addXP(25);
  }
}

function renderGamification() {
  $('#userLevel').textContent = store.user.level;
  $('#userXp').textContent = store.user.xp;
  $('#xpBar').style.width = `${Math.min(100, (store.user.xp / (store.user.level * 100)) * 100)}%`;
  $('#missions').innerHTML = `
    <li>${store.user.missions.focus ? '✅' : '⬜'} Play 1 focus game</li>
    <li>${store.user.missions.mood ? '✅' : '⬜'} Check mood</li>`;
}

function triggerBadge(text) {
  const el = $('#badgePopup');
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2200);
}

// Wellness reminders
function showReminder(msg) {
  const t = $('#reminderToast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

setInterval(() => showReminder('👀 Eye care break: look 20 ft away for 20 sec.'), 30 * 60 * 1000);
setInterval(() => showReminder('💧 Hydration check: drink a glass of water.'), 45 * 60 * 1000);

function scheduleSleepReminder() {
  const now = new Date();
  const target = new Date();
  target.setHours(21, 0, 0, 0);
  if (target < now) target.setDate(target.getDate() + 1);
  setTimeout(() => {
    showReminder('🌙 Sleep wind-down: reduce screens and do a breathing cycle.');
    scheduleSleepReminder();
  }, target - now);
}

scheduleSleepReminder();

// Init
seedDummyData();
addChat('bot', 'Hi, I am your NeuroX companion. What is one thing you want support with today?');
renderFocusHistory();
renderMemoryStats();
renderMoods();
renderForum();
renderDashboard();
