import os
# Set thread limits depending on environment BEFORE importing torch/demucs
if os.path.exists("/app"):
    # Hugging Face Free CPU has exactly 2 vCPUs.
    # Setting to 2 threads utilizes both cores for maximum production speed.
    os.environ["OMP_NUM_THREADS"] = "2"
    os.environ["MKL_NUM_THREADS"] = "2"
    os.environ["OPENBLAS_NUM_THREADS"] = "2"
    os.environ["NUMEXPR_NUM_THREADS"] = "2"
    os.environ["VECLIB_MAXIMUM_THREADS"] = "2"
else:
    # Local Windows: Let PyTorch use all available CPU cores/threads for max speed
    pass

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

import re
from fastapi import FastAPI, File, HTTPException, UploadFile, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
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
MODEL = os.getenv("DEMUCS_MODEL", "htdemucs")
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


from starlette.exceptions import HTTPException as StarletteHTTPException

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    # Sanitize YouTube API or proxy error messages if any leak in the detail
    detail = exc.detail
    if "YouTube API error" in str(detail) or "Cobalt" in str(detail) or "Invidious" in str(detail):
        detail = "Failed to search YouTube. Please check the URL or try a different song."
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail},
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled exception: %s", exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again later."},
    )


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


def get_range_response(file_path: Path, request: Request) -> Response:
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
        
    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")
    
    # Check for Range header
    if not range_header:
        # Standard full response
        def file_iterator():
            with open(file_path, "rb") as f:
                yield from f
        return StreamingResponse(
            file_iterator(),
            headers={"Accept-Ranges": "bytes"},
            media_type="audio/mpeg"
        )
        
    # Parse range header (e.g. bytes=0-1000)
    match = re.match(r"bytes=(\d+)-(\d+)?", range_header)
    if not match:
        raise HTTPException(status_code=400, detail="Invalid Range Header")
        
    start = int(match.group(1))
    end = match.group(2)
    end = int(end) if end else file_size - 1
    
    if start >= file_size or end >= file_size or start > end:
        raise HTTPException(
            status_code=416,
            detail="Requested range not satisfiable",
            headers={"Content-Range": f"bytes */{file_size}"}
        )
        
    chunk_size = end - start + 1
    
    def file_chunk_iterator():
        with open(file_path, "rb") as f:
            f.seek(start)
            bytes_read = 0
            while bytes_read < chunk_size:
                to_read = min(1024 * 64, chunk_size - bytes_read)
                data = f.read(to_read)
                if not data:
                    break
                yield data
                bytes_read += len(data)
                
    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_size),
    }
    
    return StreamingResponse(
        file_chunk_iterator(),
        status_code=206,
        headers=headers,
        media_type="audio/mpeg"
    )


atexit.register(cleanup_files)


@app.get("/files/{model_name}/{job_id}/{filename}")
async def get_audio_file(model_name: str, job_id: str, filename: str, request: Request):
    file_path = OUTPUT_FOLDER / model_name / job_id / filename
    return get_range_response(file_path, request)


# ── Helpers ────────────────────────────────────────────────────────────────────
ACTIVE_PROCESSES: dict[str, subprocess.Popen] = {}

def run_subprocess_killable(cmd: list[str], job_id: str) -> subprocess.CompletedProcess:
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    ACTIVE_PROCESSES[job_id] = proc
    try:
        stdout, stderr = proc.communicate()
        retcode = proc.poll()
        if retcode:
            raise subprocess.CalledProcessError(retcode, cmd, output=stdout, stderr=stderr)
        return subprocess.CompletedProcess(cmd, retcode, stdout, stderr)
    finally:
        ACTIVE_PROCESSES.pop(job_id, None)


