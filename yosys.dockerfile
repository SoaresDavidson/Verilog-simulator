FROM debian:bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    yosys \
    python3 \
    python3-pip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
CMD ["/bin/bash"]