import { useEffect, useState, useRef, useMemo, useCallback } from 'react';

interface ProcessingStateProps {
  message?: string;
  onCancel?: () => void;
  isCompleting?: boolean;
}

const STAGES = [
  { label: 'Analyzing audio structure...', range: [0, 15] },
  { label: 'Separating vocal frequencies...', range: [15, 40] },
  { label: 'Isolating instrumental layers...', range: [40, 65] },
  { label: 'Enhancing audio quality...', range: [65, 85] },
  { label: 'Finalizing stems...', range: [85, 100] },
];

const MUSIC_FACTS = [
  'The human ear can distinguish over 400,000 different sounds 🎧',
  'Vocals sit between 80Hz–1100Hz in the frequency spectrum 🎤',
  'AI stem separation uses deep neural networks trained on millions of songs 🤖',
  'The first music AI was built at Bell Labs in 1957 🔬',
  'Demucs, the model powering this tool, was created by Meta Research 🧠',
  'Your track is being analyzed at 44,100 samples per second ⚡',
  'Karaoke was invented in Japan in 1971 🎤',
  'The Beatles used over 200 overdubs on some recordings 🎸',
];

export const ProcessingState = ({ onCancel, isCompleting }: ProcessingStateProps) => {
  const [elapsed, setElapsed] = useState(0);
  const [smoothProgress, setSmoothProgress] = useState(0);
  const [factIndex, setFactIndex] = useState(0);
  const [factVisible, setFactVisible] = useState(true);
  const [barHeights, setBarHeights] = useState(() => Array.from({ length: 28 }, () => Math.random()));
  const startRef = useRef(Date.now());
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  // Elapsed timer
  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Rotate facts every 10s with fade
  useEffect(() => {
    const id = setInterval(() => {
      setFactVisible(false);
      setTimeout(() => {
        setFactIndex(i => (i + 1) % MUSIC_FACTS.length);
        setFactVisible(true);
      }, 400);
    }, 10000);
    return () => clearInterval(id);
  }, []);

  // Animate EQ bars
  useEffect(() => {
    const id = setInterval(() => {
      setBarHeights(prev => prev.map(h => Math.max(0.1, Math.min(1, h + (Math.random() - 0.5) * 0.4))));
    }, 120);
    return () => clearInterval(id);
  }, []);

  // Smooth progress
  useEffect(() => {
    if (isCompleting) {
      const id = setInterval(() => {
        setSmoothProgress(prev => {
          if (prev >= 100) { clearInterval(id); return 100; }
          return Math.min(prev + 2, 100);
        });
      }, 30);
      return () => clearInterval(id);
    } else {
      const id = setInterval(() => {
        const elapsedSec = (Date.now() - startRef.current) / 1000;
        const maxDuration = 210;
        const linear = Math.min(elapsedSec / maxDuration, 1);
        const eased = 1 - Math.pow(1 - linear, 2);
        setSmoothProgress(Math.min(eased * 85, 85));
      }, 500);
      return () => clearInterval(id);
    }
  }, [isCompleting]);

  // Background canvas waves
  const drawWaves = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const t = (Date.now() - startRef.current) / 1000;
    ctx.clearRect(0, 0, w, h);

    const waves = [
      { y: h * 0.35, freq: 0.8, amp: 22, speed: 0.3, color: 'rgba(139,92,246,0.05)' },
      { y: h * 0.5, freq: 1.2, amp: 16, speed: 0.45, color: 'rgba(6,182,212,0.04)' },
      { y: h * 0.65, freq: 0.9, amp: 20, speed: 0.28, color: 'rgba(139,92,246,0.04)' },
    ];

    for (const wave of waves) {
      ctx.beginPath();
      ctx.strokeStyle = wave.color;
      ctx.lineWidth = 1.5;
      const breathe = 1 + 0.2 * Math.sin(t * 0.4);
      for (let x = 0; x <= w; x += 3) {
        const y = wave.y + Math.sin((x / w) * Math.PI * 2 * wave.freq + t * wave.speed) * wave.amp * breathe;
        if (x === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * 0.5);
    glow.addColorStop(0, `rgba(139,92,246,${0.04 + 0.02 * Math.sin(t * 0.5)})`);
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    animRef.current = requestAnimationFrame(drawWaves);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(drawWaves);
    return () => cancelAnimationFrame(animRef.current);
  }, [drawWaves]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const currentStage = STAGES.find(s => smoothProgress >= s.range[0] && smoothProgress < s.range[1]) || STAGES[STAGES.length - 1];
  const stageLabel = isCompleting ? 'Finalizing stems...' : currentStage.label;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#070710',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Poppins, sans-serif',
      overflow: 'hidden',
    }}>
      {/* Background canvas */}
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />

      {/* Floating notes — far background, very subtle */}
      {useMemo(() => Array.from({ length: 8 }, (_, i) => (
        <span key={i} style={{
          position: 'absolute', zIndex: 1, pointerEvents: 'none', userSelect: 'none',
          left: `${10 + i * 11}%`,
          bottom: '-30px',
          fontSize: `${12 + (i % 3) * 4}px`,
          color: `rgba(139,92,246,${0.04 + (i % 3) * 0.02})`,
          animation: `float-up ${8 + i * 1.5}s linear infinite`,
          animationDelay: `${i * 2}s`,
        }}>
          {['♪', '♫', '♩', '♬'][i % 4]}
        </span>
      )), [])}

      {/* Main content — single centered column, nothing overlapping */}
      <div style={{
        position: 'relative', zIndex: 10,
        width: '100%', maxWidth: '420px',
        padding: '0 24px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0',
      }}>

        {/* 1. Pulsing icon */}
        <div style={{
          width: '72px', height: '72px', borderRadius: '50%',
          background: 'rgba(139,92,246,0.12)',
          border: '1px solid rgba(139,92,246,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'glow-pulse 2.5s ease-in-out infinite',
          marginBottom: '28px',
          flexShrink: 0,
        }}>
          <span style={{ fontSize: '30px' }}>🎵</span>
        </div>

        {/* 2. Timer — large, bold */}
        <div style={{
          fontSize: 'clamp(52px, 12vw, 72px)',
          fontWeight: 700, fontFamily: 'monospace',
          color: '#f3f4f6', lineHeight: 1,
          letterSpacing: '6px',
          marginBottom: '16px',
          flexShrink: 0,
        }}>
          {formatTime(elapsed)}
        </div>

        {/* 3. Stage label */}
        <p style={{
          fontSize: '14px', color: '#a78bfa',
          marginBottom: '28px', lineHeight: 1.4,
          fontWeight: 500, textAlign: 'center',
          minHeight: '20px', flexShrink: 0,
        }}>
          {stageLabel}
        </p>

        {/* 4. EQ bars animation */}
        <div style={{
          display: 'flex', alignItems: 'flex-end', gap: '3px',
          height: '40px', marginBottom: '28px', flexShrink: 0,
        }}>
          {barHeights.map((h, i) => (
            <div key={i} style={{
              width: '5px',
              height: `${Math.max(4, h * 36)}px`,
              borderRadius: '3px',
              background: i < barHeights.length / 2
                ? `rgba(139,92,246,${0.5 + h * 0.5})`
                : `rgba(6,182,212,${0.5 + h * 0.5})`,
              transition: 'height 0.12s ease',
              flexShrink: 0,
            }} />
          ))}
        </div>

        {/* 5. Progress bar */}
        <div style={{
          width: '100%', height: '6px', borderRadius: '3px',
          background: 'rgba(255,255,255,0.06)',
          overflow: 'hidden', marginBottom: '8px', flexShrink: 0,
        }}>
          <div style={{
            height: '100%', borderRadius: '3px',
            width: `${smoothProgress}%`,
            background: 'linear-gradient(90deg, #8b5cf6, #06b6d4)',
            backgroundSize: '200% 100%',
            animation: 'progress-shimmer 2s linear infinite',
            transition: 'width 0.5s ease-out',
          }} />
        </div>

        {/* 6. % complete */}
        <p style={{
          fontSize: '11px', color: '#4b5563',
          marginBottom: '32px', flexShrink: 0,
        }}>
          {Math.round(smoothProgress)}% complete &nbsp;·&nbsp; avg ~3 min, longer songs up to 5 min
        </p>

        {/* 7. Rotating music fact */}
        <p style={{
          fontSize: '12px', color: '#6b7280',
          fontStyle: 'italic', textAlign: 'center',
          lineHeight: 1.6, maxWidth: '340px',
          marginBottom: '32px', flexShrink: 0,
          opacity: factVisible ? 1 : 0,
          transition: 'opacity 0.4s ease',
          minHeight: '38px',
        }}>
          {MUSIC_FACTS[factIndex]}
        </p>

        {/* 8. Cancel button */}
        {onCancel && !isCompleting && (
          <button
            onClick={onCancel}
            style={{
              padding: '10px 32px',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '9999px',
              background: 'transparent',
              color: '#6b7280',
              fontSize: '13px',
              fontFamily: 'Poppins, sans-serif',
              cursor: 'pointer',
              transition: 'all 0.25s ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)';
              e.currentTarget.style.color = '#f87171';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              e.currentTarget.style.color = '#6b7280';
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
};
