import { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

interface ProcessingStateProps {
  message?: string;
}

export const ProcessingState = ({ message }: ProcessingStateProps) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setElapsed(s => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <Card className="bg-gradient-subtle border-primary/30">
      <CardContent className="p-12 text-center">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 animate-glow-pulse rounded-full bg-primary/20"></div>
            <div className="relative bg-card-elevated p-6 rounded-full border border-primary/50">
              <BarChart3 className="h-12 w-12 text-primary animate-pulse" />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-2xl font-semibold bg-gradient-primary bg-clip-text text-transparent">
              Splitting Audio...
            </h3>
            <p className="text-muted-foreground max-w-md">
              {message || 'AI is separating vocals from the instrumental track.'}
            </p>
          </div>

          <div className="processing-bars">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="processing-bar"
                style={{ animationDelay: `${i * 0.2}s` }}
              />
            ))}
          </div>

          <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground">
            <span>⏱ Time elapsed: <strong>{formatElapsed(elapsed)}</strong></span>
            <span className="text-xs opacity-70">
              Free CPU tier is slow — this may take 3–6 minutes.
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};