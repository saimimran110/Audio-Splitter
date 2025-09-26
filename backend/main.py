
from fastapi import FastAPI, UploadFile, File
from fastapi.responses import JSONResponse
import subprocess
import os
import shutil
import atexit
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles


app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for Vercel deployment
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# For Vercel serverless, use /tmp directory
BASE_DIR = "/tmp"
OUTPUT_FOLDER = os.path.join(BASE_DIR, "demucs_output")
MODEL = "htdemucs"
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Cleanup function to delete all generated files
def cleanup_files():
    try:
        if os.path.exists(OUTPUT_FOLDER):
            shutil.rmtree(OUTPUT_FOLDER)
            print("Cleaned up all generated audio files")
        
        # Also delete any uploaded files in BASE_DIR
        for file in os.listdir(BASE_DIR):
            if file.endswith(('.mp3', '.wav', '.m4a', '.flac')):
                os.remove(os.path.join(BASE_DIR, file))
                print(f"Deleted uploaded file: {file}")
    except Exception as e:
        print(f"Error during cleanup: {e}")

# Register cleanup function to run when server shuts down
atexit.register(cleanup_files)

# Serve demucs_output as static files
app.mount("/files", StaticFiles(directory=OUTPUT_FOLDER), name="files")


@app.post("/split")
async def split_song(file: UploadFile = File(...)):
    # Save uploaded file
    input_path = os.path.join(BASE_DIR, file.filename)
    with open(input_path, "wb") as f:
        f.write(await file.read())

    # Run demucs
    try:
        subprocess.run([
            "demucs",
            input_path,
            "-o", OUTPUT_FOLDER,
            "-n", MODEL,
            "--two-stems=vocals"
        ], check=True)
    except subprocess.CalledProcessError as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    song_name = os.path.splitext(os.path.basename(input_path))[0]
    vocals_url = f"/files/{MODEL}/{song_name}/vocals.wav"
    karaoke_url = f"/files/{MODEL}/{song_name}/no_vocals.wav"

    return {"vocals": vocals_url, "karaoke": karaoke_url}

# Add a manual cleanup endpoint if needed
@app.post("/cleanup")
async def manual_cleanup():
    cleanup_files()
    return {"message": "Cleanup completed"}