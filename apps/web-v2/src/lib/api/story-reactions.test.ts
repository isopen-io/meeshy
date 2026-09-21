import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { STORY_FEED_QUERY_KEY, type StoryFeedPost } from './stories';
import {
  STORY_REACTION_FAILED,
  STORY_REACTION_PENDING,
  applyStoryReactionEvent,
  isStoryReactionEvent,
  performStoryReaction,
  storyReactionAnnouncement,
  type StoryReactionDeps,
} from './story-reactions';

/**
 * **LE PORT DES RÉACTIONS DE STORY** — le seul des quatre ports du lecteur
 * qui n'avait AUCUN témoin (#7112, revue) : `feed-gestures`,
 * `publication-comments` et `reactions` portent le leur. La règle du 404
 * (« un retrait refusé en 404 est une réconciliation »), la grammaire des
 * trois issues et la garde d'appel-en-vol n'étaient mesurées par rien — et
 * le gate de navigateur ne peut pas les atteindre : sous fixtures,
 * `sendStoryReaction` rend `{ok:true}` de façon SYNCHRONE, donc ni
 * `!result.ok` ni `result.notice` n'y sont joignables. Un correctif juste,
 * effaçable demain sans qu'un seul gate ne rougisse.
 */

const story = (patch: Partial<StoryFeedPost> = {}): StoryFeedPost => ({
  id: 'st-1',
  type: 'STORY',
  createdAt: '2026-09-19T09:00:00.000Z',
  reactionCount: 12,
  ...patch,
});

const seeded = (stories: readonly StoryFeedPost[]): QueryClient => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(STORY_FEED_QUERY_KEY, stories);
  return queryClient;
};

const cached = (queryClient: QueryClient, id = 'st-1'): StoryFeedPost | undefined =>
  queryClient.getQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY)?.find((s) => s.id === id);

/** Un transport qui ENREGISTRE ce qu'on lui demande et rend la réponse
 * scriptée — même patron que `feed-gestures.test.ts`. */
const scripted = (respond: (req: HttpRequest) => Promise<ApiResult<unknown>>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return respond(req);
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

/** `source: 'gateway'` À DESSEIN sur CHAQUE vecteur : sous `'fixtures'` le
 * port court-circuite le transport et rend `{ok:true}` — aucune des trois
 * issues ne serait atteignable, et la suite entière verdirait sur rien. */
const deps = (queryClient: QueryClient, transport: HttpTransport): StoryReactionDeps => ({
  source: 'gateway',
  transport,
  queryClient,
});

const HEART = '❤️';

describe('performStoryReaction — l’optimiste précède la passerelle', () => {
  test('le cœur et le compte basculent AVANT toute réponse', async () => {
    const queryClient = seeded([story({ currentUserReactions: [] })]);
    let release: (r: ApiResult<unknown>) => void = () => undefined;
    const { transport } = scripted(() => new Promise((resolve) => (release = resolve)));

    const pending = performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });
    expect(cached(queryClient)?.currentUserReactions).toEqual([HEART]);
    expect(cached(queryClient)?.reactionCount).toBe(13);

    release({ ok: true, status: 201, data: { liked: true } });
    expect(await pending).toEqual({ ok: true });
  });

  test('la route est celle du Flux — `POST /posts/:id/like`, corps `{ emoji }`, idempotence `cmid_`', async () => {
    const queryClient = seeded([story({ currentUserReactions: [] })]);
    const { requests, transport } = scripted(() => Promise.resolve({ ok: true, status: 201, data: {} }));

    await performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });

    expect(requests[0]?.method).toBe('POST');
    expect(requests[0]?.path).toBe('/api/v1/posts/st-1/like');
    expect(requests[0]?.body).toEqual({ emoji: HEART });
    expect(requests[0]?.headers?.['X-Client-Mutation-Id']).toMatch(/^cmid_/);
  });

  test('une réaction DÉJÀ POSÉE se retire — `DELETE`, et le compte redescend', async () => {
    const queryClient = seeded([story({ currentUserReactions: [HEART] })]);
    const { requests, transport } = scripted(() => Promise.resolve({ ok: true, status: 200, data: {} }));

    await performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });

    expect(requests[0]?.method).toBe('DELETE');
    expect(cached(queryClient)?.currentUserReactions).toEqual([]);
    expect(cached(queryClient)?.reactionCount).toBe(11);
  });
});

