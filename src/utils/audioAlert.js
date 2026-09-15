/**
 * High-penetration, clear and loud service bell alert for the Barista
 * Synthesizes a loud brass counter service bell (Ding-Ding-Ding! 🛎️)
 * Uses Web Audio API dynamics compressor to ensure maximum loudness without distortion.
 */

let sharedAudioCtx = null;

function getAudioContext() {
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
}

/**
 * Plays a single bell strike with metallic overtones
 */
function playStrike(ctx, outputNode, startTime, baseFreq, gainLevel, duration = 0.75) {
  // Harmonic ratios typical of a brass service bell / chime
  const harmonics = [
    { freqMult: 1.0, type: 'sine', gainMult: 0.55 },
    { freqMult: 2.0, type: 'triangle', gainMult: 0.35 },
    { freqMult: 2.76, type: 'sine', gainMult: 0.25 },
    { freqMult: 4.0, type: 'sine', gainMult: 0.18 },
    { freqMult: 5.4, type: 'sine', gainMult: 0.12 }
  ];

  harmonics.forEach(({ freqMult, type, gainMult }) => {
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(baseFreq * freqMult, startTime);

      const targetGain = gainLevel * gainMult;
      gain.gain.setValueAtTime(0.0001, startTime);
      // Instant sharp attack (2ms)
      gain.gain.exponentialRampToValueAtTime(targetGain, startTime + 0.003);
      // Ringing exponential decay
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(outputNode);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    } catch (e) {
      // Ignore individual oscillator error
    }
  });
}

export function playCafeOrderChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    // Master Limiter / Compressor to maximize volume safely without digital clipping
    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-6, ctx.currentTime);
    compressor.knee.setValueAtTime(8, ctx.currentTime);
    compressor.ratio.setValueAtTime(14, ctx.currentTime);
    compressor.attack.setValueAtTime(0.001, ctx.currentTime);
    compressor.release.setValueAtTime(0.2, ctx.currentTime);

    // Master high-gain stage
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.95, ctx.currentTime);

    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    const now = ctx.currentTime;

    // Strike 1: A5 (880 Hz) - Attention grabber
    playStrike(ctx, masterGain, now, 880, 0.85, 0.5);

    // Strike 2: C#6 (1108.7 Hz) - Crisp high chime
    playStrike(ctx, masterGain, now + 0.18, 1108.7, 0.9, 0.55);

    // Strike 3: E6 (1318.5 Hz) - Loud resolving resonant ring
    playStrike(ctx, masterGain, now + 0.38, 1318.5, 1.0, 0.9);

  } catch (e) {
    console.warn('Audio chime playback blocked or not supported:', e);
  }
}
