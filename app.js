// ============================================================
//  Japanese Flip Cards — Game Logic
// ============================================================

// ── Mode config ──────────────────────────────────────────────
const MODES = {
  'hiragana-alpha': { data: HIRAGANA,                               isWord: false, label: 'Hiragana Alphabet' },
  'hiragana-word':  { data: HIRAGANA_WORDS,                         isWord: true,  label: 'Hiragana Words'    },
  'katakana-alpha': { data: KATAKANA,                               isWord: false, label: 'Katakana Alphabet' },
  'katakana-word':  { data: KATAKANA_WORDS,                         isWord: true,  label: 'Katakana Words'    },
  'mixed-alpha':    { data: [...HIRAGANA,   ...KATAKANA],           isWord: false, label: 'Mixed Alphabet'    },
  'mixed-word':     { data: [...HIRAGANA_WORDS, ...KATAKANA_WORDS], isWord: true,  label: 'Mixed Words'       },
};
const MODE_LABELS = Object.fromEntries(Object.entries(MODES).map(([k,v]) => [k, v.label]));

const HISTORY_KEY = 'jfc_history';
const OPTS_KEY    = 'jfc_opts';
const MAX_LIVES   = 3;
const TIMER_DUR   = 7;
const BASE_XP     = { alpha: 10, word: 15 };

// ── Options (persisted) ──────────────────────────────────────
const DEFAULT_OPTS = { answerType: 'type', livesOn: true, hintsOn: true, soundOn: true };
let opts = (() => {
  try { return { ...DEFAULT_OPTS, ...JSON.parse(localStorage.getItem(OPTS_KEY)) }; }
  catch { return { ...DEFAULT_OPTS }; }
})();
function saveOpts() { try { localStorage.setItem(OPTS_KEY, JSON.stringify(opts)); } catch(_){} }

// ── Session state ────────────────────────────────────────────
let mode       = null;
let srsQueue   = [];       // remaining cards to master (mutated as SRS re-inserts)
let origSize   = 0;        // original deck size for progress bar
let mastered   = 0;        // unique cards successfully answered
let correct    = 0;
let wrong      = 0;
let skipped    = 0;
let missed     = [];       // { card, userAnswer }
let lives      = MAX_LIVES;
let combo      = 0;
let sessionXP  = 0;
let hintsUsed  = 0;        // hints used on current card
let choices    = [];       // current multiple-choice options
let isRevealed = false;
let timerId    = null;
let timeLeft   = TIMER_DUR;
let isPaused   = false;
let spokenText = '';
let isReviewMode = false;

// ── DOM refs ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = { home:$('screen-home'), game:$('screen-game'), results:$('screen-results'), stats:$('screen-stats'), chart:$('screen-chart') };
const el = {
  // home
  homeLevelName:$('home-level-name'), homeLevelEn:$('home-level-en'),
  homeXpBar:$('home-xp-bar'), homeXpLabel:$('home-xp-label'),
  streakNum:$('streak-num'), streakBadge:$('streak-badge'),
  dailyBar:$('daily-bar'), dailyLabel:$('daily-label'),
  btnStats:$('btn-stats'), btnChart:$('btn-chart'),
  // game
  btnBack:$('btn-back'), modeLabel:$('mode-label'),
  comboBadge:$('combo-badge'), comboNum:$('combo-num'),
  livesDisplay:$('lives-display'),
  progressBar:$('progress-bar'), progressText:$('progress-text'),
  timerWrap:$('timer-wrap'), timerBar:$('timer-bar'), timerText:$('timer-text'),
  statCorrect:$('stat-correct'), statWrong:$('stat-wrong'),
  sessionXpEl:$('session-xp'),
  card:$('card'), cardEmoji:$('card-emoji'), cardChar:$('card-char'),
  cardHint:$('card-hint'), hintReveal:$('hint-reveal'), cardScript:$('card-script'),
  cardAnswer:$('card-answer'), cardMeaning:$('card-meaning'),
  cardSentence:$('card-sentence'), cardIcon:$('card-icon'),
  btnSpeak:$('btn-speak'), btnHint:$('btn-hint'),
  inputSection:$('input-section'), romajiInput:$('romaji-input'), btnSubmit:$('btn-submit'),
  choiceSection:$('choice-section'), choiceGrid:$('choice-grid'),
  nextSection:$('next-section'), feedbackText:$('feedback-text'),
  xpEarnedLabel:$('xp-earned-label'), btnNext:$('btn-next'),
  // results
  resScore:$('res-score'), resTotal:$('res-total'), resGrade:$('res-grade'),
  resXpGained:$('res-xp-gained'), resLevelUp:$('res-level-up'),
  resCorrect:$('res-correct'), resWrong:$('res-wrong'), resSkipped:$('res-skipped'),
  missedSection:$('missed-section'), missedList:$('missed-list'),
  btnPlayAgain:$('btn-play-again'), btnRetryMissed:$('btn-retry-missed'),
  retryCount:$('retry-count'), btnViewStats:$('btn-view-stats'), btnHome:$('btn-home'),
  // stats
  btnStatsBack:$('btn-stats-back'), btnClearStats:$('btn-clear-stats'),
  stSessions:$('st-sessions'), stQuestions:$('st-questions'), stAccuracy:$('st-accuracy'),
  weeklyChart:$('weekly-chart'), modeChart:$('mode-chart'), statsEmpty:$('stats-empty'),
  // chart
  btnChartBack:$('btn-chart-back'), refChartGrid:$('ref-chart-grid'),
  // overlay
  levelupOverlay:$('levelup-overlay'),
  levelupName:$('levelup-name'), levelupEn:$('levelup-en'),
  // pause
  btnPause:$('btn-pause'),
  // level select
  levelSelectOverlay:$('level-select-overlay'),
  levelSelectBackdrop:$('level-select-backdrop'),
  levelSelectTitle:$('level-select-title'),
  levelSelectClose:$('level-select-close'),
  levelSelectList:$('level-select-list'),
};

