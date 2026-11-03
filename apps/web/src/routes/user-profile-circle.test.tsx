import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { friendRequestsQueryKey, type FriendRequestRecord, type FriendRequestsData } from '@/lib/api/friend-requests';
import type { HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { RELATION_LINKS_QUERY_KEY, type RelationLink } from '@/lib/api/relations';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileCircleRow, ProfileCircleRowView } from './user-profile-circle';

/**
 * LE CERCLE SUR LA FICHE D'UNE PERSONNE (#13940) — iso `ProfileCircleSection` /
 * `ProfileCircleViewModel` : le niveau COMMUN que `GET /relations` sert au seul
 * lecteur, ce qui manque pour monter, et « Demander X » quand la loi de demande
 * l'ouvre. Rien n'est fabriqué : sans lien servi, ou sous Connaissance, la fiche
 * ne montre rien de plus.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.clear();
});

const NOW = new Date('2026-11-02T12:00:00.000Z');
const noop = () => undefined;

const link = (overrides: Partial<RelationLink> = {}): RelationLink => ({
  userId: 'u-ada',
  effectiveLevel: 'FRIEND',
  grantedByMe: 'FRIEND',
  since: null,
  progress: { activeWeeks: 3, needed: 4, missing: [] },
  eligibleFor: null,
  ...overrides,
});

const view = (props: { readonly link: RelationLink | null; readonly pending?: FriendRequestRecord['targetLevel'] | 'FRIEND' | null; readonly raisable?: boolean }) =>
  renderToStaticMarkup(
    <ProfileCircleRowView language="fr" name="Ada" link={props.link} pendingLevel={props.pending ?? null} raisable={props.raisable ?? true} now={NOW} onRaise={noop} onLower={noop} />,
  );

describe('la ligne du cercle', () => {
  test('le niveau commun et ce qui manque pour monter', () => {
    const html = view({ link: link({ effectiveLevel: 'CLOSE', progress: { activeWeeks: 5, needed: 12, missing: [] } }) });
    expect(html).toContain('data-profile-circle="CLOSE"');
    expect(html).toContain('🔥');
    expect(html).toContain('Proche');
    expect(html).toContain('Semaines d’affilée : 5 sur 12');
  });

  test('rien n’est fabriqué : sans lien servi, ou sous Connaissance, rien', () => {
    expect(view({ link: null })).toBe('');
    expect(view({ link: link({ effectiveLevel: 'COMMUNITY' }) })).toBe('');
  });

  test('« Soyons proches » quand la série est servie comme atteinte, nommé pour la personne', () => {
    const html = view({ link: link({ eligibleFor: 'CLOSE' }) });
    expect(html).toContain('data-profile-circle-raise="CLOSE"');
    expect(html).toContain('>Soyons proches<');
    expect(html).toContain('aria-label="Soyons proches : demander le niveau Proche à Ada"');
  });

  test('un libellé impératif par cercle visé (décision porteur 2026-11-03) : Soyons amis, Soyons proches, Devenons sang', () => {
    expect(view({ link: link({ effectiveLevel: 'ACQUAINTANCE', grantedByMe: 'ACQUAINTANCE', canRaise: true }) })).toContain('>Soyons amis<');
    expect(view({ link: link({ effectiveLevel: 'FRIEND', canRaise: true }) })).toContain('>Soyons proches<');
    expect(view({ link: link({ effectiveLevel: 'CLOSE', grantedByMe: 'CLOSE', canRaise: true }) })).toContain('>Devenons sang<');
  });

  test('verrouillé, déjà demandé, ou offert ailleurs (« Ajouter ») : aucun bouton', () => {
    expect(view({ link: link() })).not.toContain('data-profile-circle-raise');
    expect(view({ link: link({ eligibleFor: 'CLOSE' }), pending: 'CLOSE' })).toContain('Demande envoyée · Proche');
    expect(view({ link: link({ eligibleFor: 'CLOSE' }), pending: 'CLOSE' })).not.toContain('data-profile-circle-raise');
    expect(view({ link: link({ effectiveLevel: 'ACQUAINTANCE' }), raisable: false })).not.toContain('data-profile-circle-raise');
  });
});

describe('câblée sur les caches', () => {
  const sentPages = (requests: readonly FriendRequestRecord[]): FriendRequestsData => ({ pages: [{ requests, nextCursor: null }], pageParams: [null] });

  test('le niveau de CETTE personne seule, depuis le cache de « Mes cercles » ; « Demander » écrit la demande au tap', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link({ userId: 'u-bob', effectiveLevel: 'BLOOD' }), link({ eligibleFor: 'CLOSE' })]);
    appQueryClient.setQueryData(friendRequestsQueryKey('sent'), sentPages([]));
    const requests: HttpRequest[] = [];
    const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
    transport.request = (async (req: HttpRequest) => {
      requests.push(req);
      return { ok: true, data: { id: 'f-1', senderId: 'u-me', receiverId: 'u-ada', status: 'pending', createdAt: '2026-11-02T12:00:00.000Z', targetLevel: 'CLOSE' } };
    }) as HttpTransport['request'];
    const host = await mount(
      <ProfileCircleRow
        language="fr"
        person={{ id: 'u-ada', username: 'ada', displayName: 'Ada', avatar: null }}
        raisable
        viewerId="u-me"
        now={NOW}
        onOutcome={noop}
        onNotice={noop}
        deps={{ source: 'gateway', transport }}
      />,
    );
    expect(host.querySelector('[data-profile-circle]')?.getAttribute('data-profile-circle')).toBe('FRIEND');
    await click(host.querySelector<HTMLButtonElement>('[data-profile-circle-raise="CLOSE"]'));
    const sent = appQueryClient.getQueryData<FriendRequestsData>(friendRequestsQueryKey('sent'));
    expect(requests.filter((r) => r.method === 'POST').map((r) => r.body)).toEqual([{ receiverId: 'u-ada', targetLevel: 'CLOSE' }]);
    expect(sent?.pages[0]?.requests.map((r) => [r.id, r.receiverId, r.targetLevel])).toEqual([['f-1', 'u-ada', 'CLOSE']]);
    expect(host.textContent).toContain('Demande envoyée · Proche');
  });
});

describe('gérer le lien (#14910) — promouvoir si possible, rétrograder d’un cran, annuler à Connaissance', () => {
  test('« Restons amis » sous un Proche, « Annuler le lien » sous une Connaissance', () => {
    const close = view({ link: link({ effectiveLevel: 'CLOSE', grantedByMe: 'CLOSE' }) });
    expect(close).toContain('data-profile-circle-lower="demote"');
    expect(close).toContain('>Restons amis<');
    const acquaintance = view({ link: link({ effectiveLevel: 'ACQUAINTANCE', grantedByMe: 'ACQUAINTANCE' }), raisable: false });
    expect(acquaintance).toContain('data-profile-circle="ACQUAINTANCE"');
    expect(acquaintance).toContain('data-profile-circle-lower="unlink"');
    expect(acquaintance).toContain('Annuler le lien');
  });

  test('descendre dit le cercle d’arrivée à l’impératif : Restons proches, Restons amis, Restons en contact', () => {
    expect(view({ link: link({ effectiveLevel: 'BLOOD', grantedByMe: 'BLOOD' }) })).toContain('>Restons proches<');
    expect(view({ link: link({ effectiveLevel: 'CLOSE', grantedByMe: 'CLOSE' }) })).toContain('>Restons amis<');
    expect(view({ link: link({ effectiveLevel: 'FRIEND', grantedByMe: 'FRIEND' }) })).toContain('>Restons en contact<');
  });

  test('Promouvoir est MASQUÉ tant que la passerelle sert un délai', () => {
    const html = view({ link: link({ eligibleFor: 'CLOSE', raiseBlockedUntil: '2026-12-01T00:00:00.000Z' }) });
    expect(html).not.toContain('data-profile-circle-raise');
    expect(html).toContain('data-profile-circle-lower="demote"');
  });

  test('Promouvoir est MASQUÉ quand la passerelle sert `canRaise: false` (demande en suspens, non éligible)', () => {
    expect(view({ link: link({ eligibleFor: 'CLOSE', canRaise: false }) })).not.toContain('data-profile-circle-raise');
    expect(view({ link: link({ eligibleFor: 'CLOSE', canRaise: true }) })).toContain('data-profile-circle-raise="CLOSE"');
  });

  test('câblée : `canRaise: false` lu sur GET /relations/:userId masque Promouvoir', async () => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link({ eligibleFor: 'CLOSE' })]);
    appQueryClient.setQueryData(friendRequestsQueryKey('sent'), { pages: [{ requests: [], nextCursor: null }], pageParams: [null] } satisfies FriendRequestsData);
    const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
    transport.request = (async (req: HttpRequest) =>
      req.path === '/api/v1/relations/u-ada' ? { ok: true, data: { ...link({ eligibleFor: 'CLOSE' }), canRaise: false, raiseBlockedUntil: null } } : { ok: true, data: null }) as HttpTransport['request'];
    const host = await mount(
      <ProfileCircleRow
        language="fr"
        person={{ id: 'u-ada', username: 'ada', displayName: 'Ada', avatar: null }}
        raisable
        viewerId="u-me"
        now={NOW}
        onOutcome={noop}
        onNotice={noop}
        deps={{ source: 'gateway', transport }}
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(host.querySelector('[data-profile-circle-raise]')).toBeNull();
    expect(host.querySelector('[data-profile-circle-lower="demote"]')).not.toBeNull();
  });

  const transportFor = (lowerResult: unknown, requests: HttpRequest[]): HttpTransport => {
    const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
    transport.request = (async (req: HttpRequest) => {
      requests.push(req);
      if (req.method === 'POST') return lowerResult;
      if (req.path === '/api/v1/relations') return { ok: true, data: appQueryClient.getQueryData(RELATION_LINKS_QUERY_KEY) ?? [] };
      return { ok: true, data: null };
    }) as HttpTransport['request'];
    return transport;
  };

  const mountRow = (transport: HttpTransport, notices: string[] = []) =>
    mount(
      <ProfileCircleRow
        language="fr"
        person={{ id: 'u-ada', username: 'ada', displayName: 'Ada', avatar: null }}
        raisable
        viewerId="u-me"
        now={NOW}
        onOutcome={noop}
        onNotice={(message) => notices.push(message)}
        deps={{ source: 'gateway', transport }}
      />,
    );

  const seed = (over: Partial<RelationLink>) => {
    appQueryClient.setQueryData(RELATION_LINKS_QUERY_KEY, [link(over)]);
    appQueryClient.setQueryData(friendRequestsQueryKey('sent'), { pages: [{ requests: [], nextCursor: null }], pageParams: [null] } satisfies FriendRequestsData);
  };

  test('rétrograder passe par une confirmation qui dit départ, arrivée, silence et 30 jours ; « Annuler » ne touche à rien', async () => {
    seed({ effectiveLevel: 'CLOSE', grantedByMe: 'CLOSE' });
    const requests: HttpRequest[] = [];
    const host = await mountRow(transportFor({ ok: true, data: null }, requests));
    await click(host.querySelector<HTMLButtonElement>('[data-profile-circle-lower="demote"]'));
    const dialog = document.querySelector('[data-confirm-dialog="circle-demote"]');
    expect(dialog?.textContent).toContain('Rester seulement amis avec Ada ?');
    expect(document.querySelector('[data-confirm-dialog="circle-demote"] [data-confirm="confirm"]')?.textContent).toBe('Restons amis');
    expect(dialog?.textContent).toContain('Ada passera de Proche à Ami.');
    expect(dialog?.textContent).toContain('ne pourra pas vous redemander de remonter avant 30 jours');
    await click(document.querySelector<HTMLButtonElement>('[data-confirm-dialog="circle-demote"] [data-confirm="cancel"]'));
    expect(document.querySelector('[data-confirm-dialog]')).toBeNull();
    expect(requests.filter((r) => r.method === 'POST')).toEqual([]);
    expect(host.querySelector('[data-profile-circle]')?.getAttribute('data-profile-circle')).toBe('CLOSE');
  });

  test('confirmé : le niveau change AU GESTE, la passerelle reçoit le cran inférieur', async () => {
    seed({ effectiveLevel: 'CLOSE', grantedByMe: 'CLOSE' });
    const requests: HttpRequest[] = [];
    let settle: (value: unknown) => void = noop;
    const pending = new Promise((resolve) => {
      settle = resolve;
    });
    const transport = transportFor(null, requests);
    const inner = transport.request;
    transport.request = (async (req: HttpRequest) => (req.method === 'POST' ? (requests.push(req), pending) : inner(req))) as HttpTransport['request'];
    const host = await mountRow(transport);
    await click(host.querySelector<HTMLButtonElement>('[data-profile-circle-lower="demote"]'));
    await click(document.querySelector<HTMLButtonElement>('[data-confirm-dialog="circle-demote"] [data-confirm="confirm"]'));
    expect(requests.filter((r) => r.method === 'POST').map((r) => [r.path, r.body])).toEqual([['/api/v1/relations/u-ada/level', { level: 'FRIEND' }]]);
    expect(host.querySelector('[data-profile-circle]')?.getAttribute('data-profile-circle')).toBe('FRIEND');
    settle({ ok: true, data: { ...link({ effectiveLevel: 'FRIEND', grantedByMe: 'FRIEND' }) } });
  });

  test('un refus rend le niveau d’avant et le dit', async () => {
    seed({ effectiveLevel: 'ACQUAINTANCE', grantedByMe: 'ACQUAINTANCE' });
    const requests: HttpRequest[] = [];
    const notices: string[] = [];
    const host = await mountRow(transportFor({ ok: false, status: 500, error: 'x' }, requests), notices);
    await click(host.querySelector<HTMLButtonElement>('[data-profile-circle-lower="unlink"]'));
    expect(document.querySelector('[data-confirm-dialog="circle-unlink"]')?.textContent).toContain('Annuler le lien avec Ada ?');
    await click(document.querySelector<HTMLButtonElement>('[data-confirm-dialog="circle-unlink"] [data-confirm="confirm"]'));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests.filter((r) => r.method === 'POST').map((r) => r.body)).toEqual([{ level: 'PUBLIC' }]);
    expect(appQueryClient.getQueryData<readonly RelationLink[]>(RELATION_LINKS_QUERY_KEY)?.[0]?.effectiveLevel).toBe('ACQUAINTANCE');
    expect(notices).toEqual(['La modification n’a pas pu être enregistrée.']);
  });
});
