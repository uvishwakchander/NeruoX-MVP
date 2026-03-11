const store = {
  focusHistory: JSON.parse(localStorage.getItem('neurox_focus') || '[]'),
  memoryHistory: JSON.parse(localStorage.getItem('neurox_memory') || '[]'),
  moods: JSON.parse(localStorage.getItem('neurox_moods') || '[]'),
  forum: JSON.parse(localStorage.getItem('neurox_forum') || '[]'),
  user: JSON.parse(localStorage.getItem('neurox_user') || '{"xp":0,"level":1,"streak":0,"missions":{"focus":false,"mood":false}}'),
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

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

$$('.nav-btn').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $$('.view').forEach(v => v.classList.remove('active'));
  document.getElementById(btn.dataset.target).classList.add('active');
}));
$('#darkToggle').addEventListener('change', e => document.body.classList.toggle('dark', e.target.checked));
$('#sensoryToggle').addEventListener('change', e => document.body.classList.toggle('low-sensory', e.target.checked));

function showGameEnd(panelId, textId, msg) {
  $(textId).textContent = msg;
  $(panelId).classList.remove('hidden');
}
function hideGameEnd(panelId) { $(panelId).classList.add('hidden'); }

// Focus game
let focusState = {score:0, streak:0, level:1, reaction:0, running:false, spawnMs:1200};
const FOCUS_DURATION_MS = 30000;
let focusTimer;
let focusEndTimer;
let lastSpawn = 0;

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

function endFocusGame(reason = 'Time complete') {
  if (!focusState.running) return;
  focusState.running = false;
  clearTimeout(focusTimer);
  clearTimeout(focusEndTimer);
  const record = {score: focusState.score, reaction: Math.round(focusState.reaction || 0), level: focusState.level, date: dayStr()};
  setStore('focusHistory', [record, ...store.focusHistory].slice(0, 15));
  if (record.score > 0) {
    addXP(record.score * 2);
    completeMission('focus');
  }
  showGameEnd('#focusEnd', '#focusEndText', `${reason}. Final score ${record.score}, level ${record.level}, avg reaction ${record.reaction} ms.`);
  renderFocusHistory();
  renderDashboard();
}

function startFocusGame() {
  hideGameEnd('#focusEnd');
  clearTimeout(focusTimer);
  clearTimeout(focusEndTimer);
  $('#focusArena').innerHTML = '';
  focusState = {score:0, streak:0, level:1, reaction:0, running:true, spawnMs:1200};
  $('#focusArena').onclick = focusMissPenalty;
  renderFocusStats();
  spawnFocusTarget();
  focusEndTimer = setTimeout(() => endFocusGame('Round finished'), FOCUS_DURATION_MS);
}

$('#startFocus').addEventListener('click', startFocusGame);
$('#restartFocus').addEventListener('click', startFocusGame);

function renderFocusHistory() {
  $('#focusHistory').innerHTML = store.focusHistory.map(h => `<li>${h.date} · Score ${h.score} · ${h.reaction}ms · L${h.level}</li>`).join('');
}

// Memory game
const memoryBoard = $('#memoryBoard');
let sequence = [];
let userSeq = [];
let accepting = false;
let memoryPlaying = false;
let memoryLevel = 1;
let memoryCorrect = 0;
let memoryTotal = 0;
const maxMemoryLevel = 10;
const MEMORY_MIN_XP = 6;

for (let i = 0; i < 9; i++) {
  const tile = document.createElement('div');
  tile.className = 'memory-tile';
  tile.addEventListener('click', () => onTileClick(i));
  memoryBoard.appendChild(tile);
}

function setMemoryFeedback(msg) { $('#memoryFeedback').textContent = msg; }

function flashTile(idx) {
  const tile = $$('.memory-tile')[idx];
  tile.classList.add('active');
  setTimeout(() => tile.classList.remove('active'), 350);
}

function nextMemoryRound() {
  if (!memoryPlaying) return;
  accepting = false;
  userSeq = [];
  sequence.push(Math.floor(Math.random() * 9));
  setMemoryFeedback(`Watch carefully: sequence length ${sequence.length}`);
  sequence.forEach((val, i) => setTimeout(() => flashTile(val), i * 450 + 350));
  setTimeout(() => {
    accepting = true;
    setMemoryFeedback('Now repeat the exact pattern.');
  }, sequence.length * 450 + 500);
  $('#memoryLevel').textContent = memoryLevel;
}