// ── Helpers ──────────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}
function setVisible(el, v) { el.classList.toggle('hidden', !v); }
function sfx(name, ...args) { if (opts.soundOn && SFX[name]) SFX[name](...args); }

function setCharFontSize(text, isWord) {
  const len = text.length;
  if (isWord) {
    el.cardChar.style.fontSize = len<=2?'52px': len<=4?'42px': len<=6?'34px': len<=8?'28px':'22px';
  } else {
    el.cardChar.style.fontSize = len<=1?'88px': len<=2?'80px':'60px';
  }
}

function detectScript(card) {
  if (HIRAGANA.includes(card) || HIRAGANA_WORDS.includes(card)) return 'Hiragana';
  if (KATAKANA.includes(card) || KATAKANA_WORDS.includes(card)) return 'Katakana';
  return '';
}

// ── Speech ────────────────────────────────────────────────────
let japaneseVoice = null;
function loadVoices() {
  if (!window.speechSynthesis) return;
  const vv = speechSynthesis.getVoices();
  japaneseVoice = vv.find(v => v.lang === 'ja-JP') || vv.find(v => v.lang.startsWith('ja')) || null;
}
if (window.speechSynthesis) {
  speechSynthesis.addEventListener('voiceschanged', loadVoices);
  loadVoices();
}
function speak(text) {
  if (!window.speechSynthesis || !text) return;
  spokenText = text;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP'; u.rate = 0.85; u.pitch = 1;
  if (japaneseVoice) u.voice = japaneseVoice;
  el.btnSpeak.classList.add('speaking');
  u.onend = u.onerror = () => el.btnSpeak.classList.remove('speaking');
  speechSynthesis.speak(u);
}

// ── Timer ─────────────────────────────────────────────────────
function timerTick() {
  timeLeft = Math.max(0, timeLeft - 0.05);
  updateTimerDisplay();
  if (timeLeft <= 1.5 && timeLeft > 1.45) sfx('tick');
  if (timeLeft <= 0) { stopTimer(); handleTimeout(); }
}
function updatePauseBtn() {
  if (!el.btnPause) return;
  el.btnPause.textContent = isPaused ? '▶' : '⏸';
  el.btnPause.setAttribute('aria-label', isPaused ? 'Resume' : 'Pause');
}
function startTimer() {
  stopTimer();
  timeLeft  = TIMER_DUR;
  isPaused  = false;
  updateTimerDisplay();
  updatePauseBtn();
  timerId = setInterval(timerTick, 50);
}
function stopTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  isPaused = false;
  updatePauseBtn();
}
function pauseTimer() {
  if (!timerId || isPaused) return;
  clearInterval(timerId);
  timerId  = null;
  isPaused = true;
  el.timerText.textContent = '⏸';
  updatePauseBtn();
}
function resumeTimer() {
  if (!isPaused) return;
  isPaused = false;
  updatePauseBtn();
  timerId  = setInterval(timerTick, 50);
}
function updateTimerDisplay() {
  const pct = (timeLeft / TIMER_DUR) * 100;
  el.timerBar.style.width = pct + '%';
  el.timerText.textContent = Math.ceil(timeLeft) + 's';
  el.timerBar.style.backgroundColor =
    pct > 57 ? '#27ae60' : pct > 28 ? '#f39c12' : '#c0392b';
}
function handleTimeout() {
  skipped++;
  missed.push({ card: srsQueue[0], userAnswer: '' });
  processAnswer(false, true);
}

