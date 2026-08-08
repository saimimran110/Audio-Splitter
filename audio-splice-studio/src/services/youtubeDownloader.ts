import axios from 'axios';

/**
 * Extracts YouTube Video ID from standard URLs or short links
 */
export function extractVideoId(url: string): string | null {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
}

/**
 * Sanitizes video title to a safe file name
 */
function sanitizeFileName(title: string): string {
  return title.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 60) || 'youtube_audio';
}

const PIPED_INSTANCES = [
  'https://pipedapi.kavin.rocks',
  'https://api.piped.privacydev.net',
  'https://pipedapi.palvelu.org',
  'https://pipedapi.mha.fi',
  'https://piped-api.garudalinux.org',
];

const COBALT_INSTANCES = [
  'https://api.cobalt.tools',
  'https://cobalt-api.kwiatekmember.de',
  'https://co.wuk.sh',
];

const INVIDIOUS_INSTANCES = [
  'https://inv.melmac.space',
  'https://invidious.flokinet.to',
  'https://invidious.projectsegfau.lt',
  'https://yewtu.be',
  'https://invidious.privacydev.net',
];

/**
 * Robust stream fetcher: handles browser CORS by falling back to backend stream proxy
 */
async function fetchAudioBlob(streamUrl: string): Promise<Blob> {
  // 1. Try direct stream fetch
  try {
    const res = await axios.get(streamUrl, { responseType: 'blob', timeout: 20000 });
    if (res.data && res.data.size > 100 * 1024) return res.data;
  } catch (e) {
    console.warn('Direct stream fetch failed (likely browser CORS policy). Trying backend stream proxy...', e);
  }

  // 2. Try FastAPI backend stream proxy (/youtube/stream-proxy?url=...)
  try {
    const proxyUrl = `/youtube/stream-proxy?url=${encodeURIComponent(streamUrl)}`;
    const res = await axios.get(proxyUrl, { responseType: 'blob', timeout: 35000 });
    if (res.data && res.data.size > 100 * 1024) return res.data;
  } catch (e) {
    console.warn('Backend stream proxy failed, trying public CORS proxy...', e);
  }

  // 3. Fallback to public CORS proxy
  try {
    const corsProxyUrl = `https://corsproxy.io/?url=${encodeURIComponent(streamUrl)}`;
    const res = await axios.get(corsProxyUrl, { responseType: 'blob', timeout: 35000 });
    if (res.data && res.data.size > 100 * 1024) return res.data;
  } catch (e) {
    console.warn('Public CORS proxy failed:', e);
  }

  throw new Error('Failed to fetch audio stream bytes');
}

/**
 * Method 1: Fetch audio stream using Piped API (Client Browser IP)
 */
async function fetchViaPiped(videoId: string): Promise<Blob> {
  for (const instance of PIPED_INSTANCES) {
    try {
      const res = await axios.get(`${instance}/streams/${videoId}`, { timeout: 8000 });
      const audioStreams = res.data?.audioStreams;
      if (Array.isArray(audioStreams) && audioStreams.length > 0) {
        audioStreams.sort((a: any, b: any) => (b.bitrate || 0) - (a.bitrate || 0));
        const streamUrl = audioStreams[0].url;
        if (streamUrl) {
          return await fetchAudioBlob(streamUrl);
        }
      }
    } catch (e) {
      console.warn(`Piped instance ${instance} failed:`, e);
    }
  }
  throw new Error('Piped instances failed');
}

/**
 * Method 2: Fetch audio stream using Cobalt API (Client Browser IP)
 */
async function fetchViaCobalt(youtubeUrl: string): Promise<Blob> {
  for (const instance of COBALT_INSTANCES) {
    try {
      const res = await axios.post(
        instance,
        {
          url: youtubeUrl,
          downloadMode: 'audio',
          audioFormat: 'mp3',
        },
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const downloadUrl = res.data?.url || (res.data?.picker && res.data.picker[0]?.url);
      if (downloadUrl) {
        return await fetchAudioBlob(downloadUrl);
      }
    } catch (e) {
      console.warn(`Cobalt instance ${instance} failed:`, e);
    }
  }
  throw new Error('Cobalt instances failed');
}

/**
 * Method 3: Fetch audio stream using Invidious API (Client Browser IP)
 */
async function fetchViaInvidious(videoId: string): Promise<Blob> {
  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      const res = await axios.get(`${instance}/api/v1/videos/${videoId}`, { timeout: 8000 });
      const formats = res.data?.adaptiveFormats || res.data?.formatStreams || [];
      const audioFormats = formats.filter((f: any) => (f.type || '').includes('audio/'));
      if (audioFormats.length > 0) {
        audioFormats.sort((a: any, b: any) => (parseInt(b.bitrate || 0) - parseInt(a.bitrate || 0)));
        let streamUrl = audioFormats[0].url;
        if (streamUrl.startsWith('/')) {
          streamUrl = `${instance}${streamUrl}`;
        }
        if (!streamUrl.includes('local=true')) {
          streamUrl += streamUrl.includes('?') ? '&local=true' : '?local=true';
        }

        return await fetchAudioBlob(streamUrl);
      }
    } catch (e) {
      console.warn(`Invidious instance ${instance} failed:`, e);
    }
  }
  throw new Error('Invidious instances failed');
}

/**
 * Main entry point: Downloads YouTube audio on user's browser (residential IP)
 * and returns a File object ready to be uploaded to FastAPI /split.
 */
export async function downloadYoutubeAudioInBrowser(
  youtubeUrl: string,
  title: string,
  onProgress?: (msg: string) => void
): Promise<File> {
  const videoId = extractVideoId(youtubeUrl);
  let audioBlob: Blob | null = null;

  // 1. Try Piped API
  if (videoId) {
    try {
      onProgress?.('Downloading audio stream via client browser...');
      audioBlob = await fetchViaPiped(videoId);
    } catch (e) {
      console.warn('Client Piped download failed, trying Cobalt...', e);
    }
  }

  // 2. Try Cobalt API
  if (!audioBlob) {
    try {
      onProgress?.('Downloading audio stream via client browser (proxy 2)...');
      audioBlob = await fetchViaCobalt(youtubeUrl);
    } catch (e) {
      console.warn('Client Cobalt download failed, trying Invidious...', e);
    }
  }

  // 3. Try Invidious API
  if (!audioBlob && videoId) {
    try {
      onProgress?.('Downloading audio stream via client browser (proxy 3)...');
      audioBlob = await fetchViaInvidious(videoId);
    } catch (e) {
      console.warn('Client Invidious download failed.', e);
    }
  }

  if (!audioBlob) {
    throw new Error('Could not download YouTube audio in browser. All client-side proxy sources were unreachable.');
  }

  const safeName = `${sanitizeFileName(title)}.mp3`;
  return new File([audioBlob], safeName, { type: 'audio/mp3' });
}
