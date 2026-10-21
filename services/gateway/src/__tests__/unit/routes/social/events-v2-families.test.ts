/**
 * @jest-environment node
 *
 * #10502–#10510 — le CATALOGUE TYPÉ v2 de `POST /social/events` : audience,
 * consentement, anonymes, capture d'écran, défilement, rangement.
 *
 * Les témoins passent par la VRAIE porte et lisent ce qui a été ÉCRIT
 * (`contentEvents` = les documents de l'`insert` brut dans `ContentEvent`).
 */
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { reachHarness, sendReachV2, visitorHeader } from '../../../helpers/reach-harness';
import { issueSearchId } from '../../../../services/social/searchFingerprint';

jest.mock('../../../../services/PostService', () => ({ PostService: jest.fn() }));
jest.mock('../../../../services/MediaService', () => ({ MediaService: jest.fn() }));

const POST = '507f1f77bcf86cd799439011';
const HIDDEN = '507f1f77bcf86cd799439012';
const COMMENT = '507f1f77bcf86cd7994390c1';
const HIDDEN_COMMENT = '507f1f77bcf86cd7994390c2';
const READER = '507f1f77bcf86cd7994390ff';
const OTHER = '507f1f77bcf86cd7994390fe';
const MY_NOTIFICATION = '507f1f77bcf86cd7994390a1';
const THEIR_NOTIFICATION = '507f1f77bcf86cd7994390a2';
const APP_SESSION = '2b1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f';
const LISTING_SESSION = '3c1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f';
const account = { authorization: `Bearer ${READER}` };

const POSTS = [{ id: POST }, { id: HIDDEN, visibility: 'PRIVATE', authorId: OTHER }];
const WORLD = {
  comments: [{ id: COMMENT, postId: POST }, { id: HIDDEN_COMMENT, postId: HIDDEN }],
  notifications: [{ id: MY_NOTIFICATION, userId: READER }, { id: THEIR_NOTIFICATION, userId: OTHER }],
};
const CONTEXT = {
  schemaVersion: 2,
  appSessionId: APP_SESSION,
  platform: 'ios',
  appVersion: '3.4.1',
  os: { name: 'iOS', version: '18.2' },
  deviceClass: 'phone',
  network: { type: 'cellular', subtype: '5g' },
  uiLanguage: 'fr',
  deviceLocale: 'en-US',
};

const dataOf = (res: { payload: string }) => JSON.parse(res.payload).data;
const harness = (world: Record<string, unknown> = {}) => reachHarness(POSTS, undefined, { ...WORLD, ...world });

const share = (postId: string, extra: Record<string, unknown> = {}) => ({
  type: 'interaction',
  action: 'share',
  target: { kind: 'post', id: postId },
  destination: 'conversation',
  surface: 'feed',
  listing: { position: 3, rankingSource: 'for_you', feedRequestId: 'fr_abc123' },
  ...extra,
});
const screenshot = (extra: Record<string, unknown> = {}) => ({
  type: 'screen_capture',
  action: 'screenshot',
  surface: 'detail',
  target: { kind: 'post', id: POST },
  captureKind: 'screenshot',
  visibleTargets: [{ kind: 'post', id: POST, visibleFraction: 0.9 }, { kind: 'post', id: HIDDEN, visibleFraction: 0.4 }],
  ...extra,
});
const scrollListing = (extra: Record<string, unknown> = {}) => ({
  type: 'scroll',
  action: 'listing',
  surface: 'feed',
  listingSessionId: LISTING_SESSION,
  segment: 0,
  durationMs: 42_000,
  activeScrollMs: 9_000,
  itemsRendered: 30,
  itemsViewable: 22,
  maxPosition: 29,
  distancePt: 18_400,
  velocityHistogram: [3000, 4000, 1500, 500],
  directionChanges: 4,
  upDistanceRatio: 0.12,
  flings: 3,
  stops: 7,
  refreshes: 1,
  paginations: 2,
  reachedEnd: false,
  ...extra,
});
const scrollContent = (extra: Record<string, unknown> = {}) => ({
  type: 'scroll',
  action: 'content',
  surface: 'detail',
  target: { kind: 'post', id: POST },
  contentKind: 'carousel',
  itemsTotal: 6,
  maxIndexReached: 4,
  swipes: 5,
  durationMs: 8_000,
  ...extra,
});