// ── SRS queue ────────────────────────────────────────────────
function srsMarkCorrect() {
  srsQueue.shift();
  mastered++;
}
function srsMarkWrong() {
  const card = srsQueue.shift();
  const pos  = Math.min(3, srsQueue.length);
  srsQueue.splice(pos, 0, card);
}

// ── Lives ────────────────────────────────────────────────────
function renderLives() {
  if (!opts.livesOn) { el.livesDisplay.textContent = ''; return; }
  el.livesDisplay.innerHTML = '';
  for (let i = 0; i < MAX_LIVES; i++) {
    const span = document.createElement('span');
    span.textContent = i < lives ? '❤️' : '🖤';
    el.livesDisplay.appendChild(span);
  }
}

// ── Multiple choice generation ───────────────────────────────
function buildChoices(card) {
  const config   = MODES[mode];
  const isWord   = config.isWord;
  const isRev    = opts.answerType === 'reverse';

  const correctVal = isRev ? (isWord ? card.word : card.char) : card.romaji[0];
  const pool = config.data.filter(c => {
    const v = isRev ? (isWord ? c.word : c.char) : c.romaji[0];
    return c !== card && v !== correctVal;
  });
  const wrongs = shuffle(pool).slice(0, 3).map(c =>
    isRev ? (isWord ? c.word : c.char) : c.romaji[0]
  );
  return shuffle([correctVal, ...wrongs]);
}

// ── XP calculation ───────────────────────────────────────────
function calcXP(isWord, hintsUsed, comboCount, timeBonus) {
  const base      = isWord ? BASE_XP.word : BASE_XP.alpha;
  const hintMult  = Math.max(0.25, 1 - hintsUsed * 0.25);
  const comboMult = comboCount >= 12 ? 3 : comboCount >= 8 ? 2.5 : comboCount >= 5 ? 2 : comboCount >= 3 ? 1.5 : 1;
  const timeMult  = timeBonus ? 1.3 : 1;
  return Math.max(1, Math.round(base * hintMult * comboMult * timeMult));
}

// ── Home screen updates ───────────────────────────────────────
function updateHomeScreen() {
  // Level + XP
  const prog  = loadProgress();
  const lvInfo = getLevelInfo(prog.xp);
  el.homeLevelName.textContent = lvInfo.name;
  el.homeLevelEn.textContent   = lvInfo.nameEn;
  el.homeXpBar.style.width     = lvInfo.pct + '%';
  el.homeXpLabel.textContent   = prog.xp.toLocaleString() + ' XP';

  // Streak
  el.streakNum.textContent = prog.streak;
  el.streakBadge.style.opacity = prog.streak > 0 ? '1' : '0.5';

  // Daily goal
  const daily = getDailyStatus();
  el.dailyBar.style.width = daily.pct + '%';
  el.dailyLabel.textContent = `${daily.count} / ${daily.goal} today`;
  el.dailyBar.style.backgroundColor = daily.done ? '#27ae60' : '#f39c12';

  // Options UI sync
  document.querySelectorAll('.opt-btn').forEach(btn => {
    const key = btn.dataset.opt;
    const val = btn.dataset.val;
    const matches = key === 'livesOn' || key === 'hintsOn' || key === 'soundOn'
      ? String(opts[key]) === val
      : opts[key] === val;
    btn.classList.toggle('active', matches);
  });
}

// ── Game init ─────────────────────────────────────────────────
function startGame(gameMode, reviewCards, levelLabel) {
  mode       = gameMode;
  isReviewMode = !!reviewCards;

  const config = MODES[mode];
  const deck   = reviewCards ? shuffle(reviewCards) : shuffle(config.data);

  srsQueue  = [...deck];
  origSize  = deck.length;
  mastered  = 0;
  correct   = 0;
  wrong     = 0;
  skipped   = 0;
  missed    = [];
  lives     = MAX_LIVES;
  combo     = 0;
  sessionXP = 0;
  isPaused  = false;

  el.modeLabel.textContent = config.label + (levelLabel ? ` · ${levelLabel}` : isReviewMode ? ' · Review' : '');
  showScreen('game');
  loadCard();
}

