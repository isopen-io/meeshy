import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'bun:test';

import { STATUS_MOODS_QUERY_KEY, type StatusMoodPost } from './stories';
import { performMoodPost } from './status-actions';
import { createHttpTransport } from './http';

/**
 * **POSER UNE HUMEUR, INSTANTANÉMENT** (#6150) — motif
 * `performPreferenceEdit` (`app-preferences-actions.ts`) : instantané, écriture
 * locale, réseau, retour arrière sur refus.
 *
 * La pastille du rail LIT `STATUS_MOODS_QUERY_KEY` : sans l'écriture locale,
 * l'emoji n'apparaîtrait qu'au retour du réseau — une action sans feedback
 * immédiat est un bug, pas une dette (§ Roadmap, dimension 4).
 */
function fakeFetch(response: { readonly status: number; readonly body?: unknown }) {
  const calls: { readonly url: string }[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    calls.push({ url: String(input) });
    return new Response(response.body === undefined ? null : JSON.stringify(response.body), {
      status: response.status,
    });
  }) as typeof fetch;
  return { impl, calls };
}

const deps = (options: {
  readonly queryClient: QueryClient;
  readonly online?: boolean;
  readonly fetchImpl: typeof fetch;
}) => ({
  source: 'gateway' as const,
  transport: createHttpTransport({ base: '', fetchImpl: options.fetchImpl }),
  queryClient: options.queryClient,
  viewerId: 'u-moi',
  isOnline: () => options.online ?? true,
});

const moodsIn = (qc: QueryClient): readonly StatusMoodPost[] =>
  qc.getQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY) ?? [];

describe('performMoodPost', () => {
  test('mon humeur est dans le cache AVANT que le réseau réponde', async () => {
    const qc = new QueryClient();
    qc.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, []);
    const { impl } = fakeFetch({ status: 200, body: { success: true, data: { id: 'st-1' } } });

    const enVol = performMoodPost({ moodEmoji: '🎉', deps: deps({ queryClient: qc, fetchImpl: impl }) });
    expect(moodsIn(qc)[0]?.moodEmoji).toBe('🎉');
    await enVol;
  });

  test('un succès laisse mon humeur en place', async () => {
    const qc = new QueryClient();
    qc.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, []);
    const { impl } = fakeFetch({ status: 200, body: { success: true, data: { id: 'st-1' } } });

    const out = await performMoodPost({ moodEmoji: '🎉', deps: deps({ queryClient: qc, fetchImpl: impl }) });
    expect(out.status).toBe('saved');
    expect(moodsIn(qc)[0]?.moodEmoji).toBe('🎉');
  });

  /** Un refus qui LAISSE l'humeur affichée ment sur l'état du serveur : la
   * prochaine lecture la ferait disparaître sans que personne ne l'explique. */
  test('un refus REMET le cache exactement comme il était', async () => {
    const qc = new QueryClient();
    const avant: readonly StatusMoodPost[] = [{ id: 'st-0', authorId: 'u-moi', moodEmoji: '☕' }];
    qc.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, avant);
    const { impl } = fakeFetch({ status: 400, body: { success: false, error: 'VALIDATION_ERROR' } });

    const out = await performMoodPost({ moodEmoji: '🎉', deps: deps({ queryClient: qc, fetchImpl: impl }) });
    expect(out.status).toBe('refused');
    expect(moodsIn(qc)).toEqual(avant);
  });

  /** Mon humeur PRÉCÉDENTE ne doit pas rester devant la nouvelle : la pastille
   * lit la PREMIÈRE ligne de mon auteur (corpus trié `createdAt desc`). */
  test('une nouvelle humeur passe devant l\'ancienne', async () => {
    const qc = new QueryClient();
    qc.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, [
      { id: 'st-0', authorId: 'u-moi', moodEmoji: '☕' },
    ]);
    const { impl } = fakeFetch({ status: 200, body: { success: true, data: { id: 'st-1' } } });

    await performMoodPost({ moodEmoji: '🎉', deps: deps({ queryClient: qc, fetchImpl: impl }) });
    expect(moodsIn(qc)[0]?.moodEmoji).toBe('🎉');
  });

  /** L'humeur d'un AUTRE ne bouge pas — l'écriture locale est la mienne seule. */
  test('les humeurs des autres restent intactes', async () => {
    const qc = new QueryClient();
    qc.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, [
      { id: 'st-ines', authorId: 'u-ines', moodEmoji: '💪' },
    ]);
    const { impl } = fakeFetch({ status: 200, body: { success: true, data: { id: 'st-1' } } });

    await performMoodPost({ moodEmoji: '🎉', deps: deps({ queryClient: qc, fetchImpl: impl }) });
    const apres = moodsIn(qc);
    expect(apres.find((m) => m.authorId === 'u-ines')?.moodEmoji).toBe('💪');
  });

  /**
   * HORS LIGNE : on ne PROMET rien qu'on ne puisse tenir. Rien ne part, le
   * cache ne bouge pas, et l'écran a un état à dessiner — c'est la dégradation
   * gracieuse du § Instant App Principles, pas un échec silencieux.
   */
  test('hors ligne, rien ne part et rien ne change', async () => {
    const qc = new QueryClient();
    qc.setQueryData<readonly StatusMoodPost[]>(STATUS_MOODS_QUERY_KEY, []);
    const { impl, calls } = fakeFetch({ status: 200, body: { success: true, data: { id: 'st-1' } } });

    const out = await performMoodPost({
      moodEmoji: '🎉',
      deps: deps({ queryClient: qc, fetchImpl: impl, online: false }),
    });
    expect(out.status).toBe('offline');
    expect(calls.length).toBe(0);
    expect(moodsIn(qc)).toEqual([]);
  });

  /** Un cache VIDE (jamais chargé) ne doit pas empêcher la pose : c'est le cas
   * NOMINAL d'un premier lancement, et le plus facile à rater. */
  test('sans cache préalable, mon humeur s\'écrit quand même', async () => {
    const qc = new QueryClient();
    const { impl } = fakeFetch({ status: 200, body: { success: true, data: { id: 'st-1' } } });

    await performMoodPost({ moodEmoji: '🎉', deps: deps({ queryClient: qc, fetchImpl: impl }) });
    expect(moodsIn(qc)[0]?.moodEmoji).toBe('🎉');
  });
});
