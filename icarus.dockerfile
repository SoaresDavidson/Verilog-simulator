FROM debian:bullseye-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    iverilog \
    make \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
CMD ["/bin/bash"]