// ── Load card ─────────────────────────────────────────────────
function loadCard() {
  if (srsQueue.length === 0) { showResults(); return; }

  const card   = srsQueue[0];
  const config = MODES[mode];
  const isWord = config.isWord;
  const isRev  = opts.answerType === 'reverse';

  isRevealed = false;
  hintsUsed  = 0;
  choices    = [];

  // Reset card face — suppress transition so back face doesn't flash during flip-back
  el.card.style.transition = 'none';
  el.card.className = 'card';
  el.card.offsetHeight; // force reflow before re-enabling transition
  el.card.style.transition = '';

  // ── Front face ──────────────────────────────────
  if (isRev) {
    // Reverse: show romaji or English on front
    const front = isWord ? card.meaning : card.romaji[0];
    el.cardChar.textContent = isWord ? card.meaning : card.romaji[0];
    el.cardChar.style.fontSize = isWord ? '28px' : '52px';
    setVisible(el.cardEmoji, false);
    setVisible(el.cardHint, false);
    spokenText = isWord ? card.word : card.char;
  } else {
    // Forward: show Japanese
    const display = isWord ? card.word : card.char;
    el.cardChar.textContent = display;
    setCharFontSize(display, isWord);

    if (isWord && card.emoji) {
      el.cardEmoji.textContent = card.emoji;
      setVisible(el.cardEmoji, true);
    } else {
      setVisible(el.cardEmoji, false);
    }

    if (isWord) {
      el.cardHint.textContent = card.meaning;
      setVisible(el.cardHint, true);
    } else {
      setVisible(el.cardHint, false);
    }
    spokenText = isWord ? card.word : card.char;
  }

  setVisible(el.hintReveal, false);
  el.hintReveal.textContent = '';

  // Script badge (mixed modes)
  if (mode.startsWith('mixed')) {
    el.cardScript.textContent = detectScript(card);
    setVisible(el.cardScript, true);
  } else {
    setVisible(el.cardScript, false);
  }

  // ── Back face ────────────────────────────────────
  const answerText = isRev ? (isWord ? card.word : card.char) : card.romaji[0];
  el.cardAnswer.textContent  = answerText;
  el.cardMeaning.textContent = isWord ? (card.meaning || '') : '';
  el.cardIcon.textContent    = '';
  if (isWord && card.sentence) {
    el.cardSentence.textContent = `${card.sentence}  ${card.sentenceEn || ''}`;
    setVisible(el.cardSentence, true);
  } else {
    setVisible(el.cardSentence, false);
  }

  // ── Timer ────────────────────────────────────────
  if (config.isWord) {
    setVisible(el.timerWrap, true);
    startTimer();
  } else {
    setVisible(el.timerWrap, false);
    stopTimer();
  }

  // ── Input / choice section ──────────────────────
  const useChoice = opts.answerType === 'choice' || opts.answerType === 'reverse';

  if (useChoice) {
    setVisible(el.inputSection, false);
    choices = buildChoices(card);
    renderChoiceButtons(card, choices);
    setVisible(el.choiceSection, true);
  } else {
    setVisible(el.choiceSection, false);
    setVisible(el.inputSection, true);
    el.romajiInput.value = '';
    setTimeout(() => el.romajiInput.focus(), 50);
  }

  // Hint button visibility (type mode only)
  setVisible(el.btnHint, opts.hintsOn && opts.answerType === 'type');

  setVisible(el.nextSection, false);

  updateHUD();
}

function renderChoiceButtons(card, choiceValues) {
  const isWord = MODES[mode].isWord;
  const isRev  = opts.answerType === 'reverse';
  const correctVal = isRev
    ? (isWord ? card.word : card.char)
    : card.romaji[0];

  el.choiceGrid.innerHTML = '';
  choiceValues.forEach((val, idx) => {
    const btn = document.createElement('button');
    btn.className  = 'choice-btn' + (isWord && !isRev ? ' word-choice' : '');
    btn.textContent = val;
    btn.dataset.idx = idx;
    btn.dataset.val = val;
    btn.dataset.correct = val === correctVal ? '1' : '0';
    btn.addEventListener('click', () => handleChoiceClick(btn, correctVal));
    el.choiceGrid.appendChild(btn);
  });
}

