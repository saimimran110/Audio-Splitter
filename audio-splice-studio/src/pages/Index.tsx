import { useState, useEffect, useRef, useCallback, DragEvent } from 'react';
import { ProcessingState } from '@/components/ProcessingState';
import { AudioPlayer } from '@/components/AudioPlayer';
import { AdSenseSlot } from '@/components/AdSenseSlot';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mic, Music2, Sparkles, AlertCircle, Instagram } from 'lucide-react';
import { splitAudio, getAudioUrl, SplitResult } from '@/services/api';

/* ─── Animated Split Waveform Visual ─── */
const SplitWaveformVisual = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const startRef = useRef(Date.now());

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const t = (Date.now() - startRef.current) / 1000;

    ctx.clearRect(0, 0, w, h);

    const barW = 3;
    const gap = 2;
    const totalBars = Math.floor(w / (barW + gap));
    const trackH = h * 0.32;
    const musicY = h * 0.30;
    const vocalY = h * 0.70;

    // Draw label backgrounds
    const labelW = 56;

    // "Music" label
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.roundRect(8, musicY - trackH / 2 - 2, labelW, trackH + 4, 6);
    ctx.fill();
    ctx.fillStyle = '#a78bfa';
    ctx.font = '600 11px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Music', 8 + labelW / 2, musicY);

    // "Vocal" label
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.roundRect(8, vocalY - trackH / 2 - 2, labelW, trackH + 4, 6);
    ctx.fill();
    ctx.fillStyle = '#34d399';
    ctx.font = '600 11px Poppins, sans-serif';
    ctx.fillText('Vocal', 8 + labelW / 2, vocalY);

    // Speaker icons (small triangles)
    const drawSpeaker = (cx: number, cy: number, color: string) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(cx - 4, cy - 3);
      ctx.lineTo(cx + 2, cy - 6);
      ctx.lineTo(cx + 2, cy + 6);
      ctx.lineTo(cx - 4, cy + 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx - 6, cy - 3, 3, 6);
      // Sound waves
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 3);
      ctx.beginPath();
      ctx.arc(cx + 4, cy, 5, -0.6, 0.6);
      ctx.stroke();
      ctx.globalAlpha = 0.3 + 0.3 * Math.sin(t * 3 + 1);
      ctx.beginPath();
      ctx.arc(cx + 4, cy, 9, -0.6, 0.6);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    drawSpeaker(labelW + 24, musicY, '#a78bfa');
    drawSpeaker(labelW + 24, vocalY, '#34d399');

    const barsStartX = labelW + 44;
    const barsW = w - barsStartX - 12;
    const visibleBars = Math.floor(barsW / (barW + gap));

    // Draw waveform bars for each track
    for (let i = 0; i < visibleBars; i++) {
      const x = barsStartX + i * (barW + gap);
      const nx = i / visibleBars;

      // Music waveform — complex mix
      const musicAmp = (
        Math.sin(nx * 12 + t * 0.8) * 0.4 +
        Math.sin(nx * 20 + t * 1.2) * 0.25 +
        Math.sin(nx * 5 + t * 0.5) * 0.3 +
        Math.cos(nx * 35 + t * 1.5) * 0.15
      );
      const musicH = Math.abs(musicAmp) * trackH * 0.85 + 2;

      // Create gradient for music bars
      const musicGrad = ctx.createLinearGradient(x, musicY - musicH / 2, x, musicY + musicH / 2);
      musicGrad.addColorStop(0, 'rgba(139, 92, 246, 0.8)');
      musicGrad.addColorStop(0.5, 'rgba(99, 102, 241, 0.9)');
      musicGrad.addColorStop(1, 'rgba(139, 92, 246, 0.8)');
      ctx.fillStyle = musicGrad;
      ctx.fillRect(x, musicY - musicH / 2, barW, musicH);

      // Vocal waveform — smoother, more organic
      const vocalAmp = (
        Math.sin(nx * 8 + t * 0.6) * 0.35 +
        Math.sin(nx * 15 + t * 0.9) * 0.3 +
        Math.cos(nx * 25 + t * 1.3) * 0.15 +
        Math.sin(nx * 3 + t * 0.3) * 0.2
      );
      const vocalH = Math.abs(vocalAmp) * trackH * 0.85 + 2;

      const vocalGrad = ctx.createLinearGradient(x, vocalY - vocalH / 2, x, vocalY + vocalH / 2);
      vocalGrad.addColorStop(0, 'rgba(52, 211, 153, 0.75)');
      vocalGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.9)');
      vocalGrad.addColorStop(1, 'rgba(52, 211, 153, 0.75)');
      ctx.fillStyle = vocalGrad;
      ctx.fillRect(x, vocalY - vocalH / 2, barW, vocalH);
    }

    // Divider line between tracks
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(barsStartX, h * 0.5);
    ctx.lineTo(w - 12, h * 0.5);
    ctx.stroke();

    // Subtle glow behind waveforms
    ctx.globalCompositeOperation = 'screen';
    const glowM = ctx.createRadialGradient(w * 0.55, musicY, 10, w * 0.55, musicY, w * 0.35);
    glowM.addColorStop(0, 'rgba(139, 92, 246, 0.03)');
    glowM.addColorStop(1, 'transparent');
    ctx.fillStyle = glowM;
    ctx.fillRect(0, 0, w, h);

    const glowV = ctx.createRadialGradient(w * 0.55, vocalY, 10, w * 0.55, vocalY, w * 0.35);
    glowV.addColorStop(0, 'rgba(52, 211, 153, 0.03)');
    glowV.addColorStop(1, 'transparent');
    ctx.fillStyle = glowV;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    animRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '620px',
        margin: '0 auto',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '16px',
        padding: '8px',
        position: 'relative',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '200px', display: 'block', borderRadius: '12px' }}
      />
    </div>
  );
};

