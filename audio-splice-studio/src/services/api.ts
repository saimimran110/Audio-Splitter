import axios from 'axios';

const apiClient = axios.create({
  timeout: 30000, // 30s per individual request (upload + each poll)
});

export interface SplitResult {
  vocals: string;
  karaoke: string;
}

export interface JobStatus {
  jobId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  message?: string;
  vocals?: string;
  karaoke?: string;
}

export interface YouTubeResult {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
}

/**
 * Poll /jobs/{jobId} every 4 seconds until done or failed.
 */
export const pollJob = async (
  jobId: string,
  onProgress?: (message: string) => void,
): Promise<SplitResult> => {
  const POLL_INTERVAL_MS = 4000;
  const MAX_WAIT_MS = 15 * 60 * 1000; // 15 minutes absolute ceiling
  const started = Date.now();

  while (Date.now() - started < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);

    let job: JobStatus;
    try {
      const res = await apiClient.get<JobStatus>(`/jobs/${jobId}`);
      job = res.data;
    } catch (err) {
      // Network blip — keep polling
      onProgress?.('Checking status...');
      continue;
    }

    onProgress?.(job.message || `Status: ${job.status}`);

    if (job.status === 'completed') {
      if (!job.vocals || !job.karaoke) throw new Error('Job completed but URLs are missing');
      return { vocals: job.vocals, karaoke: job.karaoke };
    }

    if (job.status === 'failed') {
      throw new Error(job.message || 'Processing failed on the server');
    }

    // still queued / processing — keep polling
  }

  throw new Error('Timed out waiting for processing to complete (15 min limit)');
};

/**
 * Upload audio file, then poll until the job finishes.
 */
export const splitAudio = async (
  file: File,
  onProgress?: (message: string) => void,
): Promise<SplitResult> => {
  // 1. Upload and get a job ID immediately
  const formData = new FormData();
  formData.append('file', file);

  let jobId: string;
  try {
    const res = await apiClient.post<{ jobId: string }>('/split', formData);
    jobId = res.data.jobId;
    onProgress?.('Job started — AI separation in progress...');
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(err.response?.data?.detail || `Upload failed: ${err.message}`);
    }
    throw new Error('Upload failed: unexpected error');
  }

  // 2. Poll job until completion
  return pollJob(jobId, onProgress);
};

/**
 * Search YouTube via backend.
 */
export const searchYouTube = async (query: string): Promise<YouTubeResult[]> => {
  try {
    const res = await apiClient.get<YouTubeResult[]>('/youtube/search', { params: { query } });
    return res.data;
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(err.response?.data?.detail || `Search failed: ${err.message}`);
    }
    throw new Error('Search failed: unexpected error');
  }
};

/**
 * Split audio from YouTube video ID directly.
 */
export const splitYouTubeAudio = async (
  videoId: string,
  onProgress?: (message: string) => void,
): Promise<SplitResult> => {
  let jobId: string;
  try {
    const res = await apiClient.post<{ jobId: string }>('/youtube/split', { videoId });
    jobId = res.data.jobId;
    onProgress?.('Job queued — downloading YouTube audio...');
  } catch (err) {
    if (axios.isAxiosError(err)) {
      throw new Error(err.response?.data?.detail || `YouTube split request failed: ${err.message}`);
    }
    throw new Error('YouTube split request failed: unexpected error');
  }

  // Poll job until completion
  return pollJob(jobId, onProgress);
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const getAudioUrl = (relativePath: string): string => relativePath;

export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    await apiClient.get('/health');
    return true;
  } catch {
    return false;
  }
};