// ── HUD ───────────────────────────────────────────────────────
function updateHUD() {
  el.progressBar.style.width  = origSize > 0 ? (mastered / origSize * 100) + '%' : '0%';
  el.progressText.textContent = `${mastered} / ${origSize} mastered`;
  el.statCorrect.textContent  = `✓ ${correct}`;
  el.statWrong.textContent    = `✗ ${wrong + skipped}`;
  el.sessionXpEl.textContent  = `✨ ${sessionXP} XP`;
  renderLives();

  if (combo >= 3) {
    el.comboNum.textContent = combo;
    setVisible(el.comboBadge, true);
  } else {
    setVisible(el.comboBadge, false);
  }
}

// ── Hint ──────────────────────────────────────────────────────
function showHint() {
  const card   = srsQueue[0];
  const answer = card.romaji[0];
  hintsUsed    = Math.min(hintsUsed + 1, answer.length);
  const revealed = answer.slice(0, hintsUsed);
  const hidden   = '_'.repeat(answer.length - hintsUsed);
  el.hintReveal.textContent = revealed + hidden;
  setVisible(el.hintReveal, true);
  sfx('hint');
}

// ── Answer checking ───────────────────────────────────────────
function checkTypeAnswer() {
  if (isRevealed) return;
  const input = el.romajiInput.value.trim().toLowerCase();
  if (!input) return;
  stopTimer();

  const card    = srsQueue[0];
  const isRight = card.romaji.map(r => r.toLowerCase()).includes(input);
  if (!isRight) missed.push({ card, userAnswer: input });
  processAnswer(isRight, false);
}

function handleChoiceClick(btn, correctVal) {
  if (isRevealed) return;
  stopTimer();

  const chosen  = btn.dataset.val;
  const isRight = chosen === correctVal;

  // Visual feedback on buttons
  el.choiceGrid.querySelectorAll('.choice-btn').forEach(b => {
    if (b.dataset.val === correctVal) b.classList.add('is-correct');
    else if (b === btn && !isRight) b.classList.add('is-wrong');
    else b.classList.add('dim');
    b.style.pointerEvents = 'none';
  });

  if (!isRight) missed.push({ card: srsQueue[0], userAnswer: chosen });

  // Short delay so player can see the highlight, then reveal
  setTimeout(() => processAnswer(isRight, false), 600);
}

// ── Core answer processing ────────────────────────────────────
function processAnswer(isRight, isTimeout) {
  isRevealed = true;
  const card   = srsQueue[0];
  const isWord = MODES[mode].isWord;

  if (isRight) {
    correct++;
    combo++;
    srsMarkCorrect();

    // XP
    const timeBonus = !isTimeout && isWord && timeLeft > 4;
    const xpGained  = calcXP(isWord, hintsUsed, combo, timeBonus);
    sessionXP += xpGained;
    el.xpEarnedLabel.textContent = `+${xpGained} XP`;
    setVisible(el.xpEarnedLabel, true);

    sfx('correct');
    if (combo === 3) sfx('combo');

  } else {
    wrong += isTimeout ? 0 : 1;
    if (isTimeout) skipped++;
    combo = 0;
    srsMarkWrong();

    setVisible(el.xpEarnedLabel, false);

    if (opts.livesOn) {
      lives = Math.max(0, lives - 1);
      sfx('loseLife');
      if (lives === 0) {
        // Game over — reveal card then show results after delay
        revealCardFace(isRight, isTimeout, card);
        setTimeout(() => showResults(), 1800);
        return;
      }
    } else {
      sfx('wrong');
    }
  }

  revealCardFace(isRight, isTimeout, card);
  setVisible(el.inputSection, false);
  setVisible(el.choiceSection, false);
  setVisible(el.nextSection, true);
  updateHUD();
}

function revealCardFace(isRight, isTimeout, card) {
  if (isTimeout)    { el.cardIcon.textContent = '⏰'; el.card.classList.add('timeout'); }
  else if (isRight) { el.cardIcon.textContent = '✓';  el.card.classList.add('correct'); }
  else              { el.cardIcon.textContent = '✗';  el.card.classList.add('wrong');   }

  requestAnimationFrame(() => el.card.classList.add('flipped'));

  const msgs = isTimeout
    ? ["Time's up!", 'Too slow!', 'Keep going!']
    : isRight
    ? ['Correct!', 'Well done!', 'Perfect!', 'Great!', 'Excellent!']
    : ['Not quite!', 'Keep practicing!', 'Close!', 'Try again next time!'];

  el.feedbackText.textContent = msgs[Math.floor(Math.random() * msgs.length)];
  el.feedbackText.className   = 'feedback-text ' + (isRight ? 'is-correct' : 'is-wrong');

  // Speak the Japanese again on reveal
  speak(spokenText);
}

