import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, Lock, Eye, FileText, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background relative text-foreground font-sans py-12 px-4">
      {/* Background radial glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div 
          className="absolute w-[500px] h-[500px] rounded-full"
          style={{
            top: '-10%',
            left: '-10%',
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.08) 0%, transparent 70%)',
          }}
        />
        <div 
          className="absolute w-[600px] h-[600px] rounded-full"
          style={{
            bottom: '-20%',
            right: '-10%',
            background: 'radial-gradient(circle, rgba(6, 182, 212, 0.06) 0%, transparent 70%)',
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
          <div className="bg-primary/10 p-3 rounded-full w-fit mx-auto mb-4 border border-primary/20">
            <Shield className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-3 bg-gradient-to-r from-primary via-primary-glow to-secondary bg-clip-text text-transparent">
            Privacy Policy
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Last Updated: July 6, 2026
          </p>
        </div>

        {/* Content Cards */}
        <div className="space-y-6">
          {/* Section 1: Information We Collect */}
          <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-xl">
            <CardContent className="p-6 md:p-8 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/20 p-2 rounded-lg text-primary">
                  <Eye className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold">1. Information We Collect</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm">
                We believe in user privacy. Our AI Music Splitter operates on a queue-based background processing system. We do not require you to register an account or provide personal identifiers to use the service.
              </p>
              <ul className="list-disc list-inside text-sm text-muted-foreground space-y-2 pl-2">
                <li><strong>Audio Processing</strong>: Audio submitted for processing (whether uploaded directly or supplied via a link) is temporarily handled server-side to generate separated stems.</li>
                <li><strong>Automatic Cleanup</strong>: All generated stems are automatically deleted upon job completion or server restart. No persistent archive of your audio is retained.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Section 2: Google AdSense & Cookie Notice */}
          <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-xl">
            <CardContent className="p-6 md:p-8 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-secondary/20 p-2 rounded-lg text-secondary">
                  <Lock className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold">2. Google AdSense & Cookie Notice</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm">
                To help maintain our free servers, we use Google AdSense to display advertisements. AdSense may use third-party cookies to serve ads based on your visits to this and other websites.
              </p>
              <div className="bg-secondary/5 border border-secondary/20 rounded-xl p-4 text-xs text-muted-foreground leading-relaxed space-y-2">
                <p><strong>What are cookies?</strong> Small text files placed in your browser to collect anonymous traffic statistics and manage sessions.</p>
                <p><strong>Personalized Ads</strong>: Google and its partners may use advertising cookies to serve ads based on your visits to this site and other sites on the internet.</p>
                <p><strong>Opting Out</strong>: You may opt out of personalized advertising via Google's Ads Settings, or by disabling cookies in your browser.</p>
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Third-Party Content */}
          <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-xl">
            <CardContent className="p-6 md:p-8 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-primary/20 p-2 rounded-lg text-primary">
                  <FileText className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold">3. Third-Party Content</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm">
                Where the service processes audio sourced from third-party platforms, use of this feature is subject to that platform's applicable Terms of Service. We do not fetch, store, or cache any user profile or account data from third-party platforms.
              </p>
            </CardContent>
          </Card>

          {/* Section 4: Contact */}
          <Card className="bg-card/40 backdrop-blur-md border-border/60 shadow-xl">
            <CardContent className="p-6 md:p-8 space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="bg-secondary/20 p-2 rounded-lg text-secondary">
                  <Mail className="h-5 w-5" />
                </div>
                <h2 className="text-xl font-semibold">4. Contact</h2>
              </div>
              <p className="text-muted-foreground leading-relaxed text-sm">
                For privacy-related questions or data requests, contact us at <a href="https://mail.google.com/mail/?view=cm&fs=1&to=cym786@gmail.com" target="_blank" rel="noopener noreferrer" className="text-secondary underline hover:text-secondary-glow">cym786@gmail.com</a>.
              </p>
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

export default PrivacyPolicy;
