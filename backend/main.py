
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
import httpx
import yt_dlp
from pydantic import BaseModel
from fastapi import FastAPI, File, HTTPException, UploadFile, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
        "-j", "1",
    ]
    log.info("[job:%s] Running demucs: %s", job_id, " ".join(cmd))
    t0 = time.time()
    try:
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
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


async def process_youtube_job(job_id: str, video_id: str) -> None:
    """Background task: download audio from YouTube, then split."""
    input_path = None
    try:
        log.info("[job:%s] Starting YouTube audio download for video_id: %s", job_id, video_id)
        if job_id not in JOB_STATUS:
            JOB_STATUS[job_id] = {"createdAt": time.time()}
        JOB_STATUS[job_id].update({
            "status": "processing",
            "message": "Downloading audio from YouTube...",
        })

        video_url = f"https://www.youtube.com/watch?v={video_id}"
        out_tmpl = str(PROJECT_ROOT / f"{job_id}.%(ext)s")
        
        ydl_opts = {
            'format': 'bestaudio/best',
            'outtmpl': out_tmpl,
            'quiet': True,
        }

        def download():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.download([video_url])

        await asyncio.to_thread(download)

        # Resolve the downloaded file path
        files = list(PROJECT_ROOT.glob(f"{job_id}.*"))
        if not files:
            raise RuntimeError("YouTube audio download failed — file not found on disk")
        
        input_path = files[0]
        log.info("[job:%s] YouTube download complete. File: %s", job_id, input_path.name)

        # Delegate the rest to the standard process_job function
        await process_job(job_id, input_path)

    except Exception as exc:
        log.error("[job:%s] YouTube download/process failed: %s", job_id, exc, exc_info=True)
        if job_id not in JOB_STATUS:
            JOB_STATUS[job_id] = {"createdAt": time.time()}
        JOB_STATUS[job_id].update({
            "status": "failed",
            "message": str(exc),
            "finishedAt": time.time(),
        })
        if input_path and input_path.exists():
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


