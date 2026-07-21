FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

# Install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Node.js + Coze CLI (for image generation via CozeImageProvider)
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm \
    && npm install -g @coze/cli \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Copy project
COPY . .

RUN useradd --create-home --shell /bin/bash appuser && \
    mkdir -p /app/uploads/scenes && \
    chown -R appuser:appuser /app

USER appuser

# Expose
EXPOSE 8000

# Start
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
