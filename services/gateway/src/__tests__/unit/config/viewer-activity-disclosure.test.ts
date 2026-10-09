/**
 * « Seulement à partir de maintenant » (#9727, décision porteur 2026-10-09) :
 * la liste des vues d'un post ou d'un réel ne montre que l'activité postérieure
 * à sa mise en service ; une story garde tout son historique. La date se lit
 * dans la configuration, et une valeur illisible ne montre RIEN du passé.
 *
 * Le second bloc rejoue ce que Docker Compose remet au conteneur (même patron
 * que `exact-read-tracking-armed-on-deploy.test.ts`) : les compositions
 * déclarent leur `environment:` en liste EXPLICITE, la variable doit y être.
 *
 * @jest-environment node
 */

import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from '@jest/globals';
import {
  DEFAULT_VIEWER_ACTIVITY_DISCLOSED_SINCE,
  NOTHING_DISCLOSED_SINCE,
  VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV,
  activityDisclosureFloor,
  parseViewerActivityDisclosedSince,
  viewerActivityDisclosedSince,
} from '../../../config/viewer-activity-disclosure';

const original = process.env[VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV];

afterEach(() => {
  if (original === undefined) delete process.env[VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV];
  else process.env[VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV] = original;
});

describe('la date de mise en service de la liste des vues enrichie', () => {
  it('vaut 2026-10-10 par défaut', () => {
    expect(DEFAULT_VIEWER_ACTIVITY_DISCLOSED_SINCE.toISOString()).toBe('2026-10-10T00:00:00.000Z');
    expect(parseViewerActivityDisclosedSince(undefined)).toEqual(DEFAULT_VIEWER_ACTIVITY_DISCLOSED_SINCE);
    expect(parseViewerActivityDisclosedSince('   ')).toEqual(DEFAULT_VIEWER_ACTIVITY_DISCLOSED_SINCE);
  });

  it.each([
    ['2026-11-02T08:30:00.000Z', '2026-11-02T08:30:00.000Z'],
    ['2026-11-02', '2026-11-02T00:00:00.000Z'],
    ['2026-11-02T10:00:00+02:00', '2026-11-02T08:00:00.000Z'],
  ])('lit une date ISO 8601 (%s)', (raw, expected) => {
    expect(parseViewerActivityDisclosedSince(raw).toISOString()).toBe(expected);
  });

  it.each(['demain', '1', '2026-13-45', '10/10/2026', 'NaN', '2026-10-10T25:00:00Z'])(
    "une valeur illisible (%s) retombe sur une date FUTURE : rien du passé n'est montré",
    (raw) => {
      const since = parseViewerActivityDisclosedSince(raw);
      expect(since).toEqual(NOTHING_DISCLOSED_SINCE);
      expect(since.getTime()).toBeGreaterThan(Date.now());
    },
  );

  it("se relit dans l'environnement, sans redémarrage", () => {
    process.env[VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV] = '2026-12-01T00:00:00.000Z';
    expect(viewerActivityDisclosedSince().toISOString()).toBe('2026-12-01T00:00:00.000Z');
    process.env[VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV] = 'illisible';
    expect(viewerActivityDisclosedSince()).toEqual(NOTHING_DISCLOSED_SINCE);
    delete process.env[VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV];
    expect(viewerActivityDisclosedSince()).toEqual(DEFAULT_VIEWER_ACTIVITY_DISCLOSED_SINCE);
  });
});

describe('ce que la borne gouverne', () => {
  const since = new Date('2026-10-10T00:00:00.000Z');

  it.each(['POST', 'REEL'])('un %s est borné à la mise en service', (type) => {
    expect(activityDisclosureFloor(type, since)).toEqual(since);
  });

  it.each(['STORY', 'STATUS'])('un %s garde tout son historique', (type) => {
    expect(activityDisclosureFloor(type, since)).toBeNull();
  });

  it.each([undefined, null, '', 'UNKNOWN'])('un type inconnu (%s) est borné : fail-closed', (type) => {
    expect(activityDisclosureFloor(type, since)).toEqual(since);
  });
});

const COMPOSE_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', 'infrastructure', 'docker', 'compose');
const DEPLOYMENTS = [
  { compose: 'docker-compose.prod.yml', gateway: 'gateway' },
  { compose: 'docker-compose.staging.yml', gateway: 'gateway-staging' },
] as const;

function serviceBlock(source: string, serviceName: string): string {
  const lines = source.split('\n');
  const startIdx = lines.findIndex((l) => l === `  ${serviceName}:`);
  if (startIdx === -1) return '';
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex((l) => /^ {2}\S/.test(l));
  return (endIdx === -1 ? rest : rest.slice(0, endIdx)).join('\n');
}

function declaredValue(compose: string, gateway: string): string | null {
  const source = fs.readFileSync(path.resolve(COMPOSE_DIR, compose), 'utf8');
  const value = serviceBlock(source, gateway)
    .split('\n')
    .filter((l) => !l.trimStart().startsWith('#'))
    .map((l) => new RegExp(`^\\s*-\\s*${VIEWER_ACTIVITY_DISCLOSED_SINCE_ENV}=(.*)$`).exec(l)?.[1])
    .find((v) => v !== undefined);
  return value?.trim() ?? null;
}

function hostless(declared: string): string {
  const match = /^\$\{[A-Za-z_][A-Za-z0-9_]*:?-([^}]*)\}$/.exec(declared);
  return match ? match[1] : declared;
}

describe('chaque composition qui déploie transmet la date à la passerelle', () => {
  it.each(DEPLOYMENTS)('$compose → $gateway', ({ compose, gateway }) => {
    const declared = declaredValue(compose, gateway);
    expect(declared).not.toBeNull();
    expect(parseViewerActivityDisclosedSince(hostless(declared ?? ''))).toEqual(DEFAULT_VIEWER_ACTIVITY_DISCLOSED_SINCE);
  });
});
