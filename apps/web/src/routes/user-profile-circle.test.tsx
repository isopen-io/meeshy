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
    <ProfileCircleRowView language="fr" name="Ada" link={props.link} pendingLevel={props.pending ?? null} raisable={props.raisable ?? true} now={NOW} onRaise={noop} />,
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

  test('« Demander Proche » quand la série est servie comme atteinte, nommé pour la personne', () => {
    const html = view({ link: link({ eligibleFor: 'CLOSE' }) });
    expect(html).toContain('data-profile-circle-raise="CLOSE"');
    expect(html).toContain('aria-label="Demander le niveau Proche à Ada"');
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
        deps={{ source: 'gateway', transport }}
      />,
    );
    expect(host.querySelector('[data-profile-circle]')?.getAttribute('data-profile-circle')).toBe('FRIEND');
    await click(host.querySelector<HTMLButtonElement>('[data-profile-circle-raise="CLOSE"]'));
    const sent = appQueryClient.getQueryData<FriendRequestsData>(friendRequestsQueryKey('sent'));
    expect(requests.map((r) => r.body)).toEqual([{ receiverId: 'u-ada', targetLevel: 'CLOSE' }]);
    expect(sent?.pages[0]?.requests.map((r) => [r.id, r.receiverId, r.targetLevel])).toEqual([['f-1', 'u-ada', 'CLOSE']]);
    expect(host.textContent).toContain('Demande envoyée · Proche');
  });
});