afterEach(() => {
  delete process.env.SOCIAL_EVENTS_V2_ENABLED;
  delete process.env.SOCIAL_EVENTS_V2_SAMPLING;
});

describe('audience — on ne range que ce que l’acteur peut lire', () => {
  it('un partage d’un post hors audience ⇒ rejected, aucune ligne, shareCount inchangé', async () => {
    const h = await harness();
    const res = await sendReachV2(h.app, [share(HIDDEN)], account, CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 0, rejected: 1, ignored: 0 });
    expect(h.contentEvents).toHaveLength(0);
    expect(JSON.stringify(h.writes)).not.toContain(HIDDEN);
    expect(h.store.read(HIDDEN)?.shareCount ?? 0).toBe(0);
    await h.app.close();
  });

  it('un partage d’un post lisible est rangé et ne touche AUCUN compteur du post', async () => {
    const h = await harness();
    const res = await sendReachV2(h.app, [share(POST)], account, CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 1, rejected: 0 });
    expect(h.contentEvents).toEqual([expect.objectContaining({
      type: 'interaction', action: 'share', targetKind: 'post', targetId: POST,
      props: expect.objectContaining({ destination: 'conversation' }),
    })]);
    expect(h.writes.filter((w) => (w as { model: string }).model === 'post')).toEqual([]);
    await h.app.close();
  });

  it('un commentaire est gardé par son post : celui d’un post caché est rejeté, l’autre rangé avec son parent', async () => {
    const h = await harness();
    const res = await sendReachV2(h.app, [
      { type: 'interaction', action: 'react', target: { kind: 'comment', id: COMMENT } },
      { type: 'interaction', action: 'react', target: { kind: 'comment', id: HIDDEN_COMMENT } },
    ], account, CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 1, rejected: 1 });
    expect(h.contentEvents[0]).toMatchObject({ targetKind: 'comment', targetId: COMMENT, parentKind: 'post', parentId: POST });
    await h.app.close();
  });

  it('une notification d’autrui ⇒ rejected ; la sienne est rangée', async () => {
    const h = await harness();
    const res = await sendReachV2(h.app, [
      { type: 'notification', action: 'opened', target: { kind: 'notification', id: THEIR_NOTIFICATION }, channel: 'apns' },
      { type: 'notification', action: 'opened', target: { kind: 'notification', id: MY_NOTIFICATION }, channel: 'apns' },
    ], account, CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 1, rejected: 1 });
    expect(h.contentEvents).toHaveLength(1);
    expect(h.contentEvents[0].targetId).toBe(MY_NOTIFICATION);
    await h.app.close();
  });
});

