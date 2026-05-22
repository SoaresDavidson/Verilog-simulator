import 'dotenv/config';
import Docker from 'dockerode';
import os from 'os';
const dockerHost = process.env.DOCKER_HOST;

function createDockerClient(): Docker {
  if (dockerHost) {
    if (dockerHost.startsWith('npipe://')) {
      return new Docker({ socketPath: dockerHost.replace(/^npipe:\/\//, '') });
    }

    if (dockerHost.startsWith('unix://')) {
      return new Docker({ socketPath: dockerHost.replace(/^unix:\/\//, '') });
    }

    if (dockerHost.startsWith('tcp://') || dockerHost.startsWith('http://') || dockerHost.startsWith('https://')) {
      const url = new URL(dockerHost);
      return new Docker({
        protocol: url.protocol.replace(':', ''),
        host: url.hostname,
        port: Number(url.port || 2375),
      });
    }

    // Aceita caminho de pipe/socket direto no env.
    if (dockerHost.startsWith('//') || dockerHost.startsWith('/')) {
      return new Docker({ socketPath: dockerHost });
    }

    throw new Error('DOCKER_HOST invalido. Use npipe://, unix://, tcp://, http:// ou https://');
  }

  // Fallback para endpoint padrao quando DOCKER_HOST nao estiver definido.
  const defaultSocket = os.platform() === 'win32' ? '//./pipe/docker_engine' : '/var/run/docker.sock';
  return new Docker({ socketPath: defaultSocket });
}

console.log(`DOCKER_HOST: ${dockerHost ?? '(nao definido)'}`);

const docker = createDockerClient();

const containers = await docker.listContainers({ all: true });

containers.forEach(c => {
  console.log(`${c.Id.slice(0,12)}  ${c.Image}  ${c.State}`);
});