def resample_audio(input_path: Path, output_path: Path, job_id: str) -> None:
    """Resample input audio to 44100Hz stereo WAV using ffmpeg."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(input_path),
        "-ac", "2",
        "-ar", "44100",
        str(output_path),
    ]
    run_subprocess_killable(cmd, job_id)
    log.info("Resampled %s → %s (44100Hz stereo WAV)", input_path.name, output_path.name)


def convert_wav_to_mp3(wav_path: Path, mp3_path: Path, job_id: str, bitrate: str = "192k") -> None:
    """Convert WAV → MP3 using ffmpeg (already in container)."""
    cmd = [
        "ffmpeg", "-y",
        "-i", str(wav_path),
        "-codec:a", "libmp3lame",
        "-b:a", bitrate,
        "-ac", "2",
        str(mp3_path),
    ]
    run_subprocess_killable(cmd, job_id)
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
        "-j", "1",
    ]
    log.info("[job:%s] Running demucs: %s", job_id, " ".join(cmd))
    t0 = time.time()
    try:
        result = run_subprocess_killable(cmd, job_id)
        elapsed = time.time() - t0
        log.info("[job:%s] Demucs finished in %.1fs", job_id, elapsed)
        if result.stdout:
            log.debug("[job:%s] stdout: %s", job_id, result.stdout[:500])
        if result.stderr:
            log.debug("[job:%s] stderr: %s", job_id, result.stderr[:500])
    except subprocess.CalledProcessError as exc:
        err_msg = exc.stderr or exc.stdout or "No stderr output"
        log.error("[job:%s] Demucs failed: %s", job_id, err_msg)
        raise RuntimeError(f"Demucs failed: {err_msg.strip()}")


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
        await asyncio.to_thread(resample_audio, input_path, resampled_path, job_id)

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
                await asyncio.to_thread(convert_wav_to_mp3, wav, mp3, job_id)

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
            "message": "We encountered an error while separating the vocals from this audio file. Please try another file.",
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


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    log.info("[job:%s] Cancel requested", job_id)
    proc = ACTIVE_PROCESSES.get(job_id)
    if proc:
        try:
            proc.kill()
            log.info("[job:%s] Killed running subprocess", job_id)
        except Exception as e:
            log.warning("[job:%s] Failed to kill subprocess: %s", job_id, e)
    
    if job_id in JOB_STATUS:
        JOB_STATUS[job_id].update({
            "status": "failed",
            "message": "Job was cancelled by user.",
            "finishedAt": time.time()
        })
    return {"status": "cancelled"}


@app.post("/cleanup")
async def manual_cleanup():
    cleanup_files()
    return {"message": "Cleanup completed"}
# ── YouTube Feature ────────────────────────────────────────────────────────────
import httpx

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "AIzaSyDpSx9c1thanBoyHW8CCex1E5ai2Mmy7yg")
YOUTUBE_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
YOUTUBE_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"


@app.get("/youtube/search")
async def youtube_search(q: str, maxResults: int = 8):
    """Search YouTube for songs and return results with thumbnails and metadata."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="Query is required")

    params = {
        "part": "snippet",
        "q": q,
        "type": "video",
        "videoCategoryId": "10",  # Music category
        "maxResults": maxResults,
        "key": YOUTUBE_API_KEY,
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(YOUTUBE_SEARCH_URL, params=params)
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Failed to search YouTube. Please try again later.")
        data = resp.json()

    # Also fetch video durations
    video_ids = [item["id"]["videoId"] for item in data.get("items", []) if item.get("id", {}).get("videoId")]
    durations = {}
    if video_ids:
        vid_params = {
            "part": "contentDetails",
            "id": ",".join(video_ids),
            "key": YOUTUBE_API_KEY,
        }
        async with httpx.AsyncClient(timeout=10.0) as client:
            vresp = await client.get(YOUTUBE_VIDEOS_URL, params=vid_params)
            if vresp.status_code == 200:
                vdata = vresp.json()
                for item in vdata.get("items", []):
                    vid_id = item["id"]
                    duration_iso = item["contentDetails"]["duration"]
                    # Parse ISO 8601 duration e.g. PT3M45S
                    import re as _re
                    m = _re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", duration_iso)
                    if m:
                        h, mi, s = (int(x or 0) for x in m.groups())
                        total_sec = h * 3600 + mi * 60 + s
                        durations[vid_id] = total_sec

    results = []
    for item in data.get("items", []):
        vid_id = item.get("id", {}).get("videoId")
        if not vid_id:
            continue
        snippet = item.get("snippet", {})
        duration_sec = durations.get(vid_id, 0)
        results.append({
            "videoId": vid_id,
            "title": snippet.get("title", ""),
            "channelTitle": snippet.get("channelTitle", ""),
            "thumbnail": snippet.get("thumbnails", {}).get("medium", {}).get("url", ""),
            "durationSec": duration_sec,
            "url": f"https://www.youtube.com/watch?v={vid_id}",
        })

    return {"results": results}


@app.post("/youtube/split")
async def youtube_split(request: Request):
    """Download audio from a YouTube video URL and run stem separation on it."""
    body = await request.json()
    youtube_url = body.get("url", "").strip()
    video_title = body.get("title", "youtube_audio").strip()

    if not youtube_url:
        raise HTTPException(status_code=400, detail="YouTube URL is required")

    # Validate it looks like a YouTube URL
    if "youtube.com/watch" not in youtube_url and "youtu.be/" not in youtube_url:
        raise HTTPException(status_code=400, detail="Invalid YouTube URL")

    job_id = uuid.uuid4().hex

    JOB_STATUS[job_id] = {
        "status": "queued",
        "message": "Downloading audio from YouTube...",
        "createdAt": time.time(),
    }

    # Fire and forget
    asyncio.create_task(process_youtube_job(job_id, youtube_url, video_title))

    return {"jobId": job_id, "status": "queued"}


def extract_youtube_video_id(url: str) -> str:
    import re as _re
    pattern = r'(?:v=|\/v\/|embed\/|youtu\.be\/|\/v=|^)([a-zA-Z0-9_-]{11})'
    match = _re.search(pattern, url)
    if not match:
        raise ValueError(f"Could not extract video ID from URL: {url}")
    return match.group(1)


def download_via_cobalt_proxy(video_url: str, output_path: Path) -> None:
    """Download audio from YouTube via public Cobalt instances from cobalt.directory."""
    import urllib.request as _urllib_request
    import json as _json
    import shutil as _shutil

    # 1. Fetch working Cobalt API instances from cobalt.directory
    try:
        req = _urllib_request.Request(
            "https://cobalt.directory/api/working?type=api",
            headers={"User-Agent": "Mozilla/5.0"}
        )
        with _urllib_request.urlopen(req, timeout=10) as response:
            data = _json.loads(response.read().decode('utf-8'))
            # Get list of instances for youtube or youtube-music
            instances = data.get("youtube", [])
            # Merge youtube-music instances if any are unique
            for inst in data.get("youtube-music", []):
                if inst not in instances:
                    instances.append(inst)
    except Exception as e:
        log.warning("Failed to fetch working Cobalt instances list: %s", e)
        instances = []

    # Static fallbacks just in case the list is empty or the directory is down
    static_fallbacks = [
        "https://api.cobalt.blackcat.sweeux.org",
        "https://subito-c.meowing.de",
        "https://rue-cobalt.xenon.zone",
        "https://dog.kittycat.boo",
        "https://fox.kittycat.boo"
    ]
    for fallback in static_fallbacks:
        if fallback not in instances:
            instances.append(fallback)

    success = False
    last_error = None

    for api_url in instances:
        log.info("Trying Cobalt instance for audio download: %s", api_url)
        try:
            payload = {
                "url": video_url,
                "downloadMode": "audio"
            }
            req = _urllib_request.Request(
                api_url,
                data=_json.dumps(payload).encode('utf-8'),
                headers={
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0'
                },
                method='POST'
            )
            with _urllib_request.urlopen(req, timeout=12) as response:
                res_data = _json.loads(response.read().decode('utf-8'))
                
                # If the instance returned an error status in JSON
                if res_data.get("status") == "error":
                    err_info = res_data.get("error", {})
                    raise RuntimeError(f"Cobalt instance error: {err_info.get('code') or res_data.get('text')}")
                
                download_url = res_data.get("url")
                if not download_url:
                    raise RuntimeError("No download URL returned by instance")
                
                log.info("Downloading Cobalt stream: %s", download_url[:120])
                
                # Stream the download to local disk
                download_req = _urllib_request.Request(download_url, headers={"User-Agent": "Mozilla/5.0"})
                with _urllib_request.urlopen(download_req, timeout=20) as download_res:
                    # Verify HTTP response code
                    if download_res.status != 200:
                        raise RuntimeError(f"Download stream returned status code {download_res.status}")
                        
                    with open(output_path, "wb") as f:
                        _shutil.copyfileobj(download_res, f)
                        
                # Check downloaded file size (minimum 100 KB)
                if output_path.exists() and output_path.stat().st_size > 100 * 1024:
                    log.info("Successfully downloaded YouTube audio using Cobalt instance (%s)", api_url)
                    success = True
                    break
                else:
                    raise RuntimeError("Downloaded file is empty or too small")
        except Exception as e:
            log.warning("Cobalt download failed for instance %s: %s", api_url, e)
            last_error = e
            if output_path.exists():
                output_path.unlink()

    if not success:
        raise RuntimeError(f"All Cobalt download attempts failed. Last error: {last_error}")


def download_via_invidious_proxy(video_id: str, output_path: Path) -> None:
    import urllib.request as _urllib_request
    import urllib.parse as _urllib_parse
    import json as _json
    import shutil as _shutil

    # 1. Fetch active Invidious instances
    try:
        req = _urllib_request.Request("https://api.invidious.io/instances.json", headers={"User-Agent": "Mozilla/5.0"})
        with _urllib_request.urlopen(req, timeout=10) as response:
            instances_data = _json.loads(response.read().decode('utf-8'))
            
            instances = []
            for item in instances_data:
                if isinstance(item, list) and len(item) == 2:
                    name, info = item
                    if info.get('api') is True:
                        uri = info.get('uri')
                        if uri:
                            uptime = info.get('monitor', {}).get('uptime', 0) if info.get('monitor') else 0
                            instances.append((uri.rstrip('/'), uptime))
            
            instances.sort(key=lambda x: x[1], reverse=True)
            instance_urls = [inst for inst, upt in instances]
    except Exception as e:
        log.warning("Failed to fetch Invidious instances list: %s", e)
        instance_urls = []

    # Static fallbacks in case dynamic list is empty or API is blocked
    static_fallbacks = [
        "https://iv.melmac.space",
        "https://invidious.flokinet.to",
        "https://invidious.projectsegfau.lt",
        "https://yewtu.be",
        "https://invidious.privacydev.net",
    ]
    for fallback in static_fallbacks:
        if fallback not in instance_urls:
            instance_urls.append(fallback)

    # Try downloading from top instances
    success = False
    last_error = None
    
    for instance in instance_urls[:15]:
        url = f"{instance}/api/v1/videos/{video_id}"
        log.info("Trying Invidious API instance: %s", url)
        try:
            req = _urllib_request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with _urllib_request.urlopen(req, timeout=8) as response:
                data = _json.loads(response.read().decode('utf-8'))
                
                # Try adaptive formats (usually contains audio only streams)
                adaptive_formats = data.get('adaptiveFormats', [])
                audio_formats = [f for f in adaptive_formats if 'audio/' in f.get('type', '')]
                
                if not audio_formats:
                    # Fallback to general formats
                    audio_formats = [f for f in data.get('formatStreams', []) if 'audio/' in f.get('type', '')]
                
                if audio_formats:
                    # Sort by bitrate descending to get best quality audio
                    audio_formats.sort(key=lambda x: int(x.get('bitrate') or 0), reverse=True)
                    stream_url = audio_formats[0].get('url')
                    if stream_url.startswith('/'):
                        stream_url = f"{instance}{stream_url}"
                    
                    # Force Invidious instance to rewrite and proxy playback through their server (local=true)
                    if "local=true" not in stream_url:
                        if "?" in stream_url:
                            stream_url += "&local=true"
                        else:
                            stream_url += "?local=true"
                    
                    log.info("Downloading stream via proxy URL: %s", stream_url[:120])
                    
                    # Stream the download to local disk
                    download_req = _urllib_request.Request(stream_url, headers={"User-Agent": "Mozilla/5.0"})
                    with _urllib_request.urlopen(download_req, timeout=20) as download_res:
                        with open(output_path, "wb") as f:
                            _shutil.copyfileobj(download_res, f)
                            
                    # Check downloaded file size (minimum 100 KB)
                    if output_path.exists() and output_path.stat().st_size > 100 * 1024:
                        log.info("Successfully downloaded YouTube audio using Invidious proxy (%s)", instance)
                        success = True
                        break
                    else:
                        raise RuntimeError("Downloaded file is empty or too small")
        except Exception as e:
            log.warning("Invidious proxy download failed for instance %s: %s", instance, e)
            last_error = e
            if output_path.exists():
                output_path.unlink()

    if not success:
        raise RuntimeError(f"All Invidious proxy download attempts failed. Last error: {last_error}")


async def process_youtube_job(job_id: str, youtube_url: str, video_title: str) -> None:
    """Download YouTube audio using Cobalt proxy, Invidious proxy, or local yt-dlp fallback, then run Demucs."""
    input_path = PROJECT_ROOT / f"{job_id}.mp3"
    try:
        JOB_STATUS[job_id]["status"] = "processing"
        JOB_STATUS[job_id]["message"] = "Downloading audio from YouTube..."

        # 1. Try Cobalt API proxy downloader first (best quality, high stability)
        try:
            log.info("[job:%s] Attempting Cobalt proxy download for URL: %s", job_id, youtube_url)
            await asyncio.to_thread(download_via_cobalt_proxy, youtube_url, input_path)
        except Exception as cob_err:
            log.warning("[job:%s] Cobalt proxy download failed: %s. Trying Invidious proxy...", job_id, cob_err)
            
            # 2. Extract video ID and try Invidious proxy downloader second
            try:
                video_id = extract_youtube_video_id(youtube_url)
                log.info("[job:%s] Attempting Invidious proxy download for video: %s", job_id, video_id)
                await asyncio.to_thread(download_via_invidious_proxy, video_id, input_path)
            except Exception as inv_err:
                log.warning("[job:%s] Invidious proxy download failed: %s. Falling back to yt-dlp...", job_id, inv_err)
                
                # 3. Fallback: yt-dlp
                output_template = str(PROJECT_ROOT / f"{job_id}.%(ext)s")
                cmd = [
                    "yt-dlp",
                    "--no-playlist",
                    "-x",                          # extract audio
                    "--audio-format", "mp3",
                    "--audio-quality", "0",
                    "-o", output_template,
                    youtube_url,
                ]
                log.info("[job:%s] Running yt-dlp fallback: %s", job_id, " ".join(cmd))
                result = await asyncio.to_thread(
                    run_subprocess_killable, cmd, job_id
                )
                log.info("[job:%s] yt-dlp output: %s", job_id, result.stdout[:200])

                # Resolve the downloaded file path
                files = list(PROJECT_ROOT.glob(f"{job_id}.*"))
                if not files:
                    raise RuntimeError("yt-dlp fallback finished but file not found on disk")
                
                # If it's not .mp3, rename it to .mp3 so demucs can process it easily
                if files[0].suffix.lower() != ".mp3":
                    files[0].rename(input_path)
                else:
                    input_path = files[0]

        log.info("[job:%s] Download complete. File: %s (%.2f MB)", job_id, input_path.name, input_path.stat().st_size / 1024 / 1024)

        # 4. Delegate to process_job for Demucs splitting
        await process_job(job_id, input_path)

    except Exception as exc:
        log.error("[job:%s] YouTube job failed: %s", job_id, exc, exc_info=True)
        JOB_STATUS[job_id].update({
            "status": "failed",
            "message": "We encountered an error while downloading or processing the YouTube audio. Please try another song or URL.",
            "finishedAt": time.time(),
        })
        if input_path and input_path.exists():
            input_path.unlink()




if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")