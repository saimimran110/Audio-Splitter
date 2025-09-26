# MusicSpliter Backend Documentation

## Overview
This backend is built with FastAPI and provides an API to split an uploaded MP3 file into vocals and karaoke using Demucs. It also serves the output files for download and supports CORS for frontend integration.

---

## Features
- **/split**: Accepts an MP3 file upload, runs Demucs, and returns URLs for vocals and karaoke.
- **Static File Serving**: Serves output files at `/files/...` for direct download.
- **CORS Enabled**: Allows requests from frontend (http://localhost:5173).

---

## Requirements
- Python 3.10+
- FastAPI
- Uvicorn
- Demucs (installed and available in PATH)

Install dependencies:
```bash
pip install fastapi uvicorn
```

---

## How to Run
1. **Start the backend server:**
   ```bash
   uvicorn backend.main:app --reload
   ```
   - Run this command from the project root (`MusicSpliter`), not inside the `backend` folder.
   - The API will be available at: http://127.0.0.1:8000
   - Interactive docs: http://127.0.0.1:8000/docs

2. **Demucs must be installed and available in your system PATH.**
   - [Demucs Installation Guide](https://github.com/facebookresearch/demucs#installation)

---

## API Endpoints
### POST `/split`
- **Description:** Upload an MP3 file to split into vocals and karaoke.
- **Request:**
  - Form-data: `file` (MP3 file)
- **Response:**
  ```json
  {
    "vocals": "/files/htdemucs/<song_name>/vocals.wav",
    "karaoke": "/files/htdemucs/<song_name>/no_vocals.wav"
  }
  ```
- **Example using curl:**
  ```bash
  curl -F "file=@your_song.mp3" http://127.0.0.1:8000/split
  ```

### GET `/files/...`
- **Description:** Download output files (vocals/karaoke) using the URLs returned by `/split`.

---

## Frontend Requirements
- Any frontend (React, Vite, etc.) can call the `/split` endpoint using a POST request with a file upload.
- To download files, use the URLs returned by the API, prefixing with `http://127.0.0.1:8000`.
- Example download URL:
  - `http://127.0.0.1:8000/files/htdemucs/<song_name>/vocals.wav`

---

## Example Frontend Flow
1. User uploads an MP3 file.
2. Frontend sends POST request to `/split`.
3. Backend processes and returns download URLs.
4. Frontend displays download buttons for vocals and karaoke.

---

## Notes
- Make sure Demucs is installed and working.
- Backend must be running for frontend to work.
- CORS is enabled for `http://localhost:5173` (default Vite dev server).

---

## Contact
For any issues, contact the developer or check the Demucs documentation for troubleshooting.
