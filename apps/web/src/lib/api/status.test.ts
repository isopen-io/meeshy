import { describe, expect, test } from 'bun:test';

import { MOOD_EMOJI_MAX_LENGTH, MOOD_NOTE_MAX_LENGTH, publishStatusMood } from './status';
import { createHttpTransport } from './http';

/** Motif `stories.test.ts` — un `fetchImpl` qui recopie la forme d'une route
 * réelle et enregistre les appels reçus. */
function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: { readonly url: string; readonly init: RequestInit }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    });
  }) as typeof fetch;
  return { impl, calls };
}

const bodyOf = (init: RequestInit): Record<string, unknown> =>
  JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;

/**
 * **POSER UNE HUMEUR** (#6150) — `POST /api/v1/posts` avec `type: 'STATUS'`.
 *
 * L'adresse et la forme viennent du contrat SERVEUR, relu avant d'écrire :
 * `CreatePostSchema` (`services/gateway/src/routes/posts/types.ts:235-256`)
 * accepte `type: z.enum([… 'STATUS'])` et `moodEmoji: z.string().max(10)`, et
 * `postRoutes` est monté sous `API_PREFIX` (`route-registration.ts:288`) — donc
 * `/api/v1/posts`, jamais `/api/v1/social/posts` (celui-là est la LECTURE,
 * `?scope=statuses`). Deux adresses voisines, deux verbes : les confondre
 * rendait un 404 qu'aucun témoin de vue n'aurait vu.
 */
describe('publishStatusMood', () => {
  test('poste sur /api/v1/posts, en STATUS, avec l\'emoji', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { id: 'st-1' } } });
    await publishStatusMood({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      moodEmoji: '🎉',
    });
    expect(calls[0]?.url).toBe('/api/v1/posts');
    expect(calls[0]?.init.method).toBe('POST');
    expect(bodyOf(calls[0]?.init ?? {})).toEqual({ type: 'STATUS', moodEmoji: '🎉' });
  });

  /**
   * `hasAnyContent` (`types.ts:342-349`) EXIGE qu'au moins un champ porte
   * quelque chose — son commentaire dit pourquoi : « `POST /posts
   * { type: 'STORY' }` creait un objet » vide. Un `content` vide envoyé à
   * côté de l'emoji ne casse rien, mais il PUBLIE une chaîne vide que le fil
   * rendra ; on ne l'envoie donc que s'il porte un mot.
   */
  test('un mot vide ne part pas — jamais un `content` vide publié à côté de l\'emoji', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { id: 'st-1' } } });
    await publishStatusMood({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      moodEmoji: '🎉',
      note: '   ',
    });
    expect(bodyOf(calls[0]?.init ?? {})).toEqual({ type: 'STATUS', moodEmoji: '🎉' });
  });

  test('un mot part TAILLÉ, jamais avec ses espaces de bord', async () => {
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { id: 'st-1' } } });
    await publishStatusMood({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      moodEmoji: '🎉',
      note: '  en forme  ',
    });
    expect(bodyOf(calls[0]?.init ?? {})).toEqual({ type: 'STATUS', moodEmoji: '🎉', content: 'en forme' });
  });

  /** Les fixtures passent par le MÊME port — sinon l'écran ne peut pas être
   * piloté hors réseau, et le gate navigateur n'aurait rien à mesurer. */
  test('en fixtures, rien ne part sur le réseau et l\'accusé est positif', async () => {
    const { impl, calls } = fakeFetch({ status: 500 });
    const r = await publishStatusMood({
      source: 'fixtures',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      moodEmoji: '🎉',
    });
    expect(calls.length).toBe(0);
    expect(r.ok).toBe(true);
  });

  test('un refus du serveur REMONTE — jamais un succès fabriqué', async () => {
    const { impl } = fakeFetch({ status: 400, body: { success: false, error: 'VALIDATION_ERROR' } });
    const r = await publishStatusMood({
      source: 'gateway',
      transport: createHttpTransport({ base: '', fetchImpl: impl }),
      moodEmoji: '🎉',
    });
    expect(r.ok).toBe(false);
  });
});

/**
 * LES DEUX BORNES VIENNENT DU SERVEUR, ELLES NE SONT PAS CHOISIES ICI :
 * `moodEmoji: z.string().max(10)` et `content: z.string().max(5000)`
 * (`types.ts`). Un champ plus permissif que le serveur fabrique un refus que
 * l'utilisateur ne comprend pas ; on borne la SAISIE à ce que la route accepte.
 */
describe('les bornes de saisie', () => {
  test('l\'emoji tient dans les 10 caractères du serveur', () => {
    expect(MOOD_EMOJI_MAX_LENGTH).toBe(10);
  });

  test('le mot reste court — une humeur n\'est pas un post', () => {
    expect(MOOD_NOTE_MAX_LENGTH).toBeGreaterThan(0);
    expect(MOOD_NOTE_MAX_LENGTH).toBeLessThanOrEqual(5000);
  });
});