describe('consentement — un comportement sans consentement n’est rattaché à aucun compte', () => {
  it('sans analyticsConsentAt : actorKind none, ni userId, ni session, ni feedRequestId ; OS en majeure', async () => {
    const h = await harness();
    await sendReachV2(h.app, [share(POST)], account, CONTEXT);

    const row = h.contentEvents[0];
    expect(row).toMatchObject({ actorKind: 'none', platform: 'ios', osVersion: '18', network: 'cellular', uiLanguage: 'fr' });
    expect(row.userId).toBeUndefined();
    expect(row.listing).toEqual({ position: 3, rankingSource: 'for_you' });
    expect(JSON.stringify(h.writes)).not.toContain(APP_SESSION);
    expect(JSON.stringify(h.writes)).not.toContain('fr_abc123');
    expect(JSON.stringify(h.writes)).not.toContain(READER);
    await h.app.close();
  });

  it('avec analyticsConsentAt : actorKind user, userId, session et listing complets', async () => {
    const h = await harness({ consentedUserIds: [READER] });
    await sendReachV2(h.app, [share(POST)], account, CONTEXT);

    expect(h.contentEvents[0]).toMatchObject({
      actorKind: 'user',
      userId: { $oid: READER },
      appSessionId: APP_SESSION,
      osVersion: '18.2',
      network: 'cellular/5g',
      listing: { position: 3, rankingSource: 'for_you', feedRequestId: 'fr_abc123' },
    });
    await h.app.close();
  });

  it('un client qui déclare `denied` l’emporte sur le consentement serveur : AUCUNE ligne v2, seuls les compteurs d’audience bougent', async () => {
    const h = await harness({ consentedUserIds: [READER] });
    const res = await sendReachV2(h.app, [share(POST), scrollListing(), { type: 'impression', postId: POST }], account, { ...CONTEXT, consent: 'denied' });

    expect(h.contentEvents).toHaveLength(0);
    expect(dataOf(res)).toMatchObject({ recorded: 1, rejected: 0, ignored: 2 });
    expect(h.store.read(POST)?.impressionCount).toBe(1);
    await h.app.close();
  });

  it('un retrait SERVEUR (analyse retirée) vaut refus, même si le client dit `granted` : aucune ligne v2', async () => {
    const h = await harness({ withdrawnUserIds: [READER] });
    const res = await sendReachV2(h.app, [share(POST), scrollListing()], account, { ...CONTEXT, consent: 'granted' });

    expect(h.contentEvents).toHaveLength(0);
    expect(dataOf(res)).toMatchObject({ recorded: 0, ignored: 2 });
    await h.app.close();
  });

  it('`unknown` sans consentement serveur : ligne sans acteur, sans session ni contexte fin', async () => {
    const h = await harness();
    await sendReachV2(h.app, [share(POST)], account, { ...CONTEXT, consent: 'unknown' });

    const row = h.contentEvents[0];
    expect(row).toMatchObject({ actorKind: 'none', osVersion: '18', network: 'cellular' });
    expect(row.userId).toBeUndefined();
    expect(row.appSessionId).toBeUndefined();
    expect(row.deviceClass).toBeUndefined();
    expect(JSON.stringify(h.writes)).not.toContain(READER);
    await h.app.close();
  });

  it('le client ne fait jamais ACCORDER : `granted` sans consentement serveur ⇒ ligne sans acteur', async () => {
    const h = await harness();
    await sendReachV2(h.app, [share(POST)], account, { ...CONTEXT, consent: 'granted' });

    expect(h.contentEvents[0].actorKind).toBe('none');
    expect(h.contentEvents[0].userId).toBeUndefined();
    expect(JSON.stringify(h.writes)).not.toContain(APP_SESSION);
    await h.app.close();
  });

  it('bloquer depuis un contenu ne s’attribue jamais, même consenti (R5)', async () => {
    const h = await harness({ consentedUserIds: [READER] });
    await sendReachV2(h.app, [{ type: 'negative', action: 'block', target: { kind: 'post', id: POST } }], account, CONTEXT);

    expect(h.contentEvents[0].actorKind).toBe('none');
    expect(h.contentEvents[0].userId).toBeUndefined();
    await h.app.close();
  });
});

describe('anonymes — les types admis, rangés sans session', () => {
  it('interaction ⇒ rejected ; screen_capture et scroll ⇒ rangés, contexte réduit à plateforme et langue', async () => {
    const h = await harness();
    const res = await sendReachV2(h.app, [share(POST), screenshot(), scrollListing()], visitorHeader(1), CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 2, rejected: 1 });
    expect(h.contentEvents.map((row) => row.type)).toEqual(['screen_capture', 'scroll']);
    h.contentEvents.forEach((row) => {
      expect(row).toMatchObject({ actorKind: 'none', platform: 'ios', uiLanguage: 'fr' });
      expect(row.appVersion).toBeUndefined();
      expect(row.osName).toBeUndefined();
    });
    expect(JSON.stringify(h.writes)).not.toContain(APP_SESSION);
    expect(JSON.stringify(h.writes)).not.toContain(LISTING_SESSION);
    await h.app.close();
  });
});

