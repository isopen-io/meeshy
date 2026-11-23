import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events/event-names';

import { PACK_SHOP_QUERY_ROOT, packQueryKeys } from '../api/pack-query-keys';
import type { SocketClient } from '../net/socket';
import { applyPackInstallationEvent, bindPackInstallationSync } from './installation-sync';

/**
 * #20354 — **un pack acheté, GAGNÉ ou retiré ailleurs atteint le navigateur.**
 *
 * Le web n'avait aucun écouteur de `pack:installation-updated` alors qu'iOS et
 * Android en ont un. Le rang qui compte est celui du pack GAGNÉ : un achat a
 * encore un geste local qui périme les caches (`unified-shop.tsx`), un octroi
 * par trophée n'en a AUCUN — c'est le seul cas où le navigateur ne peut rien
 * savoir sans l'événement, et c'est donc là que le témoin doit tomber.
 */

const FRAME = packQueryKeys('glory-frame');

const seeded = (): QueryClient => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(FRAME.installed, ['deja-la']);
  client.setQueryData(FRAME.catalogue, [{ slug: 'heritages', owned: false }]);
  client.setQueryData(FRAME.detail('heritages'), { slug: 'heritages', owned: false });
  client.setQueryData([...PACK_SHOP_QUERY_ROOT, 'all'], [{ slug: 'heritages', owned: false }]);
  client.setQueryData([...PACK_SHOP_QUERY_ROOT, 'glory-frame'], [{ slug: 'heritages', owned: false }]);
  return client;
};

const stale = (client: QueryClient, queryKey: readonly unknown[]): boolean =>
  client.getQueryState(queryKey)?.isInvalidated === true;

const award = {
  domain: 'glory-frame',
  slug: 'heritages',
  installed: false,
  owned: true,
  at: '2026-11-22T13:00:00.000Z',
} as const;

describe('applyPackInstallationEvent', () => {
  test('un pack GAGNÉ ailleurs périme l’étagère, le catalogue et la fiche de son domaine', () => {
    const client = seeded();

    applyPackInstallationEvent(client, award);

    expect(stale(client, FRAME.installed)).toBe(true);
    expect(stale(client, FRAME.catalogue)).toBe(true);
    expect(stale(client, FRAME.detail('heritages'))).toBe(true);
  });

  /** La vitrine est prise par sa RACINE : le pack paraît sous « Tout » comme sous son domaine. */
  test('la vitrine unifiée se périme sous TOUS ses filtres', () => {
    const client = seeded();

    applyPackInstallationEvent(client, award);

    expect(stale(client, [...PACK_SHOP_QUERY_ROOT, 'all'])).toBe(true);
    expect(stale(client, [...PACK_SHOP_QUERY_ROOT, 'glory-frame'])).toBe(true);
  });

  test('un retrait fait ailleurs périme aussi — l’événement dit l’état, pas le sens du geste', () => {
    const client = seeded();

    applyPackInstallationEvent(client, { ...award, installed: false, owned: false });

    expect(stale(client, FRAME.installed)).toBe(true);
  });

  /**
   * Le domaine est le SEUL champ sans lequel aucune clé ne se calcule : une
   * charge qui ne le porte pas, ou qui en porte un inconnu d'un serveur plus
   * récent, est ignorée ENTIÈRE. Périmer la seule vitrine servirait une moitié
   * de correctif en silence.
   */
  const IGNOREES: readonly (readonly [string, unknown])[] = [
    ['un domaine inconnu', { ...award, domain: 'nimporte-quoi' }],
    ['un domaine absent', { slug: 'heritages', installed: true, at: award.at }],
    ['une charge qui n’est pas un objet', 'pack'],
    ['un tableau', [award]],
    ['null', null],
  ];

  for (const [nom, payload] of IGNOREES) {
    test(`${nom} ne périme RIEN`, () => {
      const client = seeded();

      applyPackInstallationEvent(client, payload);

      expect(stale(client, FRAME.installed)).toBe(false);
      expect(stale(client, [...PACK_SHOP_QUERY_ROOT, 'all'])).toBe(false);
    });
  }

  /** Le `slug` ne gouverne QUE la fiche : sans lui, le reste se périme quand même. */
  test('sans slug lisible, le domaine se périme et la fiche est épargnée', () => {
    const client = seeded();

    applyPackInstallationEvent(client, { domain: 'glory-frame', installed: true, at: award.at });

    expect(stale(client, FRAME.installed)).toBe(true);
    expect(stale(client, FRAME.detail('heritages'))).toBe(false);
  });

  /**
   * LA SENTINELLE DE PORTÉE : les clés d'un domaine sont des FEUILLES sous
   * `['me','packs']`, racine que partagent la vitrine ET le solde. Prendre les
   * clés du domaine par préfixe emporterait l'un et l'autre.
   */
  test('le solde n’est pas balayé : sa requête est inerte, la vitrine l’écrit à la relecture', () => {
    const client = seeded();
    client.setQueryData(['me', 'packs', 'balance'], 12);

    applyPackInstallationEvent(client, award);

    expect(stale(client, ['me', 'packs', 'balance'])).toBe(false);
  });
});

describe('bindPackInstallationSync', () => {
  test('branche l’événement, et le débranchement le retire', () => {
    const client = seeded();
    const handlers = new Map<string, (payload: unknown) => void>();
    const socket = {
      on: (event: string, handler: (payload: unknown) => void) => void handlers.set(event, handler),
      off: (event: string) => void handlers.delete(event),
    } as unknown as SocketClient;

    const unbind = bindPackInstallationSync({ socket, queryClient: client });

    expect([...handlers.keys()]).toEqual([SERVER_EVENTS.PACK_INSTALLATION_UPDATED]);
    handlers.get(SERVER_EVENTS.PACK_INSTALLATION_UPDATED)?.(award);
    expect(stale(client, FRAME.installed)).toBe(true);

    unbind();
    expect([...handlers.keys()]).toEqual([]);
  });
});
