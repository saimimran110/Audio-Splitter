
import os
# Set thread limits BEFORE importing torch/demucs
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["TORCH_HOME"] = "/app/.cache/torch"
os.environ["HF_HOME"] = "/app/.cache/hub"

import atexit
import asyncio
import logging
import shutil
import subprocess
import sys
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# ── Logging ────────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)

# ── App setup ──────────────────────────────────────────────────────────────────
app = FastAPI()
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_FOLDER = PROJECT_ROOT / "demucs_output"
FRONTEND_DIST = PROJECT_ROOT / "audio-splice-studio" / "dist"
# Default model detection with local fallback
default_model = "mdx_extra"
try:
    import diffq
    default_model = "mdx_extra_q"
except ImportError:
    pass

MODEL = os.getenv("DEMUCS_MODEL", default_model)
ADSENSE_CLIENT_ID = os.getenv("ADSENSE_CLIENT_ID", "").strip()
ADSENSE_SLOT_ID = os.getenv("ADSENSE_SLOT_ID", "").strip()

# In-memory job store  {job_id: {...}}
JOB_STATUS: dict[str, dict[str, Any]] = {}

allowed_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:8080,http://localhost:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)


# ── Cleanup ────────────────────────────────────────────────────────────────────
def cleanup_files():
    try:
        if OUTPUT_FOLDER.exists():
            shutil.rmtree(OUTPUT_FOLDER)
            OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)
        JOB_STATUS.clear()
        log.info("Cleaned up all generated audio files")
    except Exception as exc:
        log.error("Error during cleanup: %s", exc)


atexit.register(cleanup_files)
app.mount("/files", StaticFiles(directory=str(OUTPUT_FOLDER)), name="files")


