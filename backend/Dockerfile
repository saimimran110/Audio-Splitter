FROM python:3.11-slimFROM python:3.11-slim



# Set working directory# Set working directory

WORKDIR /appWORKDIR /app



# Install system dependencies for audio processing# Install system dependencies for audio processing

RUN apt-get update && apt-get install -y \RUN apt-get update && apt-get install -y \

    ffmpeg \    ffmpeg \

    && rm -rf /var/lib/apt/lists/*    && rm -rf /var/lib/apt/lists/*



# Copy requirements first for better caching# Copy requirements first for better caching

COPY requirements.txt .COPY requirements.txt .



# Install Python dependencies# Install Python dependencies

RUN pip install --no-cache-dir -r requirements.txtRUN pip install --no-cache-dir -r requirements.txt



# Copy application code# Copy application code

COPY . .COPY . .



# Expose port# Expose port

EXPOSE 8000EXPOSE 8080



# Start the application# Start the application

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]