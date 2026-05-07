// Web Audio synthesized sound effects. No assets, no autoplay — only fires on user-driven events.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
  try {
    localStorage.setItem("sound_enabled", v ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export function loadSoundPref(): boolean {
  try {
    const v = localStorage.getItem("sound_enabled");
    if (v !== null) enabled = v === "1";
  } catch {
    /* ignore */
  }
  return enabled;
}

function ensureCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    try {
      ctx = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    } catch {
      return null;
    }
  }
  return ctx;
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.08, when = 0) {
  if (!enabled) return;
  const ac = ensureCtx();
  if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

export const sounds = {
  buy() {
    tone(660, 0.15, "sine", 0.06);
    tone(880, 0.18, "sine", 0.05, 0.08);
  },
  sell() {
    tone(440, 0.18, "triangle", 0.06);
    tone(330, 0.22, "triangle", 0.05, 0.08);
  },
  win() {
    tone(880, 0.1, "sine", 0.07);
    tone(1175, 0.12, "sine", 0.07, 0.09);
    tone(1568, 0.18, "sine", 0.07, 0.18);
  },
  loss() {
    tone(220, 0.25, "sawtooth", 0.04);
    tone(180, 0.3, "sawtooth", 0.04, 0.08);
  },
  click() {
    tone(1200, 0.05, "square", 0.025);
  },
};
