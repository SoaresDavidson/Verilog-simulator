# Use python 3.13 slim image
FROM python:3.13-slim

# Install uv for fast dependency management
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Set working directory
WORKDIR /app

# Copy dependency files first to leverage Docker caching
COPY pyproject.toml uv.lock ./

# Install dependencies using uv (without installing the project itself yet)
RUN uv sync --frozen --no-cache --no-install-project

# Copy project source code
COPY . .

# Install the project
RUN uv sync --frozen --no-cache

# Expose port 8000
EXPOSE 8000

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PATH="/app/.venv/bin:$PATH"

# Command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