function nextCard() {
  loadCard();
}

// ── Results ───────────────────────────────────────────────────
function showResults() {
  stopTimer();
  speechSynthesis && speechSynthesis.cancel();

  // Save to history
  const total = origSize;
  const pct   = total > 0 ? Math.round((correct / total) * 100) : 0;
  saveSession({ mode, correct, wrong, skipped, total, pct });

  // Record progress (XP + streak + daily goal)
  const xpResult = addXP(sessionXP);
  const prog     = recordSessionProgress(correct);

  showScreen('results');

  el.resScore.textContent   = correct;
  el.resTotal.textContent   = total;
  el.resCorrect.textContent = correct;
  el.resWrong.textContent   = wrong;
  el.resSkipped.textContent = skipped;
  el.resXpGained.textContent = `+${sessionXP} XP`;

  if (xpResult.leveledUp) {
    setVisible(el.resLevelUp, true);
    showLevelUpOverlay(xpResult.after);
  } else {
    setVisible(el.resLevelUp, false);
  }

  let grade, cls;
  if      (pct >= 90) { grade='S'; cls='grade-s'; }
  else if (pct >= 80) { grade='A'; cls='grade-a'; }
  else if (pct >= 70) { grade='B'; cls='grade-b'; }
  else if (pct >= 60) { grade='C'; cls='grade-c'; }
  else                { grade='D'; cls='grade-d'; }
  el.resGrade.textContent = grade;
  el.resGrade.className   = 'res-grade ' + cls;

  // Missed list
  if (missed.length > 0) {
    setVisible(el.missedSection, true);
    setVisible(el.btnRetryMissed, true);
    el.retryCount.textContent = missed.length;

    const isWord = MODES[mode].isWord;
    el.missedList.innerHTML = missed.map(({ card, userAnswer }) => {
      const display = isWord ? card.word : card.char;
      const ans     = card.romaji[0];
      const meaning = isWord && card.meaning ? ` — ${card.meaning}` : '';
      const userBit = userAnswer
        ? `<span class="missed-user">You: <em>${userAnswer}</em></span>`
        : `<span class="missed-user">Time ran out</span>`;
      return `<div class="missed-item">
        <span class="missed-char">${display}</span>
        <div class="missed-detail">
          <span class="missed-answer">${ans}${meaning}</span>${userBit}
        </div></div>`;
    }).join('');
  } else {
    setVisible(el.missedSection, false);
    setVisible(el.btnRetryMissed, false);
  }

  updateHomeScreen();
}

function showLevelUpOverlay(levelInfo) {
  sfx('levelUp');
  el.levelupName.textContent = levelInfo.name;
  el.levelupEn.textContent   = levelInfo.nameEn;
  setVisible(el.levelupOverlay, false);
  el.levelupOverlay.classList.remove('hidden');
  setTimeout(() => el.levelupOverlay.classList.add('hidden'), 3000);
}

// ── History storage ───────────────────────────────────────────
function isoWeekKey(date) {
  const d = new Date(date);
  d.setHours(0,0,0,0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const wk   = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getDay() + 6) % 7)) / 7);
  return `${d.getFullYear()}-W${String(wk).padStart(2,'0')}`;
}
function weekKeyToMonday(wk) {
  const [y, w] = wk.split('-W').map(Number);
  const jan4   = new Date(y, 0, 4);
  const d      = new Date(jan4);
  d.setDate(jan4.getDate() - ((jan4.getDay()+6)%7) + (w-1)*7);
  return d;
}
function formatWeekLabel(wk) {
  return weekKeyToMonday(wk).toLocaleDateString('en-GB', { day:'numeric', month:'short' });
}
function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; } catch { return []; }
}
function saveSession(data) {
  const history = loadHistory();
  history.push({ ts: Date.now(), date: new Date().toISOString().slice(0,10), weekKey: isoWeekKey(new Date()), ...data });
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch(_){}
}