/* ─── Main Page ─── */
const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false); // bar racing to 100%
  const [result, setResult] = useState<SplitResult | null>(null);
  const [pendingResult, setPendingResult] = useState<SplitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const featureCardsRef = useRef<HTMLDivElement>(null);

  // Scroll reveal for feature cards
  useEffect(() => {
    const container = featureCardsRef.current;
    if (!container) return;
    const cards = container.querySelectorAll('.scroll-reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [result]);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('audio/')) return;
    if (file.size > 20 * 1024 * 1024) {
      alert('File is too large. Maximum size is 20MB.');
      return;
    }
    handleFileUpload(file);
  };

  const handleFileUpload = async (file: File) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setIsCompleting(false);
    setError(null);
    setPendingResult(null);
    setStatusMessage('Uploading file...');
    try {
      const splitResult = await splitAudio(file, setStatusMessage);
      if (!splitResult?.vocals || !splitResult?.karaoke) {
        throw new Error('Processing completed but audio URLs are missing. Please hard-refresh (Ctrl+Shift+R) and try again.');
      }
      // Backend done! Start the "completing" phase — bar races to 100%
      setPendingResult(splitResult);
      setIsCompleting(true);
      setStatusMessage('');
      // Wait 2s for the progress bar to fill to 100% and show "Setting things up"
      setTimeout(() => {
        setResult(splitResult);
        setIsProcessing(false);
        setIsCompleting(false);
        setPendingResult(null);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process audio file');
      setSelectedFile(null);
      setIsProcessing(false);
      setIsCompleting(false);
      setStatusMessage('');
    }
  };

  const handleCancelProcessing = () => {
    setIsProcessing(false);
    setIsCompleting(false);
    setSelectedFile(null);
    setPendingResult(null);
    setStatusMessage('');
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFile(files[0]);
  };

  return (
    <div className="min-h-screen bg-background relative">
      {/* Header */}
      <header className="relative z-10 fade-in-section delay-1">
        <div className="container mx-auto px-4 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-primary rounded-lg">
                <Sparkles className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                AI Audio Splitter
              </h1>
            </div>
            <div className="flex items-center gap-6">
              <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
                HOW IT WORKS
              </a>
              <a
                href="https://www.instagram.com/saimimran__?igsh=MXJyMnB4dzl5bmJtbw=="
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
                aria-label="Instagram"
              >
                <Instagram className="h-5 w-5" />
              </a>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10">
        <div className="max-w-4xl mx-auto px-4">

          {/* ════════ LANDING VIEW ════════ */}
          {!selectedFile && !result && !error && (
            <div
              className="fade-in-section delay-2"
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{ minHeight: 'calc(100vh - 200px)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}
            >
              {/* Title */}
              <div className="text-center mb-10" style={{ marginTop: '-40px' }}>
                <h2
                  style={{
                    fontSize: 'clamp(28px, 5vw, 48px)',
                    fontWeight: 700,
                    lineHeight: 1.15,
                    color: '#f3f4f6',
                    marginBottom: '16px',
                  }}
                >
                  Vocal Remover and Isolation
                </h2>
                <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: '#9ca3af', maxWidth: '560px', margin: '0 auto' }}>
                  Separate voice from music out of a song free with powerful AI algorithms
                </p>
              </div>

              {/* Animated Split Waveform */}
              <div className="mb-10">
                <SplitWaveformVisual />
              </div>

              {/* Browse Button */}
              <div className="text-center">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="btn-shimmer btn-press"
                  style={{
                    padding: '14px 40px',
                    fontSize: '15px',
                    fontWeight: 600,
                    fontFamily: 'Poppins, sans-serif',
                    color: '#e5e7eb',
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.25s ease',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.10)';
                    e.currentTarget.style.borderColor = 'rgba(139,92,246,0.5)';
                    e.currentTarget.style.boxShadow = '0 0 25px rgba(139,92,246,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  Browse my files
                </button>
                <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
                  or drop a file here · MP3, WAV · Max 20MB
                </p>
              </div>

              {/* Drag overlay */}
              {dragOver && (
                <div
                  style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 50,
                    background: 'rgba(139, 92, 246, 0.08)',
                    border: '3px dashed rgba(139, 92, 246, 0.5)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '0',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎵</div>
                    <p style={{ fontSize: '20px', fontWeight: 600, color: '#c084fc' }}>Drop your audio file here</p>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const files = e.target.files;
                  if (files && files.length > 0) handleFile(files[0]);
                }}
              />
            </div>
          )}

          {/* ════════ ERROR ════════ */}
          {error && (
            <div className="pt-20 fade-in-section delay-1" style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
              <Alert className="border-destructive bg-destructive/10">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-destructive font-medium">
                  {error}
                </AlertDescription>
              </Alert>
              <div className="text-center mt-6">
                <button
                  onClick={() => { setSelectedFile(null); setResult(null); setError(null); }}
                  className="text-primary hover:text-primary-glow transition-colors underline underline-offset-4 btn-press"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* ════════ PROCESSING ════════ */}
          {isProcessing && (
            <ProcessingState message={statusMessage} onCancel={handleCancelProcessing} isCompleting={isCompleting} />
          )}

          {/* ════════ RESULTS ════════ */}
          {result && !isProcessing && (
            <div className="space-y-8 fade-in-section delay-1 pt-16 pb-8">
              <div className="text-center">
                <h3 className="text-2xl font-semibold mb-2">Split Complete! 🎉</h3>
                <p className="text-muted-foreground">
                  Your audio has been successfully separated. Play and download both tracks below.
                </p>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                <AudioPlayer
                  title="Vocals Only"
                  audioUrl={getAudioUrl(result.vocals)}
                  downloadUrl={getAudioUrl(result.vocals)}
                  icon={<Mic className="h-5 w-5" />}
                  variant="vocals"
                />
                <AudioPlayer
                  title="Instrumental"
                  audioUrl={getAudioUrl(result.karaoke)}
                  downloadUrl={getAudioUrl(result.karaoke)}
                  icon={<Music2 className="h-5 w-5" />}
                  variant="instrumental"
                />
              </div>
              <div className="text-center">
                <button
                  onClick={() => { setSelectedFile(null); setResult(null); setError(null); }}
                  className="text-primary hover:text-primary-glow transition-colors underline underline-offset-4 btn-press"
                >
                  Split Another Song
                </button>
              </div>
            </div>
          )}

          {/* ════════ FEATURES ════════ */}
          <div id="features" ref={featureCardsRef} className="grid md:grid-cols-3 gap-6 py-20">
            <Card className="scroll-reveal bg-background/60 backdrop-blur-sm border-primary/20 hover:border-primary/40 transition-all duration-300 hover:scale-105 hover:shadow-glow" style={{ transitionDelay: '0s' }}>
              <CardContent className="p-6 text-center">
                <div className="bg-primary/20 p-3 rounded-lg w-fit mx-auto mb-4">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h4 className="font-semibold mb-2">AI-Powered</h4>
                <p className="text-sm text-muted-foreground">
                  Advanced machine learning algorithms for high-quality separation
                </p>
              </CardContent>
            </Card>

            <Card className="scroll-reveal bg-background/60 backdrop-blur-sm border-secondary/20 hover:border-secondary/40 transition-all duration-300 hover:scale-105 hover:shadow-glow-secondary" style={{ transitionDelay: '0.15s' }}>
              <CardContent className="p-6 text-center">
                <div className="bg-secondary/20 p-3 rounded-lg w-fit mx-auto mb-4">
                  <Music2 className="h-6 w-6 text-secondary" />
                </div>
                <h4 className="font-semibold mb-2">High Quality</h4>
                <p className="text-sm text-muted-foreground">
                  Preserve audio quality while cleanly separating tracks
                </p>
              </CardContent>
            </Card>

            <Card className="scroll-reveal bg-background/60 backdrop-blur-sm border-accent/20 hover:border-accent/40 transition-all duration-300 hover:scale-105 hover:shadow-glow" style={{ transitionDelay: '0.3s' }}>
              <CardContent className="p-6 text-center">
                <div className="bg-accent/20 p-3 rounded-lg w-fit mx-auto mb-4">
                  <Mic className="h-6 w-6 text-accent" />
                </div>
                <h4 className="font-semibold mb-2">Fast Processing</h4>
                <p className="text-sm text-muted-foreground">
                  Get your separated tracks in minutes with cloud AI
                </p>
              </CardContent>
            </Card>
          </div>

          <AdSenseSlot />
        </div>
      </main>

      {/* Footer */}
      {/* <footer className="border-t border-border/50 bg-background/80 mt-8 relative z-10">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p>&copy; 2024 AI Audio Splitter. Built with ❤️ for music lovers.</p>
          </div>
        </div>
      </footer> */}
    </div>
  );
};

export default Index;