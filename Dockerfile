FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Node.js 22 (required by @coze/cli >= 0.3.x) + ffmpeg
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg xz-utils \
    && curl -fsSL https://nodejs.org/dist/v22.9.0/node-v22.9.0-linux-x64.tar.xz \
        | tar -xJ -C /usr/local --strip=1 \
    && npm install -g @coze/cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy project
COPY . .

RUN useradd --create-home --shell /bin/bash appuser && \
    chown -R appuser:appuser /app

USER appuser

# Expose
EXPOSE 8000

# Start
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
