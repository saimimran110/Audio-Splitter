import { useEffect, useState } from 'react';

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

interface AdSenseSlotProps {
  className?: string;
}

interface AdSenseConfig {
  clientId: string;
  slotId: string;
}

const getFallbackConfig = (): AdSenseConfig => {
  const metaClientId = document.querySelector<HTMLMetaElement>('meta[name="google-adsense-client"]')?.content?.trim() || '';
  return {
    clientId: metaClientId || import.meta.env.VITE_ADSENSE_CLIENT_ID?.trim() || '',
    slotId: import.meta.env.VITE_ADSENSE_SLOT_ID?.trim() || '',
  };
};

export const AdSenseSlot = ({ className }: AdSenseSlotProps) => {
  const [config, setConfig] = useState<AdSenseConfig | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadConfig = async () => {
      try {
        const response = await fetch('/config');
        if (!response.ok) {
          throw new Error('Failed to load AdSense config');
        }

        const remoteConfig = (await response.json()) as Partial<AdSenseConfig>;
        const fallbackConfig = getFallbackConfig();
        const nextConfig = {
          clientId: (remoteConfig.clientId || '').trim() || fallbackConfig.clientId,
          slotId: (remoteConfig.slotId || '').trim() || fallbackConfig.slotId,
        };

        if (isMounted) {
          setConfig(nextConfig);
        }
      } catch {
        if (isMounted) {
          setConfig(getFallbackConfig());
        }
      }
    };

    loadConfig();

    return () => {
      isMounted = false;
    };
  }, []);

  const clientId = config?.clientId || '';
  const slotId = config?.slotId || '';

  useEffect(() => {
    if (!clientId || !slotId) {
      return;
    }

    const pushAds = () => {
      try {
        (window.adsbygoogle = window.adsbygoogle || []).push({});
      } catch {
        // Ignore AdSense runtime issues so the app still works without ads.
      }
    };

    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[data-adsense-client="${clientId}"]`,
    );

    if (existingScript) {
      pushAds();
      return;
    }

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
    script.crossOrigin = 'anonymous';
    script.dataset.adsenseClient = clientId;
    script.onload = pushAds;
    document.head.appendChild(script);
  }, [clientId, slotId]);

  if (!clientId || !slotId) {
    return null;
  }

  return (
    <div className="flex justify-center pt-4">
      <div className="w-full max-w-4xl rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm">
        <div className="mb-2 text-center text-xs uppercase tracking-[0.3em] text-muted-foreground">
          Sponsored
        </div>
        <ins
          className={`adsbygoogle block min-h-[120px] w-full ${className ?? ''}`}
          style={{ display: 'block' }}
          data-ad-client={clientId}
          data-ad-slot={slotId}
          data-ad-format="auto"
          data-full-width-responsive="true"
        />
      </div>
    </div>
  );
};