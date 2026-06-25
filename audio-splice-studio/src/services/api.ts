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

/**
 * Upload audio file, then poll until the job finishes.
 * This avoids the Hugging Face 60-second reverse-proxy timeout
 * because we never hold a single HTTP connection open for the full
 * duration of the Demucs run.
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

  // 2. Poll /jobs/{jobId} every 4 seconds until done or failed
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