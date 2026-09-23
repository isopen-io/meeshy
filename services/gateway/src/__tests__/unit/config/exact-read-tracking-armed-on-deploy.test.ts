/**
 * « LU » N'EST JAMAIS SERVI SUR UN MESSAGE QUE LE LECTEUR N'A PAS AFFICHÉ —
 * sur staging et en production (#7356).
 *
 * `resolveReadAt` (`utils/read-exactness.ts`) ne renonce au repli curseur
 * qu'une fois `EXACT_READ_TRACKING_SINCE` posée. Non posée, un rattrapage
 * (`caughtUpToMessageId`) avance `lastReadAt` à `now` et TOUT message plus
 * ancien est servi « lu » à l'expéditeur, affiché ou non. Or aucune des deux
 * compositions qui déploient ne transmettait la variable à la passerelle :
 * leur bloc `environment:` est une liste EXPLICITE, sans `env_file`, donc la
 * poser dans le `.env` de l'hôte n'atteignait jamais le conteneur.
 *
 * Ce témoin rejoue ce que Docker Compose remet au conteneur, puis ce que la
 * passerelle en fait : il échoue tant que la composition ne l'arme pas.
 *
 * Lit le FICHIER du dépôt, sans parseur YAML — même patron que
 * `sounds-volume-never-public.test.ts`.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from '@jest/globals';
import { getExactReadTrackingCutover } from '../../../config/read-exactness-config';
import { resolveReadAt } from '../../../utils/read-exactness';

const ENV_KEY = 'EXACT_READ_TRACKING_SINCE';
const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');

const DEPLOYMENTS = [
  { compose: 'docker-compose.prod.yml', gateway: 'gateway' },
  { compose: 'docker-compose.staging.yml', gateway: 'gateway-staging' },
] as const;

const original = process.env[ENV_KEY];

afterEach(() => {
  if (original === undefined) delete process.env[ENV_KEY];
  else process.env[ENV_KEY] = original;
});

function serviceBlock(source: string, serviceName: string, compose: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) throw new Error(`service "${serviceName}" introuvable dans ${compose}`);
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

function declaredValue(compose: string, gateway: string): string | null {
  const source = fs.readFileSync(path.resolve(COMPOSE_DIR, compose), 'utf8');
  const line = serviceBlock(source, gateway, compose)
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .map((l) => new RegExp(`^\\s*-\\s*${ENV_KEY}=(.*)$`).exec(l)?.[1])
    .find((value) => value !== undefined);
  return line?.trim() ?? null;
}

/**
 * Ce que Docker Compose remet au conteneur pour une valeur déclarée, selon ce
 * que l'hôte pose : `${V-d}` ne replie que sur l'ABSENT, `${V:-d}` aussi sur le
 * VIDE, `${V}` nu devient la chaîne vide.
 */
function interpolate(declared: string, host: string | undefined): string {
  const match = /^\$\{([A-Za-z_][A-Za-z0-9_]*)(:?-)?([^}]*)\}$/.exec(declared);
  if (!match) return declared;
  const [, , operator, fallback] = match;
  if (operator === '-') return host === undefined ? fallback : host;
  if (operator === ':-') return host ? host : fallback;
  return host ?? '';
}

function servedCutover(declared: string, host: string | undefined): Date | null {
  process.env[ENV_KEY] = interpolate(declared, host);
  return getExactReadTrackingCutover();
}

describe('la lecture exacte est armée par chaque composition qui déploie (#7356)', () => {
  describe.each(DEPLOYMENTS)('$compose', ({ compose, gateway }) => {
    const declared = () => {
      const value = declaredValue(compose, gateway);
      if (value === null) throw new Error(`${ENV_KEY} n'est pas transmise au service "${gateway}" de ${compose}`);
      return value;
    };

    it(`transmet ${ENV_KEY} au service "${gateway}"`, () => {
      expect(declaredValue(compose, gateway)).not.toBeNull();
    });

    it("un hôte qui ne pose rien sert une passerelle ARMÉE, à une date déjà passée", () => {
      const cutover = servedCutover(declared(), undefined);
      expect(cutover).not.toBeNull();
      expect(cutover!.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("un message non affiché, franchi par un rattrapage, n'est PAS servi lu", () => {
      const cutover = servedCutover(declared(), undefined)!;
      const messageCreatedAt = new Date(cutover.getTime() + 60_000);
      const caughtUpAt = new Date(cutover.getTime() + 3_600_000);

      expect(
        resolveReadAt({
          frozenReadAt: null,
          cursorLastReadAt: caughtUpAt,
          messageCreatedAt,
          cutover: getExactReadTrackingCutover(),
        })
      ).toBeNull();
    });

    it("l'historique antérieur à la bascule garde son repli — il ne bascule pas en « jamais vu »", () => {
      const cutover = servedCutover(declared(), undefined)!;
      const cursor = new Date(cutover.getTime() - 60_000);

      expect(
        resolveReadAt({
          frozenReadAt: null,
          cursorLastReadAt: cursor,
          messageCreatedAt: new Date(cutover.getTime() - 3_600_000),
          cutover: getExactReadTrackingCutover(),
        })
      ).toEqual(cursor);
    });

    it("l'hôte peut DÉSARMER sans nouvelle image en posant la variable vide", () => {
      expect(servedCutover(declared(), '')).toBeNull();
    });

    it("l'hôte peut déplacer la date de bascule", () => {
      expect(servedCutover(declared(), '2026-10-01T00:00:00.000Z')).toEqual(
        new Date('2026-10-01T00:00:00.000Z')
      );
    });
  });

  it('staging et production basculent à la MÊME date par défaut', () => {
    const [prod, staging] = DEPLOYMENTS.map(({ compose, gateway }) =>
      interpolate(declaredValue(compose, gateway) ?? '', undefined)
    );
    expect(prod).toBe(staging);
  });
});
