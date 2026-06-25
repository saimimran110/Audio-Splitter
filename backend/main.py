
import os
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"
os.environ["OPENBLAS_NUM_THREADS"] = "1"
os.environ["NUMEXPR_NUM_THREADS"] = "1"
os.environ["VECLIB_MAXIMUM_THREADS"] = "1"
os.environ["TORCH_HOME"] = "/app/.cache"

import atexit
import asyncio
import shutil
import subprocess
import sys
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


app = FastAPI()
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_FOLDER = PROJECT_ROOT / "demucs_output"
FRONTEND_DIST = PROJECT_ROOT / "audio-splice-studio" / "dist"
MODEL = os.getenv("DEMUCS_MODEL", "htdemucs")
ADSENSE_CLIENT_ID = os.getenv("ADSENSE_CLIENT_ID", "").strip()
ADSENSE_SLOT_ID = os.getenv("ADSENSE_SLOT_ID", "").strip()

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


def cleanup_files():
    try:
        if OUTPUT_FOLDER.exists():
            shutil.rmtree(OUTPUT_FOLDER)
            OUTPUT_FOLDER.mkdir(parents=True, exist_ok=True)
            print("Cleaned up all generated audio files")
    except Exception as e:
        print(f"Error during cleanup: {e}")


atexit.register(cleanup_files)

app.mount("/files", StaticFiles(directory=str(OUTPUT_FOLDER)), name="files")


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/config")
async def app_config():
    return {
        "adsenseClientId": ADSENSE_CLIENT_ID,
        "adsenseSlotId": ADSENSE_SLOT_ID,
    }


def convert_wav_to_mp3(wav_path: Path, mp3_path: Path, bitrate: str = "192k") -> None:
    """Convert a WAV file to MP3 using ffmpeg (already installed in container)."""
    command = [
        "ffmpeg",
        "-y",                    # overwrite output without asking
        "-i", str(wav_path),
        "-codec:a", "libmp3lame",
        "-b:a", bitrate,
        "-ac", "2",              # stereo
        str(mp3_path),
    ]
    subprocess.run(command, check=True, capture_output=True)
    wav_path.unlink()            # delete large WAV after conversion


def run_demucs(input_path: Path) -> subprocess.CompletedProcess:
    command = [
        sys.executable,
        "-m",
        "demucs.separate",
        str(input_path),
        "-o",
        str(OUTPUT_FOLDER),
        "-n",
        MODEL,
        "--two-stems=vocals",
        "-j",
        "1",
    ]
    return subprocess.run(command, check=True, capture_output=True, text=True)


def run_demucs_and_convert(input_path: Path, job_id: str) -> None:
    """Run Demucs then convert output WAVs to MP3."""
    run_demucs(input_path)

    output_dir = OUTPUT_FOLDER / MODEL / job_id
    for stem in ("vocals", "no_vocals"):
        wav_file = output_dir / f"{stem}.wav"
        mp3_file = output_dir / f"{stem}.mp3"
        if wav_file.exists():
            convert_wav_to_mp3(wav_file, mp3_file)


@app.post("/split")
async def split_song(file: UploadFile = File(...)):
    if not file.filename:
        raise HTTPException(status_code=400, detail="File name is required")

    original_name = Path(file.filename).name
    suffix = Path(original_name).suffix.lower()
    if suffix not in {".mp3", ".wav", ".m4a", ".flac", ".aac", ".ogg", ".webm", ".wma"}:
        raise HTTPException(status_code=400, detail="Unsupported audio format")

    job_id = uuid.uuid4().hex
    input_path = PROJECT_ROOT / f"{job_id}{suffix}"
    input_path.parent.mkdir(parents=True, exist_ok=True)

    max_size = 20 * 1024 * 1024  # 20MB limit
    size = 0
    with input_path.open("wb") as buffer:
        for chunk in iter(lambda: file.file.read(1024 * 1024), b""):
            size += len(chunk)
            if size > max_size:
                buffer.close()
                input_path.unlink()
                raise HTTPException(status_code=413, detail="File is too large. Maximum size is 20MB.")
            buffer.write(chunk)

    try:
        await asyncio.to_thread(run_demucs_and_convert, input_path, job_id)
    except subprocess.CalledProcessError as e:
        error_output = (e.stderr or e.stdout or str(e)).strip()
        raise HTTPException(status_code=500, detail=f"Processing failed: {error_output}") from e
    finally:
        if input_path.exists():
            input_path.unlink()

    output_dir = OUTPUT_FOLDER / MODEL / job_id
    vocals_file = output_dir / "vocals.mp3"
    karaoke_file = output_dir / "no_vocals.mp3"

    if not vocals_file.exists() or not karaoke_file.exists():
        raise HTTPException(status_code=500, detail="Expected output MP3 files were not created")

    return {
        "vocals": f"/files/{MODEL}/{job_id}/vocals.mp3",
        "karaoke": f"/files/{MODEL}/{job_id}/no_vocals.mp3",
    }


@app.post("/cleanup")
async def manual_cleanup():
    cleanup_files()
    return {"message": "Cleanup completed"}


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")