describe('anonymes — le défilement n’entame jamais le comptage', () => {
  it('61 événements v2 d’un visiteur : 60 rangés, 1 refusé, et sa vue suivante COMPTE', async () => {
    const h = await harness();
    const lot = Array.from({ length: 61 }, () => scrollListing());
    const v2 = await sendReachV2(h.app, lot, visitorHeader('defile'), CONTEXT);
    const vue = await sendReachV2(h.app, [{ type: 'view', postId: POST }], visitorHeader('defile'));

    expect(dataOf(v2)).toMatchObject({ recorded: 60, rejected: 1 });
    expect(vue.statusCode).toBe(200);
    expect(dataOf(vue)).toMatchObject({ recorded: 1, rejected: 0 });
    expect(h.store.read(POST)).toMatchObject({ viewCount: 1, anonymousViewCount: 1 });
    await h.app.close();
  });

  it('un comptage épuisé ne coupe pas la v2, et inversement', async () => {
    const h = await harness();
    const vues = Array.from({ length: 60 }, () => ({ type: 'impression', postId: POST }));
    await sendReachV2(h.app, vues, visitorHeader('compte'));
    const v2 = await sendReachV2(h.app, [scrollListing()], visitorHeader('compte'), CONTEXT);

    expect(dataOf(v2)).toMatchObject({ recorded: 1, rejected: 0 });
    expect(h.store.read(POST)?.impressionCount).toBe(60);
    await h.app.close();
  });
});

describe('capture d’écran — QU’une capture a eu lieu, jamais ce qu’elle montre', () => {
  it('les cibles visibles hors audience sont retirées, la capture est rangée', async () => {
    const h = await harness();
    await sendReachV2(h.app, [screenshot()], account, CONTEXT);

    expect(h.contentEvents[0]).toMatchObject({
      type: 'screen_capture', action: 'screenshot', targetId: POST, surface: 'detail',
      props: { captureKind: 'screenshot', visibleTargets: [{ kind: 'post', id: POST, visibleFraction: 0.9 }] },
    });
    expect(JSON.stringify(h.writes)).not.toContain(HIDDEN);
    await h.app.close();
  });

  it('un enregistrement d’écran arrêté porte sa durée, recording_or_mirroring', async () => {
    const h = await harness();
    await sendReachV2(h.app, [screenshot({ action: 'recording_stopped', captureKind: 'recording_or_mirroring', recordingMs: 12_000 })], account, CONTEXT);

    expect(h.contentEvents[0].props).toMatchObject({ captureKind: 'recording_or_mirroring', recordingMs: 12_000 });
    await h.app.close();
  });

  it('une image ou un contenu glissé dans la capture n’est JAMAIS rangé', async () => {
    const h = await harness();
    await sendReachV2(h.app, [screenshot({ image: 'iVBORw0KGgoAAAANSUhEUg', text: 'secret', url: 'https://x.y/z' })], account, CONTEXT);

    const journal = JSON.stringify(h.writes);
    expect(journal).not.toContain('iVBORw0KGgo');
    expect(journal).not.toContain('secret');
    expect(journal).not.toContain('https://x.y/z');
    await h.app.close();
  });
});

describe('défilement — un résumé par session de listing, et par contenu', () => {
  it('scroll.listing range l’histogramme de vitesse, la profondeur et les gestes, sans cible', async () => {
    const h = await harness();
    await sendReachV2(h.app, [scrollListing()], account, CONTEXT);

    expect(h.contentEvents[0]).toMatchObject({
      type: 'scroll',
      action: 'listing',
      surface: 'feed',
      props: expect.objectContaining({
        velocityHistogram: [3000, 4000, 1500, 500], maxPosition: 29, distancePt: 18_400, flings: 3, paginations: 2,
      }),
    });
    expect(h.contentEvents[0].targetKind).toBeUndefined();
    await h.app.close();
  });

  it('scroll.content (carrousel) exige sa cible ; sans elle l’événement est ignoré', async () => {
    const h = await harness();
    const res = await sendReachV2(h.app, [scrollContent(), scrollContent({ target: undefined })], account, CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 1, ignored: 1 });
    expect(h.contentEvents[0]).toMatchObject({ targetKind: 'post', props: expect.objectContaining({ contentKind: 'carousel', maxIndexReached: 4 }) });
    await h.app.close();
  });

  it('le défilement vit 30 jours, une interaction 90', async () => {
    const h = await harness();
    await sendReachV2(h.app, [scrollListing(), share(POST)], account, CONTEXT);

    const days = (row: Record<string, unknown>) =>
      Math.round((Date.parse((row.expiresAt as { $date: string }).$date) - Date.now()) / 86_400_000);
    expect(days(h.contentEvents[0])).toBe(30);
    expect(days(h.contentEvents[1])).toBe(90);
    await h.app.close();
  });
});

