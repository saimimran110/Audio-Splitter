FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /app/audio-splice-studio
COPY audio-splice-studio/package*.json ./
RUN npm ci
COPY audio-splice-studio/ ./
RUN npm run build

FROM python:3.11-slim

WORKDIR /app

ENV DEBIAN_FRONTEND=noninteractive
ENV PORT=7860
ENV OMP_NUM_THREADS=1
ENV MKL_NUM_THREADS=1
ENV OPENBLAS_NUM_THREADS=1
ENV NUMEXPR_NUM_THREADS=1
ENV VECLIB_MAXIMUM_THREADS=1

ENV TORCH_HOME=/app/.cache

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir -r /app/backend/requirements.txt

COPY backend/ /app/backend/
COPY --from=frontend-builder /app/audio-splice-studio/dist /app/audio-splice-studio/dist

# Pre-download and cache the Demucs model during Docker build
RUN python -m demucs.separate -n htdemucs --two-stems=vocals /app/backend/test_tone.wav -o /tmp/dummy_out && rm -rf /tmp/dummy_out
RUN chmod -R 777 /app/.cache

WORKDIR /app/backend

EXPOSE 7860

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-7860}"]