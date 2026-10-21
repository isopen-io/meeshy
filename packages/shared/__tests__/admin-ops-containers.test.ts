import { describe, expect, it } from 'vitest';

import {
  OPS_CONTAINERS_MAX,
  opsContainerSchema,
  opsContainersFileSchema,
  opsContainersViewSchema,
} from '../types/admin-ops-containers.js';

const AT = '2026-10-21T08:00:00.000Z';

const container = (overrides: Record<string, unknown> = {}) => ({
  name: 'meeshy-gateway-staging',
  service: 'gateway-staging',
  image: 'isopen/meeshy-gateway:dev',
  imageId: '3f1c2a9e8b7d',
  imageCreatedAt: '2026-10-20T22:10:00.000Z',
  state: 'running',
  health: 'healthy',
  startedAt: '2026-10-20T22:15:00.000Z',
  finishedAt: null,
  restartCount: 0,
  exitCode: 0,
  stats: {
    cpuPercent: 3.2,
    memoryUsedBytes: 268_435_456,
    memoryLimitBytes: 2_147_483_648,
    netRxBytes: 1_200_000,
    netTxBytes: 3_400_000,
    blockReadBytes: 0,
    blockWriteBytes: 4_096,
    pids: 24,
  },
  networks: [{ name: 'meeshy-staging-network', ipAddress: '172.20.0.5' }],
  ports: [{ containerPort: 3000, protocol: 'tcp', hostIp: null, hostPort: null }],
  ...overrides,
});

describe('opsContainerSchema — un conteneur, tel que le runner de l’hôte le publie (#11441)', () => {
  it('accepte un conteneur en marche, avec sa consommation, ses réseaux et ses ports', () => {
    expect(opsContainerSchema.safeParse(container()).success).toBe(true);
  });

  it('un conteneur arrêté n’a pas de consommation : `stats` est null, son code de sortie se lit', () => {
    const parsed = opsContainerSchema.safeParse(container({ state: 'exited', stats: null, exitCode: 137, finishedAt: AT }));
    expect(parsed.success).toBe(true);
  });

  it('refuse un état ou une santé hors de la liste de Docker', () => {
    expect(opsContainerSchema.safeParse(container({ state: 'zombie' })).success).toBe(false);
    expect(opsContainerSchema.safeParse(container({ health: 'ok' })).success).toBe(false);
  });

  it('ne transporte RIEN d’autre que ce qu’il déclare : une variable d’environnement ou un label ne traversent pas', () => {
    const parsed = opsContainerSchema.parse(container({ env: ['JWT_SECRET=leak'], labels: { secret: 'x' }, command: 'node server.js' }));
    expect(Object.keys(parsed)).not.toContain('env');
    expect(Object.keys(parsed)).not.toContain('labels');
    expect(Object.keys(parsed)).not.toContain('command');
  });

  it('une empreinte d’image est courte et hexadécimale, ou absente', () => {
    expect(opsContainerSchema.safeParse(container({ imageId: 'sha256:3f1c2a9e8b7d' })).success).toBe(false);
    expect(opsContainerSchema.safeParse(container({ imageId: null })).success).toBe(true);
  });

  it('borne les chaînes et les listes : un fichier gonflé ne passe pas', () => {
    expect(opsContainerSchema.safeParse(container({ name: 'x'.repeat(200) })).success).toBe(false);
    expect(opsContainerSchema.safeParse(container({ networks: Array.from({ length: 17 }, (_, i) => ({ name: `n${i}`, ipAddress: '' })) })).success).toBe(false);
  });
});

describe('opsContainersFileSchema — le fichier `state/containers.json`', () => {
  it('porte l’instant de mesure et au plus OPS_CONTAINERS_MAX conteneurs', () => {
    expect(opsContainersFileSchema.safeParse({ measuredAt: AT, containers: [container()] }).success).toBe(true);
    expect(OPS_CONTAINERS_MAX).toBe(64);
    const many = Array.from({ length: OPS_CONTAINERS_MAX + 1 }, (_, i) => container({ name: `c${i}` }));
    expect(opsContainersFileSchema.safeParse({ measuredAt: AT, containers: many }).success).toBe(false);
  });
});

describe('opsContainersViewSchema — ce que la passerelle sert', () => {
  it('sans publication du runner : `measuredAt` null et une liste vide, jamais une erreur', () => {
    expect(opsContainersViewSchema.safeParse({ environment: 'staging', measuredAt: null, containers: [] }).success).toBe(true);
  });
});
