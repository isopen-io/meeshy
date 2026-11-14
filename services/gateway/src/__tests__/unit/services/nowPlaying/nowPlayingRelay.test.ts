/**
 * L'ÉCOUTE PARTAGÉE (#13934, #16686) — l'émetteur envoie UNE fois l'état complet,
 * le serveur le garde scellé et le TRONQUE lecteur par lecteur : rien sous Proche, la
 * catégorie seule pour un Proche, le titre et l'origine pour un Sang qui les a reçus
 * au rituel. Une montée fait remonter le détail conservé ; une baisse l'efface.
 *
 * Le monde évalue chaque clause reçue (`messagingWorld`) : la loi est jugée sur les
 * lectures vraies, jamais sur un verdict injecté.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { relationPairKey } from '@meeshy/shared/types/relation';
import { SERVER_EVENTS, ROOMS } from '@meeshy/shared/types/socketio-events';
import { NOW_PLAYING_ERROR_CODES, NOW_PLAYING_TTL_SECONDS } from '@meeshy/shared/types/now-playing';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  captureNowPlayingAccess,
  clearNowPlayingOf,
  nowPlayingSnapshotFor,
  publishNowPlaying,
  refreshNowPlayingBetween,
  type NowPlayingRelayDeps,
} from '../../../../services/nowPlaying/nowPlayingRelay';
import { revokeTeamSharesOf } from '../../../../services/relations/teamShareGrant';
import { ADULT_BIRTH, messagingWorld, table, type CircleLink, type Row } from '../../../helpers/messaging-circle-world';

const EMETTEUR = '6200000000000000000000e1';
const SANG = '6200000000000000000000b1';
const SANG_SANS_TITRE = '6200000000000000000000b2';
const PROCHE = '6200000000000000000000c1';
const PROCHE_SANS_ACCORD = '6200000000000000000000c2';
const AMI = '6200000000000000000000f1';
const BLOQUEUR = '6200000000000000000000d1';
const COLLEGUE = '6200000000000000000000a1';
const ORDINAIRE = '6200000000000000000000a2';

const T0 = Date.parse('2026-11-07T12:00:00.000Z');
const ECOUTE = { category: 'music', title: 'Nuit blanche — Les Étoiles', source: 'Spotify' } as const;

type Emission = { readonly room: string; readonly event: string; readonly data: Record<string, unknown> };

function cacheEnMemoire() {
  const entries = new Map<string, { value: string; ttl?: number }>();
  return {
    entries,
    get: (key: string) => Promise.resolve(entries.get(key)?.value ?? null),
    set: (key: string, value: string, ttl?: number) => {
      entries.set(key, { value, ttl });
      return Promise.resolve();
    },
    del: (key: string) => {
      entries.delete(key);
      return Promise.resolve();
    },
  };
}

const LIENS: readonly CircleLink[] = [
  [EMETTEUR, SANG, 'BLOOD'],
  [EMETTEUR, SANG_SANS_TITRE, 'BLOOD'],
  [EMETTEUR, PROCHE, 'CLOSE'],
  [EMETTEUR, PROCHE_SANS_ACCORD, 'CLOSE'],
  [EMETTEUR, AMI, 'FRIEND'],
  [EMETTEUR, BLOQUEUR, 'CLOSE'],
];

const accord = (otherId: string, extra: Row = {}): Row => ({ ownerId: EMETTEUR, otherId, listeningCategoryShared: true, listeningTitleShared: false, ...extra });

function monde(options: { readonly accords?: readonly Row[]; readonly roles?: Readonly<Record<string, string>> } = {}) {
  const world = messagingWorld({
    links: LIENS,
    users: [EMETTEUR, SANG, SANG_SANS_TITRE, PROCHE, PROCHE_SANS_ACCORD, AMI, BLOQUEUR, COLLEGUE, ORDINAIRE].map((id) => ({
      id,
      birthDate: ADULT_BIRTH,
      role: options.roles?.[id] ?? 'USER',
      ...(id === BLOQUEUR ? { blockedUserIds: [EMETTEUR] } : {}),
    })),
  });
  const settings = table([
    ...(options.accords ?? [
      accord(SANG, { listeningTitleShared: true }),
      accord(SANG_SANS_TITRE),
      accord(PROCHE),
      accord(AMI, { listeningTitleShared: true }),
      accord(BLOQUEUR, { listeningTitleShared: true }),
    ]),
  ]);
  const emissions: Emission[] = [];
  const cache = cacheEnMemoire();
  let now = T0;
  const deps: NowPlayingRelayDeps = {
    prisma: { ...world.prisma, relationFeatureSetting: settings } as unknown as PrismaClient,
    cache,
    io: { to: (room: string) => ({ emit: (event: string, data: Record<string, unknown>) => emissions.push({ room, event, data }) }) } as unknown as NowPlayingRelayDeps['io'],
    now: () => now,
  };
  return {
    deps,
    world,
    settings,
    cache,
    emissions,
    avancer: (ms: number) => {
      now += ms;
    },
    vers: (userId: string) => emissions.filter((e) => e.room === ROOMS.user(userId)),
    lier: async (a: string, b: string, level: string) => {
      await world.prisma.userRelation.updateMany({ where: relationPairKey(a, b), data: { grantedByLow: level, grantedByHigh: level } });
    },
  };
}

const KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
afterEach(() => {
  delete process.env.SECRETS_AT_REST_KEY;
});

describe('publier — chaque lecteur reçoit la projection de SON niveau', () => {
  it('un Sang qui a reçu le titre au rituel voit le titre et l\'origine', async () => {
    const m = monde();
    const ack = await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);

    expect(ack).toEqual({ success: true, data: { expiresAt: new Date(T0 + NOW_PLAYING_TTL_SECONDS * 1000).toISOString() } });
    expect(m.vers(SANG)).toEqual([
      {
        room: ROOMS.user(SANG),
        event: SERVER_EVENTS.NOW_PLAYING_CHANGED,
        data: {
          userId: EMETTEUR,
          category: 'music',
          title: ECOUTE.title,
          source: ECOUTE.source,
          updatedAt: new Date(T0).toISOString(),
          expiresAt: new Date(T0 + NOW_PLAYING_TTL_SECONDS * 1000).toISOString(),
        },
      },
    ]);
  });

  it('un Proche reçoit la catégorie SEULE : ni titre ni origine, pas même une clé vide', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);

    const [recu] = m.vers(PROCHE);
    expect(Object.keys(recu.data).sort()).toEqual(['category', 'expiresAt', 'updatedAt', 'userId']);
    expect(JSON.stringify(m.vers(PROCHE))).not.toContain('Nuit blanche');
    expect(JSON.stringify(m.vers(PROCHE))).not.toContain('Spotify');
  });

  it('un Sang à qui le titre n\'a pas été partagé au rituel ne voit que la catégorie', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);

    expect(m.vers(SANG_SANS_TITRE).map((e) => e.data.title)).toEqual([undefined]);
    expect(m.vers(SANG_SANS_TITRE)).toHaveLength(1);
  });

  it('rien sous Proche, rien sans accord, rien à qui a bloqué — même un titre « consenti » à un Ami', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);

    expect(m.vers(AMI)).toEqual([]);
    expect(m.vers(PROCHE_SANS_ACCORD)).toEqual([]);
    expect(m.vers(BLOQUEUR)).toEqual([]);
    expect(m.vers(EMETTEUR)).toEqual([]);
  });

  it('une charge hors contrat est refusée et rien ne part', async () => {
    const m = monde();
    const ack = await publishNowPlaying(m.deps, EMETTEUR, { category: 'podcast', title: 'x' });

    expect(ack).toMatchObject({ success: false, code: NOW_PLAYING_ERROR_CODES.INVALID });
    expect(m.emissions).toEqual([]);
    expect(m.cache.entries.size).toBe(0);
  });
});

describe('le repos — l\'état complet est gardé SCELLÉ, jamais en clair', () => {
  it('la valeur rangée ne contient ni le titre ni l\'origine, et vit le temps de sa durée de vie', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);

    const [entry] = [...m.cache.entries.values()];
    expect(entry.value.startsWith('v1:')).toBe(true);
    expect(entry.value).not.toContain('Nuit');
    expect(entry.value).not.toContain('Spotify');
    expect(entry.ttl).toBe(NOW_PLAYING_TTL_SECONDS);
  });

  it('une valeur scellée pour un compte ne s\'ouvre pas sous la clé d\'un autre', async () => {
    process.env.SECRETS_AT_REST_KEY = KEY;
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    const [[, entry]] = [...m.cache.entries.entries()];
    m.cache.entries.set(`now-playing:${PROCHE}`, entry);
    m.settings.rows.push({ ownerId: PROCHE, otherId: EMETTEUR, listeningCategoryShared: true, listeningTitleShared: false });

    const snapshot = await nowPlayingSnapshotFor(m.deps, EMETTEUR);
    expect(snapshot.items).toEqual([]);
  });

  it('effacer retire l\'état et le dit à ceux qui le voyaient, à eux seuls', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    m.emissions.length = 0;

    expect(await clearNowPlayingOf(m.deps, EMETTEUR)).toEqual({ success: true });
    expect(m.cache.entries.size).toBe(0);
    expect(m.emissions.map((e) => [e.room, e.event, e.data]).sort()).toEqual(
      [SANG, SANG_SANS_TITRE, PROCHE].map((id) => [ROOMS.user(id), SERVER_EVENTS.NOW_PLAYING_CLEARED, { userId: EMETTEUR }]).sort(),
    );
  });
});

describe('le niveau change — la troncature se recalcule sans nouvel envoi', () => {
  it('un Ami qui monte au Sang reçoit aussitôt le titre conservé', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    await m.lier(EMETTEUR, AMI, 'BLOOD');

    await refreshNowPlayingBetween(m.deps, { userA: EMETTEUR, userB: AMI });

    expect(m.vers(AMI).map((e) => [e.event, e.data.title, e.data.source])).toEqual([
      [SERVER_EVENTS.NOW_PLAYING_CHANGED, ECOUTE.title, ECOUTE.source],
    ]);
  });

  it('un Sang qui retombe en Proche perd le titre ; un Proche qui retombe en Ami reçoit l\'effacement', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    m.emissions.length = 0;
    const avantSang = await captureNowPlayingAccess(m.deps, { userA: SANG, userB: EMETTEUR });
    const avantProche = await captureNowPlayingAccess(m.deps, { userA: EMETTEUR, userB: PROCHE });
    await m.lier(EMETTEUR, SANG, 'CLOSE');
    await m.lier(EMETTEUR, PROCHE, 'FRIEND');

    await refreshNowPlayingBetween(m.deps, { userA: SANG, userB: EMETTEUR, before: avantSang });
    await refreshNowPlayingBetween(m.deps, { userA: EMETTEUR, userB: PROCHE, before: avantProche });

    expect(m.vers(SANG).map((e) => [e.event, Object.keys(e.data).includes('title')])).toEqual([[SERVER_EVENTS.NOW_PLAYING_CHANGED, false]]);
    expect(m.vers(PROCHE)).toEqual([{ room: ROOMS.user(PROCHE), event: SERVER_EVENTS.NOW_PLAYING_CLEARED, data: { userId: EMETTEUR } }]);
  });

  it('une montée qui n\'ouvre rien ne dit rien : pas d\'effacement qui trahirait une écoute', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    await m.lier(EMETTEUR, PROCHE_SANS_ACCORD, 'BLOOD');

    await refreshNowPlayingBetween(m.deps, { userA: EMETTEUR, userB: PROCHE_SANS_ACCORD });

    expect(m.vers(PROCHE_SANS_ACCORD)).toEqual([]);
  });

  it('un retrait de la catégorie efface chez le Proche', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    m.emissions.length = 0;
    const avant = await captureNowPlayingAccess(m.deps, { userA: EMETTEUR, userB: PROCHE });
    await m.settings.updateMany({ where: { ownerId: EMETTEUR, otherId: PROCHE }, data: { listeningCategoryShared: false } });

    await refreshNowPlayingBetween(m.deps, { userA: EMETTEUR, userB: PROCHE, before: avant });

    expect(m.vers(PROCHE).map((e) => e.event)).toEqual([SERVER_EVENTS.NOW_PLAYING_CLEARED]);
  });

  it('une coupure vers qui ne voyait RIEN ne dit rien : pas d\'oracle d\'écoute par une baisse ou un blocage sans lien', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    m.emissions.length = 0;
    const INCONNU = '6200000000000000000000ff';
    const avantInconnu = await captureNowPlayingAccess(m.deps, { userA: INCONNU, userB: EMETTEUR });
    const avantAmi = await captureNowPlayingAccess(m.deps, { userA: AMI, userB: EMETTEUR });
    await m.lier(EMETTEUR, AMI, 'ACQUAINTANCE');

    await refreshNowPlayingBetween(m.deps, { userA: INCONNU, userB: EMETTEUR, before: avantInconnu });
    await refreshNowPlayingBetween(m.deps, { userA: AMI, userB: EMETTEUR, before: avantAmi });

    expect(m.emissions).toEqual([]);
  });

  it('un compte désactivé ne voit plus rien, et le sien ne part plus', async () => {
    const m = monde();
    m.world.users.rows.filter((u) => u.id === PROCHE).forEach((u) => Object.assign(u, { deactivatedAt: new Date(T0) }));
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    expect(m.vers(PROCHE)).toEqual([]);

    m.world.users.rows.filter((u) => u.id === EMETTEUR).forEach((u) => Object.assign(u, { deactivatedAt: new Date(T0) }));
    m.emissions.length = 0;
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    expect(m.emissions).toEqual([]);
  });
});

describe('le rattrapage — `GET /relations/now-playing` sert l\'état tronqué au lecteur', () => {
  it('un Proche rattrape la catégorie seule, un Sang le titre, un Ami rien', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);

    const proche = await nowPlayingSnapshotFor(m.deps, PROCHE);
    const sang = await nowPlayingSnapshotFor(m.deps, SANG);
    const ami = await nowPlayingSnapshotFor(m.deps, AMI);

    expect(proche.items.map((i) => Object.keys(i).sort())).toEqual([['category', 'expiresAt', 'updatedAt', 'userId']]);
    expect(sang.items.map((i) => [i.userId, i.title, i.source])).toEqual([[EMETTEUR, ECOUTE.title, ECOUTE.source]]);
    expect(ami.items).toEqual([]);
  });

  it('une écoute dont la durée de vie est passée n\'est plus servie', async () => {
    const m = monde();
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    m.avancer(NOW_PLAYING_TTL_SECONDS * 1000 + 1);

    expect((await nowPlayingSnapshotFor(m.deps, SANG)).items).toEqual([]);
  });
});

describe('#16642 — un collègue de l\'équipe à qui l\'écoute est consentie hors lien la reçoit comme un Sang', () => {
  const EQUIPE = { [EMETTEUR]: 'MODERATOR', [COLLEGUE]: 'ADMIN' } as const;
  const accordsEquipe = () => [accord(SANG, { listeningTitleShared: true }), accord(COLLEGUE, { listeningCategoryShared: false, listeningTitleShared: true })];

  it('publier sert le titre au collègue sans lien, comme au Sang', async () => {
    const m = monde({ roles: EQUIPE, accords: accordsEquipe() });
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);

    expect(m.vers(COLLEGUE).map((e) => [e.event, e.data.title, e.data.source])).toEqual([[SERVER_EVENTS.NOW_PLAYING_CHANGED, ECOUTE.title, ECOUTE.source]]);
    expect(m.vers(SANG)).toHaveLength(1);
  });

  it('le collègue rattrape le titre à la connexion, et l\'effacement lui parvient', async () => {
    const m = monde({ roles: EQUIPE, accords: accordsEquipe() });
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    const rattrape = await nowPlayingSnapshotFor(m.deps, COLLEGUE);
    m.emissions.length = 0;
    await clearNowPlayingOf(m.deps, EMETTEUR);

    expect(rattrape.items.map((i) => [i.userId, i.title])).toEqual([[EMETTEUR, ECOUTE.title]]);
    expect(m.vers(COLLEGUE).map((e) => e.event)).toEqual([SERVER_EVENTS.NOW_PLAYING_CLEARED]);
  });

  it.each<[string, string]>([
    ['l\'émetteur', EMETTEUR],
    ['le lecteur', COLLEGUE],
  ])('#16814 — %s quitte l\'équipe : l\'écoute s\'efface aussitôt chez le collègue qui la voyait, et ne lui revient plus', async (_label, partant) => {
    const m = monde({ roles: EQUIPE, accords: accordsEquipe() });
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);
    m.emissions.length = 0;
    await m.world.prisma.user.updateMany({ where: { id: partant }, data: { role: 'USER' } });
    await revokeTeamSharesOf(m.deps.prisma as never, { userId: partant, now: new Date(T0), nowPlaying: m.deps });
    const rattrape = await nowPlayingSnapshotFor(m.deps, COLLEGUE);

    expect(m.vers(COLLEGUE).map((e) => [e.event, e.data.userId])).toEqual([[SERVER_EVENTS.NOW_PLAYING_CLEARED, EMETTEUR]]);
    expect(m.vers(SANG)).toEqual([]);
    expect(rattrape.items).toEqual([]);
  });

  it('un consentement retiré ne sert plus rien au collègue', async () => {
    const m = monde({ roles: EQUIPE, accords: [accord(COLLEGUE, { listeningCategoryShared: false, listeningTitleShared: false })] });
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);

    expect(m.vers(COLLEGUE)).toEqual([]);
    expect((await nowPlayingSnapshotFor(m.deps, COLLEGUE)).items).toEqual([]);
  });

  it('hors de l\'équipe, une ligne de consentement sans lien n\'ouvre rien : ni l\'éventail, ni le rattrapage', async () => {
    const ordinaire = monde({ accords: [accord(COLLEGUE, { listeningTitleShared: true }), accord(ORDINAIRE, { listeningTitleShared: true })] });
    await publishNowPlaying(ordinaire.deps, EMETTEUR, ECOUTE);
    const equipeVersOrdinaire = monde({ roles: { [EMETTEUR]: 'ADMIN' }, accords: [accord(ORDINAIRE, { listeningTitleShared: true })] });
    await publishNowPlaying(equipeVersOrdinaire.deps, EMETTEUR, ECOUTE);

    expect(ordinaire.vers(COLLEGUE)).toEqual([]);
    expect(ordinaire.vers(ORDINAIRE)).toEqual([]);
    expect((await nowPlayingSnapshotFor(ordinaire.deps, ORDINAIRE)).items).toEqual([]);
    expect(equipeVersOrdinaire.vers(ORDINAIRE)).toEqual([]);
    expect((await nowPlayingSnapshotFor(equipeVersOrdinaire.deps, ORDINAIRE)).items).toEqual([]);
  });

  it('un collègue désactivé ne reçoit plus rien, même consenti', async () => {
    const m = monde({ roles: EQUIPE, accords: accordsEquipe() });
    m.world.users.rows.filter((u) => u.id === COLLEGUE).forEach((u) => Object.assign(u, { deactivatedAt: new Date(T0) }));
    await publishNowPlaying(m.deps, EMETTEUR, ECOUTE);

    expect(m.vers(COLLEGUE)).toEqual([]);
  });
});
