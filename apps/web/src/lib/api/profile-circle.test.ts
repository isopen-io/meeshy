import { describe, expect, test } from 'bun:test';

import { RELATION_LEVELS } from '@meeshy/shared/types/relation';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeProfileCircleView, loadProfileCircle, loadProfileViewAs, profileCircleQueryKey, profileViewAsQueryKey } from './profile-circle';

const served = {
  isSelf: false,
  level: 'FRIEND',
  sharesCommunity: false,
  capabilities: {
    presence: { state: 'open', circle: 'FRIEND', consentRequired: false },
    battery: { state: 'locked', circle: 'CLOSE', consentRequired: true },
  },
};

const transportOf = (reply: ApiResult<unknown>, seen: HttpRequest[] = []): HttpTransport =>
  ({
    request: async (request: HttpRequest) => {
      seen.push(request);
      return reply;
    },
  }) as unknown as HttpTransport;

describe('décodeur de la fiche par cercle', () => {
  test('lit ce que le serveur sert, rien de plus', () => {
    expect(decodeProfileCircleView(served)).toMatchObject({
      level: 'FRIEND',
      capabilities: {
        presence: { state: 'open', circle: 'FRIEND' },
        battery: { state: 'locked', circle: 'CLOSE', consentRequired: true },
      },
    });
  });

  test('une charge illisible rend null : l’écran s’en passe, il n’invente aucun verdict', () => {
    expect(decodeProfileCircleView(undefined)).toBeNull();
    expect(decodeProfileCircleView('x')).toBeNull();
    expect(decodeProfileCircleView({ level: 'ROYAL', capabilities: {} })).toBeNull();
    expect(decodeProfileCircleView({ level: 'FRIEND' })).toBeNull();
  });

  test('un état ou un cercle inconnu d’une capacité la ferme, ou l’écarte : jamais ouverte par erreur', () => {
    const view = decodeProfileCircleView({
      ...served,
      capabilities: {
        presence: { state: 'maybe', circle: 'FRIEND' },
        battery: { state: 'open', circle: 'ROYAL' },
        talkie: { state: 'open', circle: 'CLOSE' },
      },
    });
    expect(view?.capabilities.presence?.state).toBe('locked');
    expect(view?.capabilities.battery).toBeUndefined();
    expect(view?.capabilities.talkie?.state).toBe('open');
  });
});

describe('« Voir comme », lecture du propriétaire', () => {
  test('demande ?as=<cercle>&expand=circle à l’adresse canonique du pseudo', async () => {
    const seen: HttpRequest[] = [];
    const result = await loadProfileViewAs({ source: 'gateway', transport: transportOf({ ok: true, data: { id: 'u1', username: 'aissa', circle: served } } as ApiResult<unknown>, seen), handle: 'aissa', level: 'FRIEND' });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.method).toBe('GET');
    expect(seen[0]?.path).toContain('/aissa?');
    expect(seen[0]?.path).toContain('as=FRIEND');
    expect(seen[0]?.path).toContain('expand=circle');
    expect(result.ok && result.data?.level).toBe('FRIEND');
  });

  test('rend null quand l’ancien serveur ne sert pas la fiche par cercle (champ absent)', async () => {
    const result = await loadProfileViewAs({ source: 'gateway', transport: transportOf({ ok: true, data: { id: 'u1', username: 'aissa' } } as ApiResult<unknown>), handle: 'aissa', level: 'PUBLIC' });
    expect(result.ok && result.data).toBeNull();
  });

  test('la clé de cache sépare les niveaux et la famille de la fiche : aucune collision', () => {
    const keys = RELATION_LEVELS.map((level) => JSON.stringify(profileViewAsQueryKey('Aissa', level)));
    expect(new Set(keys).size).toBe(RELATION_LEVELS.length);
    expect(keys[0]).not.toContain('"directory","people","aissa"');
    expect(keys[0]).toContain('aissa');
  });
});

describe('la fiche par cercle du LECTEUR RÉEL', () => {
  test('demande expand=circle SANS ?as= : le serveur juge la paire réelle', async () => {
    const seen: HttpRequest[] = [];
    const result = await loadProfileCircle({ source: 'gateway', transport: transportOf({ ok: true, data: { id: 'u1', username: 'leo', circle: served } } as ApiResult<unknown>, seen), handle: 'leo' });
    expect(seen[0]?.path).toContain('expand=circle');
    expect(seen[0]?.path).not.toContain('as=');
    expect(result.ok && result.data?.level).toBe('FRIEND');
  });

  test('rend null sans champ servi (ancienne passerelle, visiteur sans compte) : aucun verdict inventé', async () => {
    const result = await loadProfileCircle({ source: 'gateway', transport: transportOf({ ok: true, data: { id: 'u1', username: 'leo' } } as ApiResult<unknown>), handle: 'leo' });
    expect(result.ok && result.data).toBeNull();
  });

  test('sa clé de cache est à part de la fiche, de « Voir comme » et sépare les lecteurs', () => {
    const mine = JSON.stringify(profileCircleQueryKey('Leo', 'viewer-1'));
    expect(mine).toContain('leo');
    expect(mine).not.toBe(JSON.stringify(profileCircleQueryKey('Leo', 'viewer-2')));
    expect(mine).not.toContain('"directory","people","leo"');
    expect(mine).not.toContain('people-view-as');
  });
});