function finishMemoryGame(reason) {
  if (!memoryPlaying) return;
  memoryPlaying = false;
  accepting = false;
  const acc = Math.round((memoryCorrect / Math.max(1, memoryTotal)) * 100);
  const record = {level: memoryLevel, accuracy: acc, date: dayStr()};
  setStore('memoryHistory', [record, ...store.memoryHistory].slice(0, 15));
  addXP(Math.max(MEMORY_MIN_XP, memoryLevel * 3));
  renderMemoryStats(acc);
  showGameEnd('#memoryEnd', '#memoryEndText', `${reason}. Final level ${memoryLevel}, accuracy ${acc}%.`);
  renderDashboard();
  sequence = [];
}

function onTileClick(idx) {
  if (!accepting || !memoryPlaying) return;
  flashTile(idx);
  userSeq.push(idx);
  const pos = userSeq.length - 1;
  memoryTotal++;

  if (sequence[pos] !== idx) {
    setMemoryFeedback('Pattern mismatch ❌');
    finishMemoryGame('Round ended');
    return;
  }

  memoryCorrect++;
  setMemoryFeedback(`Validated ${userSeq.length}/${sequence.length}`);

  if (userSeq.length === sequence.length) {
    if (memoryLevel >= maxMemoryLevel) {
      setMemoryFeedback('Perfect memory chain ✅');
      finishMemoryGame('You cleared max level');
      return;
    }
    accepting = false;
    memoryLevel += 1;
    addXP(10);
    setMemoryFeedback('Sequence validated ✅ Next level...');
    setTimeout(nextMemoryRound, 700);
  }

  renderMemoryStats(Math.round((memoryCorrect / Math.max(1, memoryTotal)) * 100));
}

function startMemoryGame() {
  hideGameEnd('#memoryEnd');
  sequence = [];
  userSeq = [];
  memoryLevel = 1;
  memoryCorrect = 0;
  memoryTotal = 0;
  memoryPlaying = true;
  setMemoryFeedback('Starting new memory validation round...');
  nextMemoryRound();
}

$('#startMemory').addEventListener('click', startMemoryGame);
$('#restartMemory').addEventListener('click', startMemoryGame);
$('#endMemory').addEventListener('click', () => finishMemoryGame('Ended by user'));

function renderMemoryStats(acc = 100) {
  const best = Math.max(1, ...store.memoryHistory.map(m => m.level), memoryLevel);
  $('#memoryLevel').textContent = memoryLevel;
  $('#bestMemory').textContent = best;
  $('#memoryAccuracy').textContent = `${acc}%`;
}

// Small AR/VR demo game
let calmPoints = 0;
let therapyTimer;
let breathTimer;
let therapyCountdownTimer;
let therapyRunning = false;
const THERAPY_DURATION_S = 45;
const THERAPY_GOAL_POINTS = 100;
let therapyTimeLeft = THERAPY_DURATION_S;

function renderTherapyPreview() {
  const scene = $('#therapyScene');
  scene.innerHTML = '<div class="breath-orb preview"></div><p id="therapyHint" class="therapy-hint">Preview visible. Press Start Therapy Session to play.</p>';
}

function spawnCalmStar() {
  if (!therapyRunning) return;
  const scene = $('#therapyScene');
  const star = document.createElement('div');
  star.className = 'calm-star';
  star.style.left = `${Math.random() * Math.max(20, scene.clientWidth - 22)}px`;
  star.style.top = `${Math.random() * Math.max(20, scene.clientHeight - 22)}px`;
  star.onclick = () => {
    calmPoints += 5;
    $('#calmPoints').textContent = calmPoints;
    addXP(2);
    if (calmPoints >= THERAPY_GOAL_POINTS) {
      endTherapyGame('Goal reached');
    }
    star.remove();
  };
  scene.appendChild(star);
  setTimeout(() => star.remove(), 2200);
}