describe('performStoryReaction — les TROIS issues, et ce qu’elles laissent à l’écran', () => {
  test('une PANNE RÉSEAU garde l’optimiste et l’ANNONCE — jamais un silence pris pour un succès', async () => {
    const queryClient = seeded([story({ currentUserReactions: [] })]);
    const { transport } = scripted(() => Promise.reject(new Error('offline')));

    const result = await performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });

    expect(result).toEqual({ ok: true, notice: STORY_REACTION_PENDING });
    expect(cached(queryClient)?.currentUserReactions).toEqual([HEART]);
    expect(cached(queryClient)?.reactionCount).toBe(13);
  });

  test('un 503 est PASSAGER lui aussi — l’optimiste reste, annoncé', async () => {
    const queryClient = seeded([story({ currentUserReactions: [] })]);
    const { transport } = scripted(() => Promise.resolve({ ok: false, status: 503, error: 'indisponible' }));

    const result = await performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });

    expect(result).toEqual({ ok: true, notice: STORY_REACTION_PENDING });
    expect(cached(queryClient)?.currentUserReactions).toEqual([HEART]);
  });

  test('un 429 aussi — `RETRYABLE_CLIENT_STATUSES` n’est pas un refus, et retirer le cœur mentirait', async () => {
    const queryClient = seeded([story({ currentUserReactions: [] })]);
    const { transport } = scripted(() => Promise.resolve({ ok: false, status: 429, error: 'rate limit' }));

    const result = await performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });

    expect(result).toEqual({ ok: true, notice: STORY_REACTION_PENDING });
    expect(cached(queryClient)?.currentUserReactions).toEqual([HEART]);
  });

  test('un REFUS PERMANENT (403) DÉFAIT l’optimiste ET l’annonce — sans un mot, un retrait est indiscernable d’un second tap', async () => {
    const queryClient = seeded([story({ currentUserReactions: [] })]);
    const { transport } = scripted(() => Promise.resolve({ ok: false, status: 403, error: 'refusé' }));

    const result = await performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: STORY_REACTION_FAILED });
    expect(cached(queryClient)?.currentUserReactions).toEqual([]);
    expect(cached(queryClient)?.reactionCount).toBe(12);
  });

  test('un 401 défait aussi — la session a expiré, aucun rejeu à l’identique n’aboutirait', async () => {
    const queryClient = seeded([story({ currentUserReactions: [] })]);
    const { transport } = scripted(() => Promise.resolve({ ok: false, status: 401, error: 'session' }));

    const result = await performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: STORY_REACTION_FAILED });
    expect(cached(queryClient)?.currentUserReactions).toEqual([]);
  });
});

describe('performStoryReaction — UN RETRAIT REFUSÉ EN 404 EST UNE RÉCONCILIATION', () => {
  test('le retrait TIENT — restaurer « mienne » rendrait le bouton INERTE, chaque tap retombant sur le même 404', async () => {
    const queryClient = seeded([story({ currentUserReactions: [HEART] })]);
    const { transport } = scripted(() => Promise.resolve({ ok: false, status: 404, error: 'introuvable' }));

    const result = await performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });

    expect(result).toEqual({ ok: true });
    expect(cached(queryClient)?.currentUserReactions).toEqual([]);
    expect(cached(queryClient)?.reactionCount).toBe(11);
  });

  test('un AJOUT refusé en 404 se défait, LUI — la story n’existe pas, poser le cœur serait un mensonge', async () => {
    /* Le témoin de RANG de cette règle : au `remove` seul, 404 et succès
       rendent le même verdict, donc un correctif qui oublierait le sens du
       plan resterait vert. C'est l'`add` qui distingue. */
    const queryClient = seeded([story({ currentUserReactions: [] })]);
    const { transport } = scripted(() => Promise.resolve({ ok: false, status: 404, error: 'introuvable' }));

    const result = await performStoryReaction({ storyId: 'st-1', deps: deps(queryClient, transport) });

    expect(result).toEqual({ ok: false, message: STORY_REACTION_FAILED });
    expect(cached(queryClient)?.currentUserReactions).toEqual([]);
    expect(cached(queryClient)?.reactionCount).toBe(12);
  });
});

/* LE VERROU D'APPEL-EN-VOL EST UN ÉTAT DE MODULE (`inFlight`), donc PARTAGÉ
   par tous les vecteurs de ce fichier : un appel laissé en suspens
   retiendrait le tap suivant d'un AUTRE témoin. Chacun prend donc son propre
   identifiant de story, et chaque appel suspendu est relâché avant la fin. */
describe('performStoryReaction — UN geste à la fois par story ET par emoji', () => {
  test('un second tap PENDANT l’appel ne part pas — un `DELETE` croiserait le `POST` encore en route', async () => {
    const queryClient = seeded([story({ id: 'st-verrou', currentUserReactions: [] })]);
    const releases: ((r: ApiResult<unknown>) => void)[] = [];
    const { requests, transport } = scripted(() => new Promise((resolve) => releases.push(resolve)));

    const premier = performStoryReaction({ storyId: 'st-verrou', deps: deps(queryClient, transport) });
    const second = await performStoryReaction({ storyId: 'st-verrou', deps: deps(queryClient, transport) });

    expect(second).toEqual({ ok: true });
    expect(requests).toHaveLength(1);
    /* L'optimiste du PREMIER tient : le second n'a rien basculé. */
    expect(cached(queryClient, 'st-verrou')?.currentUserReactions).toEqual([HEART]);

    releases[0]?.({ ok: true, status: 201, data: {} });
    await premier;

    /* Le verrou est RENDU : le tap suivant part bien, et il RETIRE. */
    const troisieme = performStoryReaction({ storyId: 'st-verrou', deps: deps(queryClient, transport) });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.method).toBe('DELETE');
    releases[1]?.({ ok: true, status: 200, data: {} });
    await troisieme;
  });

  test('un AUTRE emoji sur la MÊME story n’est pas retenu — le verrou porte sur le COUPLE, pas sur la story', async () => {
    const queryClient = seeded([story({ id: 'st-couple', currentUserReactions: [] })]);
    const releases: ((r: ApiResult<unknown>) => void)[] = [];
    const { requests, transport } = scripted(() => new Promise((resolve) => releases.push(resolve)));

    const coeur = performStoryReaction({ storyId: 'st-couple', deps: deps(queryClient, transport) });
    const rire = performStoryReaction({ storyId: 'st-couple', emoji: '😂', deps: deps(queryClient, transport) });

    expect(requests).toHaveLength(2);
    expect(cached(queryClient, 'st-couple')?.currentUserReactions).toEqual([HEART, '😂']);

    releases.forEach((resolve) => resolve({ ok: true, status: 201, data: {} }));
    await Promise.all([coeur, rire]);
  });
});