describe('forme — aucune chaîne libre, des valeurs inconnues sans refus', () => {
  it('une action inconnue ou un genre de cible inconnu ⇒ ignored, le lot passe', async () => {
    const h = await harness();
    const res = await sendReachV2(h.app, [
      share(POST, { action: 'teleport' }),
      share(POST, { target: { kind: 'planet', id: POST } }),
      share(POST),
    ], account, CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 1, ignored: 2 });
    await h.app.close();
  });

  it('une destination de partage inconnue devient `other`', async () => {
    const h = await harness();
    await sendReachV2(h.app, [share(POST, { destination: 'pigeon' })], account, CONTEXT);

    expect(h.contentEvents[0].props).toMatchObject({ destination: 'other' });
    await h.app.close();
  });

  it('un événement de plus de 2 Kio est ignoré', async () => {
    const h = await harness();
    const res = await sendReachV2(h.app, [share(POST, { padding: 'x'.repeat(2100) })], account, CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 0, ignored: 1 });
    expect(h.contentEvents).toHaveLength(0);
    await h.app.close();
  });

  it('la recherche : ni texte, ni adresse ; l’empreinte n’est rangée que pour un compte consentant', async () => {
    const searchId = issueSearchId('Alice Martin');
    const search = {
      type: 'discovery', action: 'search_submitted', searchId, queryLength: 12, resultCount: 4,
      query: 'Alice Martin', q: 'Alice Martin', url: 'https://meeshy.me/search?q=Alice',
    };

    const sans = await harness();
    await sendReachV2(sans.app, [search], account, CONTEXT);
    const avec = await harness({ consentedUserIds: [READER] });
    await sendReachV2(avec.app, [search], account, CONTEXT);

    for (const h of [sans, avec]) {
      const journal = JSON.stringify(h.writes);
      expect(journal).not.toContain('Alice');
      expect(journal).not.toContain('https://');
      expect(journal).not.toContain(searchId);
    }
    expect((sans.contentEvents[0].props as Record<string, unknown>).queryFingerprint).toBeUndefined();
    expect((avec.contentEvents[0].props as Record<string, unknown>).queryFingerprint).toMatch(/^[0-9a-f]{32}$/);
    await sans.app.close();
    await avec.app.close();
  });

  it('un searchId forgé ne range aucune empreinte', async () => {
    const h = await harness({ consentedUserIds: [READER] });
    await sendReachV2(h.app, [{
      type: 'discovery', action: 'search_submitted', searchId: `0123456789abcdef.${'a'.repeat(32)}.0123456789abcdef`,
    }], account, CONTEXT);

    expect((h.contentEvents[0].props as Record<string, unknown>).queryFingerprint).toBeUndefined();
    await h.app.close();
  });
});