# ── Helpers ────────────────────────────────────────────────────────────────────
def resample_audio(input_path: Path, output_path: Path) -> None:
    """Resample input audio to 44100Hz stereo WAV using ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-ac", "2",
        "-ar", "44100",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    log.info("Resampled %s → %s (44100Hz stereo WAV)", input_path.name, output_path.name)


def convert_wav_to_mp3(wav_path: Path, mp3_path: Path, bitrate: str = "192k") -> None:
    """Convert WAV → MP3 using ffmpeg (already in container)."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(wav_path),
        "-codec:a", "libmp3lame",
        "-b:a", bitrate,
        "-ac", "2",
        str(mp3_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    wav_path.unlink()
    log.info("Converted %s → %s", wav_path.name, mp3_path.name)


def run_demucs(input_path: Path, job_id: str) -> None:
    """Run Demucs with explicit output directory named by job_id."""
    cmd = [
        sys.executable, "-m", "demucs.separate",
        str(input_path),
        "-o", str(OUTPUT_FOLDER),
        "-n", MODEL,
        "--two-stems=vocals",
        "--segment", "30",
        "-j", "1",
    ]
    log.info("[job:%s] Running demucs: %s", job_id, " ".join(cmd))
    t0 = time.time()
    result = subprocess.run(cmd, check=True, capture_output=True, text=True)
    elapsed = time.time() - t0
    log.info("[job:%s] Demucs finished in %.1fs", job_id, elapsed)
    if result.stdout:
        log.debug("[job:%s] stdout: %s", job_id, result.stdout[:500])
    if result.stderr:
        log.debug("[job:%s] stderr: %s", job_id, result.stderr[:500])


async def process_job(job_id: str, input_path: Path) -> None:
    """Background task: resample → run demucs → convert to mp3 → update job status."""
    try:
        log.info("[job:%s] Starting background processing", job_id)
        if job_id not in JOB_STATUS:
            JOB_STATUS[job_id] = {"createdAt": time.time()}
        JOB_STATUS[job_id]["status"] = "processing"
        JOB_STATUS[job_id]["message"] = "Preparing audio file (resampling to 44.1kHz stereo)..."

        # 1. Resample to standard 44.1kHz Stereo WAV
        resampled_path = input_path.parent / f"{job_id}_resampled.wav"
        await asyncio.to_thread(resample_audio, input_path, resampled_path)

        # 2. Delete original upload to save space
        if input_path.exists():
            input_path.unlink()

        # 3. Rename resampled WAV to job_id.wav to keep output folder names consistent
        final_wav_path = input_path.parent / f"{job_id}.wav"
        resampled_path.rename(final_wav_path)
        input_path = final_wav_path

        JOB_STATUS[job_id]["message"] = f"Running AI separation using {MODEL} (takes ~1.5 min)..."
        await asyncio.to_thread(run_demucs, input_path, job_id)

        # Convert WAVs to MP3
        output_dir = OUTPUT_FOLDER / MODEL / job_id
        JOB_STATUS[job_id]["message"] = "Converting to MP3..."
        log.info("[job:%s] Converting WAV → MP3", job_id)

        for stem in ("vocals", "no_vocals"):
            wav = output_dir / f"{stem}.wav"
            mp3 = output_dir / f"{stem}.mp3"
            if wav.exists():
                await asyncio.to_thread(convert_wav_to_mp3, wav, mp3)

        vocals_mp3 = output_dir / "vocals.mp3"
        karaoke_mp3 = output_dir / "no_vocals.mp3"

        if not vocals_mp3.exists() or not karaoke_mp3.exists():
            raise RuntimeError("MP3 output files missing after conversion")

        min_size = 10 * 1024  # 10 KB minimum — empty files mean Demucs failed silently
        for mp3 in (vocals_mp3, karaoke_mp3):
            if mp3.stat().st_size < min_size:
                raise RuntimeError(f"Output file {mp3.name} is too small ({mp3.stat().st_size} bytes) — processing may have failed silently")

        JOB_STATUS[job_id].update({
            "status": "completed",
            "message": "Done!",
            "vocals": f"/files/{MODEL}/{job_id}/vocals.mp3",
            "karaoke": f"/files/{MODEL}/{job_id}/no_vocals.mp3",
            "finishedAt": time.time(),
        })
        log.info("[job:%s] Job completed successfully", job_id)

    except Exception as exc:
        log.error("[job:%s] Job failed: %s", job_id, exc, exc_info=True)
        if job_id not in JOB_STATUS:
            JOB_STATUS[job_id] = {"createdAt": time.time()}
        JOB_STATUS[job_id].update({
            "status": "failed",
            "message": str(exc),
            "finishedAt": time.time(),
        })
    finally:
        if input_path.exists():
            input_path.unlink()


# ── Endpoints ──────────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    return {"status": "ok", "activeJobs": len([j for j in JOB_STATUS.values() if j.get("status") == "processing"])}


@app.get("/config")
async def app_config():
    return {"adsenseClientId": ADSENSE_CLIENT_ID, "adsenseSlotId": ADSENSE_SLOT_ID}


@app.post("/split")
async def split_song(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".webm", ".wma"}:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    job_id = uuid.uuid4().hex
    input_path = PROJECT_ROOT / f"{job_id}{suffix}"

    # Save uploaded file (max 20 MB)
    max_size = 20 * 1024 * 1024
    size = 0
    with input_path.open("wb") as buf:
        for chunk in iter(lambda: file.file.read(1024 * 1024), b""):
            size += len(chunk)
            if size > max_size:
                buf.close()
                input_path.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="File too large (max 20 MB)")
            buf.write(chunk)

    log.info("[job:%s] Received %.2f MB file (%s)", job_id, size / 1024 / 1024, suffix)

    JOB_STATUS[job_id] = {
        "status": "queued",
        "message": "Job queued, starting soon...",
        "createdAt": time.time(),
    }

    # Fire and forget — do NOT await
    asyncio.create_task(process_job(job_id, input_path))

    return {"jobId": job_id, "status": "queued"}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = JOB_STATUS.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"jobId": job_id, **job}


@app.post("/cleanup")
async def manual_cleanup():
    cleanup_files()
    return {"message": "Cleanup completed"}


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")