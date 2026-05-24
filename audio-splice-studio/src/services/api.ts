import axios from 'axios';

// Create axios instance with default config
const apiClient = axios.create({
  timeout: 300000, // 5 minutes timeout for audio processing
});

export interface SplitResult {
  vocals: string;
  karaoke: string;
}

export interface ApiError {
  message: string;
  status: number;
}

/**
 * Upload audio file to backend for splitting
 * @param file - Audio file to be processed
 * @returns Promise with URLs for vocals and karaoke tracks
 */
export const splitAudio = async (file: File): Promise<SplitResult> => {
  try {
    const formData = new FormData();
    formData.append('file', file);

    const response = await apiClient.post('/split', formData);

    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      throw new Error(
        error.response?.data?.error || 
        `API Error: ${error.response?.status || 'Network Error'}`
      );
    }
    throw new Error('An unexpected error occurred');
  }
};

/**
 * Get full URL for downloading or playing audio files
 * @param relativePath - Relative path from the API response
 * @returns Full URL for the audio file
 */
export const getAudioUrl = (relativePath: string): string => {
  return relativePath;
};

/**
 * Check if the backend is available
 * @returns Promise resolving to true if backend is reachable
 */
export const checkBackendHealth = async (): Promise<boolean> => {
  try {
    await apiClient.get('/health');
    return true;
  } catch {
    return false;
  }
};