// ── Stats screen ──────────────────────────────────────────────
function showStats() {
  showScreen('stats');
  const history = loadHistory();

  if (!history.length) {
    setVisible(el.statsEmpty, true);
    el.stSessions.textContent = el.stQuestions.textContent = '0';
    el.stAccuracy.textContent = '—';
    el.weeklyChart.innerHTML  = el.modeChart.innerHTML = '';
    return;
  }
  setVisible(el.statsEmpty, false);

  const totalQ   = history.reduce((s,e) => s+e.total, 0);
  const totalC   = history.reduce((s,e) => s+e.correct, 0);
  el.stSessions.textContent  = history.length;
  el.stQuestions.textContent = totalQ;
  el.stAccuracy.textContent  = totalQ ? Math.round(totalC/totalQ*100)+'%' : '—';

  // Weekly chart
  const byWeek = {};
  history.forEach(e => {
    if (!byWeek[e.weekKey]) byWeek[e.weekKey] = { correct:0, total:0, n:0 };
    byWeek[e.weekKey].correct += e.correct;
    byWeek[e.weekKey].total   += e.total;
    byWeek[e.weekKey].n++;
  });
  const weeks = Object.keys(byWeek).sort().slice(-8);
  el.weeklyChart.innerHTML = weeks.map(wk => {
    const d   = byWeek[wk];
    const pct = Math.round(d.correct/d.total*100);
    const col = pct>=80?'#27ae60': pct>=60?'#f39c12':'#c0392b';
    return `<div class="chart-row">
      <span class="chart-lbl">${formatWeekLabel(wk)}</span>
      <div class="chart-track"><div class="chart-fill" style="width:${pct}%;background:${col}"></div></div>
      <span class="chart-pct">${pct}%</span>
      <span class="chart-meta">${d.n}×</span>
    </div>`;
  }).join('') || '<p class="chart-empty">No weekly data yet</p>';

  // Mode chart
  const byMode = {};
  history.forEach(e => {
    if (!byMode[e.mode]) byMode[e.mode] = { correct:0, total:0, n:0 };
    byMode[e.mode].correct += e.correct;
    byMode[e.mode].total   += e.total;
    byMode[e.mode].n++;
  });
  const modeOrder = ['hiragana-alpha','hiragana-word','katakana-alpha','katakana-word','mixed-alpha','mixed-word'];
  el.modeChart.innerHTML = modeOrder.filter(m => byMode[m]).map(m => {
    const d   = byMode[m];
    const pct = Math.round(d.correct/d.total*100);
    const col = pct>=80?'#27ae60': pct>=60?'#f39c12':'#c0392b';
    return `<div class="chart-row">
      <span class="chart-lbl mode-lbl">${MODE_LABELS[m]}</span>
      <div class="chart-track"><div class="chart-fill" style="width:${pct}%;background:${col}"></div></div>
      <span class="chart-pct">${pct}%</span>
      <span class="chart-meta">${d.n}×</span>
    </div>`;
  }).join('') || '<p class="chart-empty">No mode data yet</p>';
}

// ── Reference chart screen ────────────────────────────────────
let currentScript = 'hiragana';
function showChart() { showScreen('chart'); renderRefChart(currentScript); }

function renderRefChart(script) {
  currentScript = script;
  document.querySelectorAll('.chart-tab').forEach(t => t.classList.toggle('active', t.dataset.script === script));

  const grid = CHART_GRIDS[script];
  let html = '';

  const renderSection = (rows, label) => {
    html += `<p class="ref-chart-section-label">${label}</p>`;
    rows.forEach(row => {
      html += '<div class="chart-row-grid">';
      row.forEach(ch => {
        if (!ch) {
          html += '<div class="chart-cell empty"></div>';
        } else {
          const rm = ROMAJI_MAP[ch] || '';
          html += `<div class="chart-cell" data-char="${ch}" data-rm="${rm}" tabindex="0" role="button" aria-label="${ch} — ${rm}">
            <span class="chart-cell-jp">${ch}</span>
            <span class="chart-cell-rm">${rm}</span>
          </div>`;
        }
      });
      html += '</div>';
    });
  };

  renderSection(grid.basic,      'Basic');
  renderSection(grid.dakuten,    'Dakuten ＂');
  renderSection(grid.handakuten, 'Handakuten ﾟ');

  el.refChartGrid.innerHTML = html;

  el.refChartGrid.querySelectorAll('.chart-cell:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => speak(cell.dataset.char));
  });
}

// ── Level select ──────────────────────────────────────────────
let pendingAlphaMode = null;

