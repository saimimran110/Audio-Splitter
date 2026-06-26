import { useState, useRef, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Pause, Download, Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  title: string;
  audioUrl: string;
  downloadUrl: string;
  icon: React.ReactNode;
  variant: 'vocals' | 'instrumental';
}

const BAR_COUNT = 40;

export const AudioPlayer = ({ title, audioUrl, downloadUrl, icon, variant }: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [audioError, setAudioError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const barsContainerRef = useRef<HTMLDivElement>(null);

  // Generate stable random bar heights
  const barHeights = useMemo(() =>
    Array.from({ length: BAR_COUNT }, (_, i) => {
      // Create a waveform-like shape: louder in middle, quieter at edges
      const center = BAR_COUNT / 2;
      const dist = Math.abs(i - center) / center;
      const base = 20 + (1 - dist * 0.6) * 40;
      const variation = Math.sin(i * 0.8) * 15 + Math.cos(i * 1.3) * 10;
      return Math.max(10, Math.min(90, base + variation));
    }), []);

  // Generate animation speeds for each bar
  const barSpeeds = useMemo(() =>
    Array.from({ length: BAR_COUNT }, () => `${0.4 + Math.random() * 0.6}s`), []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);
    const handleError = () => {
      setAudioError('Could not load audio. The file may still be processing.');
      setIsPlaying(false);
    };

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [audioUrl]);

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      try {
        setAudioError(null);
        await audio.play();
        setIsPlaying(true);
      } catch (err) {
        const name = (err as Error)?.name;
        if (name !== 'AbortError') {
          console.error('Playback error:', err);
          setAudioError('Playback failed. Try clicking play again.');
        }
        setIsPlaying(false);
      }
    }
  };

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `${title.toLowerCase().replace(/\s+/g, '_')}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const progressBarIndex = Math.floor((progress / 100) * BAR_COUNT);

  // Handle seeking by clicking on waveform bars
  const handleBarsClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!barsContainerRef.current || !audioRef.current || duration === 0) return;

    const rect = barsContainerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickPercent = Math.min(Math.max(clickX / rect.width, 0), 1);
    const newTime = clickPercent * duration;

    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  return (
    <Card className={cn(
      "audio-player transition-all duration-300 hover:scale-105",
      variant === 'vocals' ? "hover:shadow-glow" : "hover:shadow-glow-secondary"
    )}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-3 text-lg">
          <div className={cn(
            "p-2 rounded-lg",
            variant === 'vocals' ? "bg-primary/20 text-primary" : "bg-secondary/20 text-secondary"
          )}>
            {icon}
          </div>
          {title}
          {isPlaying && (
            <Volume2 className={cn(
              "h-4 w-4 ml-auto animate-pulse",
              variant === 'vocals' ? "text-primary" : "text-secondary"
            )} />
          )}
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {audioError && (
          <p className="text-xs text-destructive text-center">{audioError}</p>
        )}

        {/* Waveform Bars */}
        <div
          ref={barsContainerRef}
          className="waveform-bars-container"
          onClick={handleBarsClick}
        >
          {barHeights.map((height, i) => {
            const isActive = i <= progressBarIndex;
            const barMinHeight = Math.max(8, height * 0.3);
            const barMaxHeight = height;

            return (
              <div
                key={i}
                className={cn(
                  "waveform-bar-item",
                  isActive ? "active" : "inactive",
                  isPlaying ? "playing" : "paused"
                )}
                style={{
                  '--bar-speed': barSpeeds[i],
                  '--bar-min': `${barMinHeight}%`,
                  '--bar-max': `${barMaxHeight}%`,
                  '--bar-base-height': `${height * 0.5}%`,
                  height: isPlaying ? undefined : `${height * 0.5}%`,
                  animationDelay: `${i * 0.03}s`,
                } as React.CSSProperties}
              />
            );
          })}
        </div>

        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant={variant === 'vocals' ? 'neon' : 'neon-secondary'}
            size="icon"
            onClick={togglePlay}
            className="flex-shrink-0 btn-press"
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="glow"
            onClick={handleDownload}
            className="flex-1 btn-shimmer btn-press"
          >
            <Download className="h-4 w-4" />
            Download {title}
          </Button>
        </div>
      </CardContent>

      <audio ref={audioRef} src={audioUrl} preload="auto" />
    </Card>
  );
};

const formatTime = (time: number): string => {
  if (isNaN(time)) return '0:00';

  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};