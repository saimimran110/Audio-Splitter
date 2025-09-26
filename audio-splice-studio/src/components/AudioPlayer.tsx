import { useState, useRef, useEffect } from 'react';
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

export const AudioPlayer = ({ title, audioUrl, downloadUrl, icon, variant }: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(downloadUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.toLowerCase().replace(' ', '_')}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to direct link
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `${title.toLowerCase().replace(' ', '_')}.wav`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Handle seeking by clicking on progress bar
  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !audioRef.current || duration === 0) return;
    
    const rect = progressBarRef.current.getBoundingClientRect();
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
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div 
          ref={progressBarRef}
          className="waveform-visual relative overflow-hidden cursor-pointer h-4 bg-muted rounded-full"
          onClick={handleProgressBarClick}
        >
          <div 
            className={cn(
              "absolute top-0 left-0 h-full transition-all duration-300 rounded-full",
              variant === 'vocals' ? "bg-primary/60" : "bg-secondary/60"
            )}
            style={{ width: `${progress}%` }}
          />
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
            className="flex-shrink-0"
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
            className="flex-1"
          >
            <Download className="h-4 w-4" />
            Download {title}
          </Button>
        </div>
      </CardContent>

      <audio ref={audioRef} src={audioUrl} preload="metadata" />
    </Card>
  );
};

const formatTime = (time: number): string => {
  if (isNaN(time)) return '0:00';
  
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};