describe('storyReactionAnnouncement — ce qu’il faut dire, et quand se taire', () => {
  test('un succès NET se tait — le cœur a déjà basculé sous le doigt', () => {
    expect(storyReactionAnnouncement({ ok: true })).toBeNull();
  });

  test('une pose NON CONFIRMÉE et un refus s’ANNONCENT, chacun par SA clé', () => {
    expect(storyReactionAnnouncement({ ok: true, notice: STORY_REACTION_PENDING })).toBe(STORY_REACTION_PENDING);
    expect(storyReactionAnnouncement({ ok: false, message: STORY_REACTION_FAILED })).toBe(STORY_REACTION_FAILED);
  });
});

/**
 * **`story:reacted` / `story:unreacted` — LE RAIL SUIT EN DIRECT (#7227, W8)**
 * — la garde de forme (`isStoryReactionEvent`) puis l'application PURE
 * (`applyStoryReactionEvent`), site unique que `socket.ts` BRANCHE par
 * `import()` (D-98). Miroir `applyServedStoryReaction` (`lib/stories/reaction.ts`).
 */
describe('isStoryReactionEvent — la garde de forme', () => {
  test('accepte une charge complète, refuse ce qui manque', () => {
    const complete = { storyId: 's-1', userId: 'u-1', emoji: '❤️', likeCount: 3, reactionSummary: {} };
    expect(isStoryReactionEvent(complete)).toBe(true);

    for (const charge of [null, {}, { ...complete, storyId: 42 }, { ...complete, likeCount: 'trois' }]) {
      expect(isStoryReactionEvent(charge)).toBe(false);
    }
  });
});

describe('applyStoryReactionEvent — application PURE sur STORY_FEED_QUERY_KEY', () => {
  test('une charge MALFORMÉE ne change rien, et ne lève pas', () => {
    const queryClient = seeded([story({ id: 'st-1', reactionCount: 2 })]);

    for (const charge of [null, {}, { storyId: 'st-1' }]) {
      expect(() => applyStoryReactionEvent(queryClient, charge, { viewerId: 'u-viewer', plan: 'add' })).not.toThrow();
    }
    expect(cached(queryClient)?.reactionCount).toBe(2);
  });

  test('un lecteur AUTRE pose le compte servi, ne remplit pas mon cœur', () => {
    const queryClient = seeded([story({ id: 'st-1', currentUserReactions: [], reactionCount: 2 })]);

    applyStoryReactionEvent(
      queryClient,
      { storyId: 'st-1', userId: 'u-other', emoji: '❤️', likeCount: 5, reactionSummary: {} },
      { viewerId: 'u-viewer', plan: 'add' },
    );

    expect(cached(queryClient)?.reactionCount).toBe(5);
    expect(cached(queryClient)?.currentUserReactions ?? []).toEqual([]);
  });

  test('le LECTEUR (autre appareil) pose le compte servi ET son cœur', () => {
    const queryClient = seeded([story({ id: 'st-1', currentUserReactions: [], reactionCount: 2 })]);

    applyStoryReactionEvent(
      queryClient,
      { storyId: 'st-1', userId: 'u-viewer', emoji: '❤️', likeCount: 3, reactionSummary: {} },
      { viewerId: 'u-viewer', plan: 'add' },
    );

    expect(cached(queryClient)?.currentUserReactions).toEqual([HEART]);
    expect(cached(queryClient)?.reactionCount).toBe(3);
  });

  test('sans corpus en cache, elle ne lève pas et n’en fabrique aucun', () => {
    const queryClient = new QueryClient();

    expect(() =>
      applyStoryReactionEvent(
        queryClient,
        { storyId: 'st-1', userId: 'u-other', emoji: '❤️', likeCount: 5, reactionSummary: {} },
        { viewerId: 'u-viewer', plan: 'add' },
      ),
    ).not.toThrow();
    expect(queryClient.getQueryData(STORY_FEED_QUERY_KEY)).toBeUndefined();
  });
});