function endTherapyGame(reason = 'Session complete') {
  if (!therapyRunning) return;
  therapyRunning = false;
  clearInterval(therapyTimer);
  clearInterval(breathTimer);
  clearInterval(therapyCountdownTimer);
  $('#breathState').textContent = 'Session complete';
  addXP(20);
  triggerBadge('🌌 Calm Session Completed');
  showGameEnd('#therapyEnd', '#therapyEndText', `${reason}. You collected ${calmPoints} calm points (goal: ${THERAPY_GOAL_POINTS}).`);
  renderTherapyPreview();
  renderDashboard();
}

function startTherapyGame() {
  hideGameEnd('#therapyEnd');
  clearInterval(therapyTimer);
  clearInterval(breathTimer);
  clearInterval(therapyCountdownTimer);
  const scene = $('#therapyScene');
  scene.innerHTML = '<div class="breath-orb"></div><p id="therapyHint" class="therapy-hint">Collect calm stars to reach the goal.</p>';
  calmPoints = 0;
  therapyTimeLeft = THERAPY_DURATION_S;
  therapyRunning = true;
  $('#calmPoints').textContent = calmPoints;
  $('#therapyTime').textContent = `${therapyTimeLeft}s`;

  const phases = ['Inhale 4s', 'Hold 4s', 'Exhale 6s'];
  let i = 0;
  $('#breathState').textContent = phases[i];
  clearInterval(breathTimer);
  breathTimer = setInterval(() => {
    i = (i + 1) % phases.length;
    $('#breathState').textContent = phases[i];
  }, 4000);

  clearInterval(therapyTimer);
  therapyTimer = setInterval(spawnCalmStar, 900);

  clearInterval(therapyCountdownTimer);
  therapyCountdownTimer = setInterval(() => {
    therapyTimeLeft -= 1;
    $('#therapyTime').textContent = `${therapyTimeLeft}s`;
    if (therapyTimeLeft <= 0) endTherapyGame('Timed session complete');
  }, 1000);
}

$('#startTherapy').addEventListener('click', startTherapyGame);
$('#restartTherapy').addEventListener('click', startTherapyGame);
$('#endTherapy').addEventListener('click', () => endTherapyGame('Ended by user'));

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

// Forum
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

// Dashboard + gamification
let charts = {};
const moodToNum = (m) => ({Happy:4, Neutral:3, Stressed:2, Overwhelmed:1}[m] || 3);

function drawChart(id, type, data, label, labels) {
  charts[id]?.destroy();
  const ctx = document.getElementById(id);
  charts[id] = new Chart(ctx, {
    type,
    data: {
      labels: labels || data.map((_, i) => `${i + 1}`),
      datasets: [{ label, data, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.2)', fill: type !== 'radar', tension: 0.3 }],
    },
    options: { plugins: { legend: { display: type === 'radar' } }, scales: type === 'radar' ? {} : { y: { beginAtZero: true } } },
  });
}

function calcDailyStreak() {
  const days = new Set([...store.focusHistory, ...store.memoryHistory, ...store.moods].map(x => x.date));
  let s = 0;
  const d = new Date();
  while (days.has(d.toISOString().slice(0, 10))) {
    s += 1;
    d.setDate(d.getDate() - 1);
  }
  return s;
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
    Math.min(100, (store.moods[0]?.energy || 5) * 10),
  ], 'Cognitive Profile', ['Attention', 'Memory', 'Speed', 'Emotional State']);
  renderGamification();
}

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

// Reminders
function showReminder(msg) {
  const t = $('#reminderToast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

setInterval(() => showReminder('💧 Drinking reminder: sip water now.'), 30 * 60 * 1000);
setInterval(() => showReminder('👀 20-20-20 eye rest: look 20 feet away for 20 seconds.'), 20 * 60 * 1000);
setInterval(() => showReminder('🧍 Stretch reminder: stand up and stretch your neck/shoulders.'), 60 * 60 * 1000);

// Init
seedDummyData();
renderTherapyPreview();
addChat('bot', 'Hi, I am your NeuroX companion. What is one thing you want support with today?');
renderFocusHistory();
renderMemoryStats();
renderMoods();
renderForum();
renderDashboard();
