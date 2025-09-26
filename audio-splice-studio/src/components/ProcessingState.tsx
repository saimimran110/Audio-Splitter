import { Card, CardContent } from '@/components/ui/card';
import { BarChart3 } from 'lucide-react';

export const ProcessingState = () => {
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
              Our AI is separating the vocals from the instrumental track. This usually takes 30-60 seconds.
            </p>
          </div>

          <div className="processing-bars">
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="processing-bar"
                style={{
                  animationDelay: `${i * 0.2}s`
                }}
              />
            ))}
          </div>
          
          <div className="text-sm text-muted-foreground">
            Please wait while we process your audio...
          </div>
        </div>
      </CardContent>
    </Card>
  );
};