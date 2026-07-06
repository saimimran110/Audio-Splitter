import { Link } from 'react-router-dom';
import { ArrowLeft, Info, Mail, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const AboutContact = () => {
  return (
    <div className="min-h-screen bg-background relative text-foreground font-sans py-12 px-4">
      {/* Background radial glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div 
          className="absolute w-[500px] h-[500px] rounded-full"
          style={{
            top: '-10%',
            right: '-10%',
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.08) 0%, transparent 70%)',
          }}
        />
        <div 
          className="absolute w-[600px] h-[600px] rounded-full"
          style={{
            bottom: '-20%',
            left: '-10%',
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.06) 0%, transparent 70%)',
          }}
        />
      </div>

      <div className="container mx-auto max-w-4xl relative z-10">
        {/* Back Link */}
        <div className="mb-8">
          <Link 
            to="/" 
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </div>

        {/* Header */}
        <div className="text-center mb-12">
          <div className="bg-secondary/10 p-3 rounded-full w-fit mx-auto mb-4 border border-secondary/20">
            <Info className="h-8 w-8 text-secondary animate-pulse" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3 bg-gradient-to-r from-secondary via-primary-glow to-primary bg-clip-text text-transparent">
            About & Contact
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Learn more about the AI Music Splitter platform and how to get in touch with us.
          </p>
        </div>

        {/* Content Cards */}
        <div className="space-y-6">
          {/* Section 1: About the Project */}
          <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-xl animate-fade-in">
            <CardContent className="p-6 md:p-8 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/20 p-2 rounded-lg text-primary">
                  <Sparkles className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold">About the Platform</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm">
                AI Music Splitter is a vocal remover and stem separation tool built for musicians, DJs, and karaoke enthusiasts. Using advanced AI, the platform splits any uploaded song into two isolated tracks: Vocals Only (acapella) and Instrumental (backing track).
              </p>
              <p className="text-muted-foreground leading-relaxed text-sm">
                Our system performs the complex audio source separation server-side. We process your audio asynchronously, convert the resulting waveforms into web-optimized, seekable MP3 tracks, and stream them dynamically for instant playback.
              </p>
            </CardContent>
          </Card>

          {/* Section 2: Contact Details */}
          <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-xl">
            <CardContent className="p-6 md:p-8 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-secondary/20 p-2 rounded-lg text-secondary">
                  <Mail className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold">Contact & Inquiries</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm">
                Have questions, feature requests, business proposals, or copyright inquiries (DMCA)? You can reach the project administrator directly via email. We aim to respond to all inquiries within 48 hours.
              </p>
              
              <div className="pt-2">
                <a 
                  href="https://mail.google.com/mail/?view=cm&fs=1&to=cym786@gmail.com" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-primary/20 text-primary border border-primary/30 px-5 py-3 rounded-xl hover:bg-primary/30 transition-all duration-200 text-sm font-semibold btn-press"
                >
                  <Mail className="h-4 w-4" />
                  cym786@gmail.com
                </a>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Footer info */}
        <div className="text-center mt-12 text-xs text-muted-foreground">
          <p>&copy; 2026 AI Music Splitter. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default AboutContact;
