
FROM python:3.9-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive
ENV CHROME_BIN=/usr/bin/chromium
ENV CHROMEDRIVER_PATH=/usr/bin/chromedriver
ENV ALLOWED_ORIGINS="http://localhost:3000,https://your-frontend-url.onrender.com"

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    chromium \
    chromium-driver \
    xvfb \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create directory for downloaded images
RUN mkdir -p GoogleSearchImages && chmod 777 GoogleSearchImages

# Add a non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

# Set up virtual display
ENV DISPLAY=:99

# Start Xvfb and run the application
CMD xvfb-run --server-args="-screen 0 1280x800x24 -ac" \
    gunicorn google_image_scraper:app \
    --bind 0.0.0.0:$PORT \
    --workers 1 \
    --worker-class uvicorn.workers.UvicornWorker \
    --timeout 300
