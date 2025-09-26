import { useState } from 'react';
import { AudioUpload } from '@/components/AudioUpload';
import { ProcessingState } from '@/components/ProcessingState';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Mic, Music2, Sparkles, AlertCircle, Instagram } from 'lucide-react';
import { splitAudio, getAudioUrl, SplitResult } from '@/services/api';

const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<SplitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setError(null);
    
    try {
      const splitResult = await splitAudio(file);
      setResult(splitResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process audio file');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/50 bg-gradient-subtle">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-primary rounded-lg">
                <Sparkles className="h-6 w-6 text-primary-foreground" />
              </div>
              <h1 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
                AI Audio Splitter
              </h1>
            </div>
            
            <div className="flex items-center gap-4">
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

      {/* Main Content */}
      <main className="container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-12">
          {/* Hero Section */}
          <div className="text-center space-y-6">
            <h2 className="text-4xl md:text-5xl font-bold leading-tight">
              Split Any Song Into{' '}
              <span className="bg-gradient-primary bg-clip-text text-transparent">
                Vocals & Instrumentals
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Upload your favorite track and let our AI separate the vocals from the music. 
              Perfect for karaoke, remixing, or music production.
            </p>
          </div>

          {/* Upload or Processing */}
          {!selectedFile && !result && !error && (
            <AudioUpload onFileUpload={handleFileUpload} isProcessing={isProcessing} />
          )}

          {/* Error Display */}
          {error && (
            <Alert className="border-destructive bg-destructive/10">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-destructive font-medium">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {isProcessing && <ProcessingState />}

          {/* Results */}
          {result && !isProcessing && (
            <div className="space-y-8">
              <div className="text-center">
                <h3 className="text-2xl font-semibold mb-2">Split Complete!</h3>
                <p className="text-muted-foreground">
                  Your audio has been successfully separated. You can now play and download both tracks.
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
                  onClick={() => {
                    setSelectedFile(null);
                    setResult(null);
                    setError(null);
                  }}
                  className="text-primary hover:text-primary-glow transition-colors underline underline-offset-4"
                >
                  Split Another Song
                </button>
              </div>
            </div>
          )}

          {/* Features */}
          <div className="grid md:grid-cols-3 gap-6 mt-16">
            <Card className="bg-gradient-subtle border-primary/20 hover:border-primary/40 transition-colors">
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

            <Card className="bg-gradient-subtle border-secondary/20 hover:border-secondary/40 transition-colors">
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

            <Card className="bg-gradient-subtle border-accent/20 hover:border-accent/40 transition-colors">
              <CardContent className="p-6 text-center">
                <div className="bg-accent/20 p-3 rounded-lg w-fit mx-auto mb-4">
                  <Mic className="h-6 w-6 text-accent" />
                </div>
                <h4 className="font-semibold mb-2">Fast Processing</h4>
                <p className="text-sm text-muted-foreground">
                  Get your separated tracks in under a minute
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 bg-gradient-subtle mt-16">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center text-muted-foreground">
            <p>&copy; 2024 AI Audio Splitter. Built with ❤️ for music lovers.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;