function showLevelSelect(gameMode) {
  pendingAlphaMode = gameMode;
  const isHiragana = gameMode === 'hiragana-alpha';
  const levels     = isHiragana ? ALPHA_LEVELS.hiragana : ALPHA_LEVELS.katakana;
  const scriptName = isHiragana ? 'Hiragana' : 'Katakana';

  el.levelSelectTitle.textContent = scriptName + ' — Choose Level';
  el.levelSelectList.innerHTML = levels.map((lv, i) =>
    `<button class="level-select-btn${lv.chars === null ? ' level-select-btn--full' : ''}" data-idx="${i}">${lv.label}</button>`
  ).join('');

  el.levelSelectList.querySelectorAll('.level-select-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const lv = levels[+btn.dataset.idx];
      hideLevelSelect();
      if (!lv.chars) {
        startGame(gameMode);
      } else {
        const pool  = isHiragana ? HIRAGANA : KATAKANA;
        const cards = pool.filter(c => lv.chars.includes(c.char));
        startGame(gameMode, cards, lv.label);
      }
    });
  });

  el.levelSelectOverlay.classList.remove('hidden');
}

function hideLevelSelect() {
  el.levelSelectOverlay.classList.add('hidden');
  pendingAlphaMode = null;
}

// ── Event listeners ───────────────────────────────────────────
// Home — mode buttons
document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const m = btn.dataset.mode;
    if (m === 'hiragana-alpha' || m === 'katakana-alpha') {
      showLevelSelect(m);
    } else {
      startGame(m);
    }
  });
});

// Home — option toggles
document.querySelectorAll('.opt-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.opt;
    const val = btn.dataset.val;
    opts[key] = (val === 'true') ? true : (val === 'false') ? false : val;
    saveOpts();
    updateHomeScreen();
  });
});

el.btnStats.addEventListener('click', showStats);
el.btnChart.addEventListener('click', showChart);

// Game
el.btnBack.addEventListener('click', () => {
  stopTimer();
  speechSynthesis && speechSynthesis.cancel();
  showScreen('home');
  updateHomeScreen();
});
el.btnSpeak.addEventListener('click',  () => speak(spokenText));
el.btnHint.addEventListener('click',   showHint);
el.btnPause.addEventListener('click',  () => { isPaused ? resumeTimer() : pauseTimer(); });
el.btnSubmit.addEventListener('click', checkTypeAnswer);
el.levelSelectClose.addEventListener('click', hideLevelSelect);
el.levelSelectBackdrop.addEventListener('click', hideLevelSelect);
el.romajiInput.addEventListener('keydown', e => { if (e.key === 'Enter') checkTypeAnswer(); });
el.btnNext.addEventListener('click', nextCard);

// Results
el.btnPlayAgain.addEventListener('click',   () => startGame(mode));
el.btnRetryMissed.addEventListener('click', () => startGame(mode, missed.map(m => m.card)));
el.btnViewStats.addEventListener('click',   showStats);
el.btnHome.addEventListener('click', () => { showScreen('home'); updateHomeScreen(); });

// Stats
el.btnStatsBack.addEventListener('click', () => { showScreen('home'); updateHomeScreen(); });
el.btnClearStats.addEventListener('click', () => {
  if (confirm('Clear all progress history?')) {
    localStorage.removeItem(HISTORY_KEY);
    showStats();
  }
});

// Chart
el.btnChartBack.addEventListener('click', () => { showScreen('home'); updateHomeScreen(); });
document.querySelectorAll('.chart-tab').forEach(tab => {
  tab.addEventListener('click', () => renderRefChart(tab.dataset.script));
});

// Level-up overlay — tap to dismiss early
el.levelupOverlay.addEventListener('click', () => el.levelupOverlay.classList.add('hidden'));

// Spacebar shortcuts
document.addEventListener('keydown', e => {
  if (e.code !== 'Space') return;
  if (!mode) return; // not in a game
  if (e.target === el.romajiInput) return; // let input handle its own spaces

  e.preventDefault();

  // If card already revealed — spacebar = next card
  if (!el.nextSection.classList.contains('hidden')) {
    nextCard();
    return;
  }

  if (isRevealed) return;

  if (MODES[mode].isWord) {
    // Word game: toggle pause
    isPaused ? resumeTimer() : pauseTimer();
  } else {
    // Alphabet game: flip card to reveal answer (counts as skip)
    stopTimer();
    skipped++;
    missed.push({ card: srsQueue[0], userAnswer: '' });
    processAnswer(false, true);
  }
});

// ── Boot ──────────────────────────────────────────────────────
updateHomeScreen();
