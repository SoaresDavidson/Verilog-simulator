FROM debian:bullseye-slim

# UID/GID do usuário que executa o código do aluno. Precisa coincidir com
# EXECUTION_UID/EXECUTION_GID do backend, que entrega cada run a esse dono
# antes de executar (ver docs/seguranca/modelo-de-isolamento.md).
ARG UID=1000
ARG GID=1000

RUN apt-get update && apt-get install -y --no-install-recommends \
    yosys \
    coreutils \
    python3 \
    python3-pip \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

RUN (getent group "${GID}" || groupadd --gid "${GID}" runner) \
    && useradd --uid "${UID}" --gid "${GID}" --no-create-home \
       --home-dir /tmp --shell /usr/sbin/nologin runner

USER ${UID}:${GID}
WORKDIR /tmp
CMD ["/bin/bash"]
