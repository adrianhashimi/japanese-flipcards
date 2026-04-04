// ============================================================
//  Japanese Flip Cards — Progress: XP · Levels · Streak · Daily Goal
// ============================================================

const PROG_KEY   = 'jfc_progress';
const DAILY_GOAL = 20;

const LEVELS = [
  { name: '見習い', nameEn: 'Apprentice', xp: 0    },
  { name: '初心者', nameEn: 'Beginner',   xp: 150  },
  { name: '学生',   nameEn: 'Student',    xp: 400  },
  { name: '修業者', nameEn: 'Trainee',    xp: 800  },
  { name: '侍',     nameEn: 'Samurai',    xp: 1400 },
  { name: '忍者',   nameEn: 'Ninja',      xp: 2200 },
  { name: '武士',   nameEn: 'Warrior',    xp: 3200 },
  { name: '将軍',   nameEn: 'Shogun',     xp: 4500 },
  { name: '先生',   nameEn: 'Teacher',    xp: 6000 },
  { name: '師匠',   nameEn: 'Master',     xp: 8000 },
];

// ── Helpers ──────────────────────────────────────────────────
function _todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function _yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function _defaults() {
  return { xp: 0, streak: 0, lastPlayDate: null, todayCorrect: 0, todayDate: null };
}

// ── Storage ──────────────────────────────────────────────────
function loadProgress() {
  try { return { ..._defaults(), ...JSON.parse(localStorage.getItem(PROG_KEY)) }; }
  catch { return _defaults(); }
}

function saveProgress(p) {
  try { localStorage.setItem(PROG_KEY, JSON.stringify(p)); } catch (_) {}
}

// ── Level logic ──────────────────────────────────────────────
function getLevelInfo(xp) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= LEVELS[i].xp) idx = i;
    else break;
  }
  const cur  = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  const pct  = next
    ? Math.min(100, Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100))
    : 100;
  return { ...cur, index: idx, next, pct };
}

// Adds XP and returns { xpAdded, before, after, leveledUp }
function addXP(amount) {
  const p      = loadProgress();
  const before = getLevelInfo(p.xp);
  p.xp        += Math.max(0, amount);
  const after  = getLevelInfo(p.xp);
  saveProgress(p);
  return { xpAdded: amount, before, after, leveledUp: after.index > before.index };
}

// ── Streak + Daily goal ───────────────────────────────────────
// Call at the END of each completed session.
// Returns the updated progress object.
function recordSessionProgress(correctCount) {
  const p     = loadProgress();
  const today = _todayStr();

  // Streak
  if (p.lastPlayDate !== today) {
    if (p.lastPlayDate === _yesterdayStr()) p.streak++;
    else                                    p.streak = 1;
    p.lastPlayDate = today;
  }

  // Daily goal
  if (p.todayDate !== today) { p.todayCorrect = 0; p.todayDate = today; }
  p.todayCorrect += correctCount;

  saveProgress(p);
  return p;
}

// Returns { count, goal, pct, done }
function getDailyStatus() {
  const p     = loadProgress();
  const today = _todayStr();
  const count = p.todayDate === today ? p.todayCorrect : 0;
  return {
    count,
    goal: DAILY_GOAL,
    pct:  Math.min(100, Math.round((count / DAILY_GOAL) * 100)),
    done: count >= DAILY_GOAL,
  };
}

function clearProgress() {
  saveProgress(_defaults());
}
