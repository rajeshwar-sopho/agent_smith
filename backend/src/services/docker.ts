import Docker from 'dockerode';
import path from 'path';
import fs from 'fs';

const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || path.resolve('./workspaces');
const BOT_IMAGE = process.env.BOT_IMAGE || 'bot-orchestrator-runtime:latest';
const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:4000';

export async function createBotContainer(botId: string): Promise<string> {
  // Ensure workspace dir exists
  const workspaceDir = path.join(WORKSPACE_ROOT, botId);
  fs.mkdirSync(workspaceDir, { recursive: true });

  const container = await docker.createContainer({
    Image: BOT_IMAGE,
    name: `bot-${botId}`,
    Env: [
      `BOT_ID=${botId}`,
      `BACKEND_URL=${BACKEND_URL}`,
      `ANTHROPIC_API_KEY=${process.env.ANTHROPIC_API_KEY || ''}`,
      `GEMINI_API_KEY=${process.env.GEMINI_API_KEY || ''}`,
    ],
    HostConfig: {
      Binds: [`${workspaceDir}:/workspace:rw`, `${process.env.SHARED_PROGRAMS_ROOT || "/shared-programs"}:/shared-programs:rw`],
      Memory: 512 * 1024 * 1024, // 512MB
      NanoCpus: 1_000_000_000,   // 1 CPU
      NetworkMode: 'bot-orchestrator_default',
      RestartPolicy: { Name: 'on-failure', MaximumRetryCount: 3 },
    },
    Labels: { 'bot-orchestrator': 'bot', 'bot-id': botId },
  });

  await container.start();
  return container.id;
}

export async function stopBotContainer(containerId: string): Promise<void> {
  try {
    const container = docker.getContainer(containerId);
    await container.stop({ t: 10 });
    await container.remove();
  } catch (e: unknown) {
    // Container may already be stopped/removed
    if ((e as { statusCode?: number }).statusCode !== 404) {
      console.error('Error stopping container:', e);
    }
  }
}

export async function getBotContainerStatus(containerId: string): Promise<string> {
  try {
    const container = docker.getContainer(containerId);
    const info = await container.inspect();
    return info.State.Status; // running | stopped | exited
  } catch {
    return 'not_found';
  }
}

export async function listBotContainers(): Promise<Docker.ContainerInfo[]> {
  return docker.listContainers({
    filters: JSON.stringify({ label: ['bot-orchestrator=bot'] }),
  });
}

export { docker };
