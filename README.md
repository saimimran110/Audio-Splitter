---
title: "MusicSplitter"
emoji: "🎵"
sdk: docker
sdk_version: "0.0.1"
pinned: false
---

# MusicSplitter

A small web app to split audio into stems using Demucs. This Space uses a Dockerfile at the repository root to run the backend (FastAPI) and frontend (Vite).

## Notes for Hugging Face Spaces
- This Space uses `sdk: docker` and the `Dockerfile` in the repository root to build and run the app.
- Set the following environment variables in the Space Settings if you want Ads or to override defaults:
  - `ADSENSE_CLIENT_ID` (e.g. `ca-pub-XXXXXXXXXXXX`)
  - `ADSENSE_SLOT_ID` (numeric slot id)
  - Optional: `DEMUCS_MODEL` (default: `htdemucs`)

After pushing, open the Space App page and watch the logs while the build runs. Test the API endpoints once the build completes:

```
GET /health
POST /split (multipart form file)
```

If you want me to add a longer README or a `LICENSE`, tell me which license to use.