@app.get("/youtube/search")
async def youtube_search(query: str):
    if not query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    # ── Strategy 1: YouTube InnerTube API (WEB client with public API key) ──
    async def innertube_search(q: str) -> list[dict]:
        # YouTube's publicly-embedded InnerTube API key (not a personal/private key)
        api_key = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
        url = f"https://www.youtube.com/youtubei/v1/search?key={api_key}"
        payload = {
            "context": {
                "client": {
                    "clientName": "WEB",
                    "clientVersion": "2.20240530.02.00",
                    "hl": "en",
                    "gl": "US",
                }
            },
            "query": q,
        }
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Origin": "https://www.youtube.com",
            "Referer": "https://www.youtube.com/",
        }
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()

        # Parse InnerTube response — handle both WEB and mobile response layouts
        results = []
        # WEB client uses twoColumnSearchResultsRenderer
        contents = (
            data.get("contents", {})
            .get("twoColumnSearchResultsRenderer", {})
            .get("primaryContents", {})
            .get("sectionListRenderer", {})
            .get("contents", [])
        )
        # Fallback: mobile clients use sectionListRenderer directly
        if not contents:
            contents = (
                data.get("contents", {})
                .get("sectionListRenderer", {})
                .get("contents", [])
            )
        for section in contents:
            items = section.get("itemSectionRenderer", {}).get("contents", [])
            for item in items:
                vr = item.get("videoRenderer") or item.get("compactVideoRenderer")
                if not vr:
                    continue
                vid = vr.get("videoId")
                title_runs = vr.get("title", {}).get("runs", [])
                title = title_runs[0].get("text") if title_runs else vr.get("title", {}).get("simpleText", "")
                # Duration parsing: "3:24" → 204
                dur_text = vr.get("lengthText", {}).get("simpleText", "")
                dur_secs = 0
                if dur_text:
                    parts = dur_text.split(":")
                    try:
                        if len(parts) == 2:
                            dur_secs = int(parts[0]) * 60 + int(parts[1])
                        elif len(parts) == 3:
                            dur_secs = int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
                    except ValueError:
                        dur_secs = 0
                thumb = None
                thumbs = vr.get("thumbnail", {}).get("thumbnails", [])
                if thumbs:
                    thumb = thumbs[-1].get("url")
                if vid:
                    results.append({"id": vid, "title": title, "duration": dur_secs, "thumbnail": thumb})
                if len(results) >= 5:
                    break
            if len(results) >= 5:
                break
        return results

    # ── Strategy 2: Dynamic Invidious API Fallback ──
    async def invidious_search(q: str) -> list[dict]:
        instances = [
            "https://invidious.projectsegfau.lt",
            "https://yewtu.be",
            "https://vid.puffyan.us",
            "https://invidious.nerdvpn.de",
            "https://invidious.privacydev.net",
        ]
        # Let's dynamically try fetching healthy instances list from invidious API
        async with httpx.AsyncClient(timeout=3.0) as client:
            try:
                resp = await client.get("https://api.invidious.io/json/v1/instances?sort_by=type,health", headers={"Accept": "application/json"})
                if resp.status_code == 200:
                    data = resp.json()
                    dynamic_instances = []
                    for item in data:
                        details = item[1]
                        if details.get("type") == "https" and details.get("monitor", {}).get("status") == "up":
                            uri = details.get("uri")
                            if uri and details.get("api", True):
                                dynamic_instances.append(uri)
                    if dynamic_instances:
                        instances = dynamic_instances[:8] + instances
            except Exception as e:
                log.warning("Failed to fetch dynamic Invidious list: %s", e)

        async with httpx.AsyncClient(timeout=4.0) as client:
            for instance in instances:
                try:
                    url = f"{instance.rstrip('/')}/api/v1/search"
                    resp = await client.get(url, params={"q": q, "type": "video"})
                    resp.raise_for_status()
                    data = resp.json()
                    results = []
                    for item in data:
                        if not isinstance(item, dict):
                            continue
                        video_id = item.get("videoId")
                        title = item.get("title")
                        duration = item.get("lengthSeconds", 0)
                        thumbnails = item.get("videoThumbnails", [])
                        thumbnail_url = thumbnails[0].get("url") if thumbnails else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
                        if video_id and title:
                            results.append({
                                "id": video_id,
                                "title": title,
                                "duration": duration,
                                "thumbnail": thumbnail_url
                            })
                            if len(results) >= 5:
                                break
                    if results:
                        return results
                except Exception as e:
                    log.warning("Invidious instance %s failed: %s", instance, e)
                    continue
        raise RuntimeError("All Invidious instances failed")

    # ── Strategy 3: Piped API Fallback ──
    async def piped_search(q: str) -> list[dict]:
        instances = [
            "https://pipedapi.kavin.rocks",
            "https://pipedapi.adminforge.de",
            "https://api.piped.yt",
            "https://pipedapi.in.projectsegfau.lt",
        ]
        async with httpx.AsyncClient(timeout=3.0) as client:
            for base_url in instances:
                try:
                    resp = await client.get(f"{base_url}/search", params={"q": q, "filter": "videos"})
                    resp.raise_for_status()
                    data = resp.json()
                    items = data.get("items", data) if isinstance(data, dict) else data
                    results = []
                    for item in items:
                        if not isinstance(item, dict):
                            continue
                        vid = item.get("url", "").split("v=")[-1] if "v=" in item.get("url", "") else item.get("url", "").lstrip("/watch?v=")
                        if not vid or vid.startswith("/"):
                            url_str = item.get("url", "")
                            if "/watch?v=" in url_str:
                                vid = url_str.split("/watch?v=")[-1].split("&")[0]
                            else:
                                continue
                        results.append({
                            "id": vid,
                            "title": item.get("title", ""),
                            "duration": item.get("duration", 0),
                            "thumbnail": item.get("thumbnail", ""),
                        })
                        if len(results) >= 5:
                            break
                    if results:
                        return results
                except Exception as e:
                    log.warning("Piped instance %s failed: %s", base_url, e)
                    continue
        raise RuntimeError("All Piped instances failed")

    # ── Strategy 4: DuckDuckGo HTML Search Fallback (Extremely robust to cloud blocks) ──
    async def ddg_search(q: str) -> list[dict]:
        import urllib.parse
        url = "https://html.duckduckgo.com/html/"
        params = {"q": f"{q} site:youtube.com/watch"}
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        async with httpx.AsyncClient(timeout=4.0) as client:
            resp = await client.get(url, params=params, headers=headers)
            resp.raise_for_status()
            html = resp.text

        matches = re.finditer(r'<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL)
        results = []
        seen_ids = set()
        for match in matches:
            href = match.group(1)
            raw_title = match.group(2)
            title = re.sub(r'<[^>]+>', '', raw_title).strip()
            href_decoded = urllib.parse.unquote(href)
            id_match = re.search(r'watch\?v=([a-zA-Z0-9_-]{11})', href_decoded)
            if id_match:
                video_id = id_match.group(1)
                if video_id not in seen_ids:
                    seen_ids.add(video_id)
                    results.append({
                        "id": video_id,
                        "title": title,
                        "duration": 0,
                        "thumbnail": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
                    })
                    if len(results) >= 5:
                        break
        return results

    # ── Strategy 5: yt-dlp fallback ──
    async def ytdlp_search(q: str) -> list[dict]:
        ydl_opts = {
            'quiet': True,
            'extract_flat': 'in_playlist',
            'skip_download': True,
            'socket_timeout': 5,
            'retries': 1,
            'extractor_args': {
                'youtube': {
                    'player_client': ['android', 'ios', 'tvhtml5', 'web'],
                }
            }
        }
        def do_search():
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                return ydl.extract_info(f"ytsearch5:{q}", download=False)
        result = await asyncio.to_thread(do_search)
        entries = result.get('entries', [])
        formatted = []
        for entry in entries:
            if not entry:
                continue
            thumbnail_url = entry.get("thumbnail")
            if not thumbnail_url and entry.get("thumbnails"):
                thumbnail_url = entry.get("thumbnails", [{}])[0].get("url")
            formatted.append({
                "id": entry.get("id"),
                "title": entry.get("title"),
                "duration": entry.get("duration") or 0,
                "thumbnail": thumbnail_url,
            })
        return formatted

    # ── Execute fallback chain ──
    strategies = [
        ("InnerTube", innertube_search),
        ("Invidious", invidious_search),
        ("Piped", piped_search),
        ("DuckDuckGo", ddg_search),
        ("yt-dlp", ytdlp_search),
    ]
    last_error = None
    for name, fn in strategies:
        try:
            log.info("YouTube search [%s]: trying for query '%s'", name, query)
            results = await fn(query)
            if results:
                log.info("YouTube search [%s]: returned %d results", name, len(results))
                return results
            log.warning("YouTube search [%s]: returned 0 results, trying next", name)
        except Exception as exc:
            log.warning("YouTube search [%s] failed: %s", name, exc)
            last_error = exc

    log.error("All YouTube search strategies failed for query '%s'", query)
    raise HTTPException(status_code=500, detail=f"YouTube search failed: {str(last_error)}")


class YouTubeSplitRequest(BaseModel):
    videoId: str


@app.post("/youtube/split")
async def youtube_split(req: YouTubeSplitRequest):
    if not req.videoId.strip():
        raise HTTPException(status_code=400, detail="videoId is required")
        
    job_id = uuid.uuid4().hex
    
    JOB_STATUS[job_id] = {
        "status": "queued",
        "message": "Job queued, downloading YouTube audio soon...",
        "createdAt": time.time(),
    }
    
    # Fire and forget
    asyncio.create_task(process_youtube_job(job_id, req.videoId))
    
    return {"jobId": job_id, "status": "queued"}


@app.post("/cleanup")
async def manual_cleanup():
    cleanup_files()
    return {"message": "Cleanup completed"}


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIST), html=True), name="frontend")