describe('rangement — une écriture par requête, rejeux, interrupteur', () => {
  it('200 événements v2 ⇒ UN seul insert', async () => {
    const h = await harness();
    const res = await sendReachV2(h.app, Array.from({ length: 200 }, () => scrollContent()), account, CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 200 });
    expect(h.rawInserts.filter((insert) => insert.collection === 'ContentEvent')).toEqual([{ collection: 'ContentEvent', count: 200 }]);
    await h.app.close();
  });

  it('un doublon d’eventId ⇒ recorded côté client, aucune nouvelle ligne', async () => {
    const h = await harness();
    const event = share(POST, { eventId: '4d1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f' });
    await sendReachV2(h.app, [event], account, CONTEXT);
    const replay = await sendReachV2(h.app, [event], account, CONTEXT);

    expect(dataOf(replay)).toMatchObject({ recorded: 1 });
    expect(h.contentEvents).toHaveLength(1);
    await h.app.close();
  });

  it('SOCIAL_EVENTS_V2_ENABLED=false ⇒ tout v2 est ignored, rien n’est écrit, accepts n’annonce plus la v2', async () => {
    process.env.SOCIAL_EVENTS_V2_ENABLED = 'false';
    const h = await harness();
    const res = await sendReachV2(h.app, [share(POST), scrollListing()], account, CONTEXT);

    expect(dataOf(res)).toMatchObject({ recorded: 0, ignored: 2 });
    expect(dataOf(res).accepts).not.toContain('scroll');
    expect(h.contentEvents).toHaveLength(0);
    await h.app.close();
  });

  it('SOCIAL_EVENTS_V2_SAMPLING règle le taux servi ; le taux déclaré par le client est rangé', async () => {
    process.env.SOCIAL_EVENTS_V2_SAMPLING = '0.25';
    const h = await harness();
    const res = await sendReachV2(h.app, [scrollListing()], account, { ...CONTEXT, sampling: { scroll: 0.25 } });

    expect(dataOf(res).sampling).toEqual({ scroll: 0.25, playback: 0.25, visibility: 0.25 });
    expect(h.contentEvents[0].sampleRate).toBe(0.25);
    await h.app.close();
  });
});

describe('consentement — l’analyse sans son parent ne vaut rien', () => {
  it('analyticsConsentAt posé mais traitement des données retiré ⇒ rangé sans acteur', async () => {
    const h = await harness({ consentedUserIds: [READER] });
    (h.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({ analyticsConsentAt: new Date('2026-01-01'), dataProcessingConsentAt: null });
    await sendReachV2(h.app, [share(POST)], account, CONTEXT);

    expect(h.contentEvents[0].actorKind).toBe('none');
    await h.app.close();
  });
});

describe('O1 — aucun identifiant qui relie, sur une ligne sans acteur', () => {
  const IMPRESSION_EVENT = '6a1c2b9e-1d2a-4c55-9a1e-0a4b5c6d7e8f';
  const MUTATION = '507f1f77bcf86cd7994390b7';
  const linked = [
    { type: 'visibility', action: 'measured', target: { kind: 'post', id: POST }, impressionEventId: IMPRESSION_EVENT, viewable: true },
    { type: 'interaction', action: 'react', target: { kind: 'post', id: POST }, mutationId: MUTATION },
  ];

  it('sans consentement : ni l’impression reliée ni la mutation REST ne sont rangées', async () => {
    const h = await harness();
    await sendReachV2(h.app, linked, account, CONTEXT);

    const journal = JSON.stringify(h.writes);
    expect(journal).not.toContain(IMPRESSION_EVENT);
    expect(journal).not.toContain(MUTATION);
    expect(h.contentEvents[0].props).toMatchObject({ viewable: true });
    await h.app.close();
  });

  it('avec consentement : l’impression reliée est rangée par sa CLÉ (jamais l’identifiant brut), la mutation aussi', async () => {
    const h = await harness({ consentedUserIds: [READER] });
    await sendReachV2(h.app, linked, account, CONTEXT);

    expect(JSON.stringify(h.writes)).not.toContain(IMPRESSION_EVENT);
    expect((h.contentEvents[0].props as Record<string, unknown>).impressionEventKey).toMatch(/^[0-9a-f]{64}$/);
    expect(h.contentEvents[1].props).toMatchObject({ mutationId: MUTATION });
    await h.app.close();
  });
});

describe('R8 — un compte déclaré mineur de moins de 15 ans n’est jamais profilé', () => {
  it('consentement posé, 14 ans déclarés ⇒ rangé sans acteur', async () => {
    const h = await harness({ consentedUserIds: [READER] });
    const birthDate = new Date(Date.now() - 14 * 365.25 * 86_400_000);
    (h.prisma.user.findUnique as jest.Mock<any>).mockResolvedValue({
      analyticsConsentAt: new Date('2026-01-01'), dataProcessingConsentAt: new Date('2026-01-01'), birthDate,
    });
    await sendReachV2(h.app, [share(POST)], account, CONTEXT);

    expect(h.contentEvents[0].actorKind).toBe('none');
    await h.app.close();
  });
});
