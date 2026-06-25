FROM python:3.11-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangocairo-1.0-0 libpangoft2-1.0-0 \
    libgdk-pixbuf-2.0-0 libffi-dev libcairo2 gcc \
    traceroute iputils-ping dnsutils mtr \
    && rm -rf /var/lib/apt/lists/*
RUN pip install --no-cache-dir fastapi uvicorn asyncpg python-dotenv python-multipart openpyxl weasyprint redis[hiredis] bcrypt pyjwt slowapi prometheus-client loguru
COPY . /app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
