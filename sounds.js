// ============================================================
//  Japanese Flip Cards — Sound Effects (Web Audio API)
//  All sounds synthesised — no audio files needed.
// ============================================================

const SFX = (() => {
  let ctx = null;

  function getCtx() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    // Resume on iOS if suspended
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, type, dur, vol = 0.28, delay = 0) {
    try {
      const c    = getCtx();
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime + delay);
      gain.gain.setValueAtTime(vol, c.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + delay + dur);
      osc.start(c.currentTime + delay);
      osc.stop(c.currentTime + delay + dur + 0.05);
    } catch (_) { /* audio not available — fail silently */ }
  }

  return {
    correct() {
      tone(523.25, 'sine', 0.10, 0.25);
      tone(659.25, 'sine', 0.10, 0.25, 0.10);
      tone(783.99, 'sine', 0.18, 0.30, 0.20);
    },
    wrong() {
      tone(220, 'sawtooth', 0.15, 0.28);
      tone(180, 'sawtooth', 0.22, 0.22, 0.12);
    },
    combo() {
      tone(660,  'sine', 0.07, 0.22);
      tone(880,  'sine', 0.07, 0.22, 0.08);
      tone(1100, 'sine', 0.12, 0.28, 0.16);
    },
    levelUp() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 'sine', 0.18, 0.35, i * 0.13));
    },
    loseLife() {
      tone(300, 'square', 0.12, 0.30);
      tone(200, 'square', 0.25, 0.25, 0.11);
    },
    gameOver() {
      [440, 370, 311, 261].forEach((f, i) => tone(f, 'sine', 0.22, 0.28, i * 0.18));
    },
    hint() {
      tone(1000, 'sine', 0.08, 0.15);
    },
    tick() {
      tone(900, 'square', 0.04, 0.12);
    },
  };
})();
