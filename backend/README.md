# MusicSpliter Backend

FastAPI service that runs Demucs to split an uploaded song into vocals and karaoke. In production the app is served from the repository root Dockerfile, which builds the React frontend and serves it from the same container as the API.

## What changed for production

- Uploads are validated and stored with generated names instead of trusting the browser filename.
- Demucs runs off the async request thread so the API does not block the event loop.
- The API exposes `/health` for deployment checks.
- If the frontend build exists at `audio-splice-studio/dist`, the backend serves it from `/`.
- File downloads are served from `/files/...`.
- AdSense support is wired through `audio-splice-studio/index.html` and the `AdSenseSlot` component.

## Local development

Run the backend from the `backend` folder:

```bash
cd backend
uvicorn main:app --reload
```

Run the frontend from the `audio-splice-studio` folder in a second terminal:

```bash
cd audio-splice-studio
npm install
npm run dev
```

For local frontend development, Vite proxies API requests to `http://127.0.0.1:8000`.

## Environment variables

- `DEMUCS_MODEL` - optional Demucs model name, defaults to `htdemucs`
- `CORS_ORIGINS` - optional comma-separated allowlist for development origins
- `ADSENSE_CLIENT_ID` - optional Google AdSense client id used at runtime
- `ADSENSE_SLOT_ID` - optional Google AdSense slot id used at runtime

## Hugging Face Spaces deployment

Use the repository root `Dockerfile`.

1. Push the repo to GitHub.
2. Create a new Hugging Face Space.
3. Choose `Docker` as the Space type.
4. Connect the GitHub repo or import the repo directly.
5. Add `ADSENSE_CLIENT_ID` and `ADSENSE_SLOT_ID` in the Space variables or secrets settings if you want AdSense enabled.
6. Wait for the image build to finish.
7. Open the Space URL and verify `/health` returns `{"status":"ok"}`.

The container listens on port `7860`, which is the default Hugging Face Spaces Docker port.

## API

### `POST /split`
Form-data field:

- `file` - audio file upload

Response:

```json
{
  "vocals": "/files/htdemucs/<job_id>/vocals.wav",
  "karaoke": "/files/htdemucs/<job_id>/no_vocals.wav"
}
```

### `GET /files/...`
Serves generated audio files.

### `GET /health`
Simple health check for deployment platforms.

### `POST /cleanup`
Deletes generated Demucs output files.

## Notes

- The repo root Dockerfile installs `ffmpeg` and `libsndfile1`, which Demucs needs for audio processing.
- If you change the frontend ad settings, rebuild the Space so the Vite HTML template is regenerated.
