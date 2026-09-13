import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import { performPreferenceEdit, type PreferenceActionDeps } from './app-preferences-actions';
import { APP_PREFERENCES_QUERY_KEY, type AppPreferences } from './app-preferences';
import type { ApiResult, HttpRequest, HttpTransport } from './http';

/**
 * UN RÉGLAGE SE BASCULE EN OPTIMISTE (#5563) — CLAUDE.md § Optimistic Updates :
 * instantané → application locale → réseau → retour arrière. Le cache que
 * l'écran PEINT change avant la réponse ; un refus le rend tel qu'il était.
 * Hors ligne, rien ne part et rien ne change : le web n'a pas de file
 * d'écriture (#6325), et une bascule qui dirait « activé » sans jamais partir
 * serait un contrôle qui ment.
 */

const cached: AppPreferences = {
  theme: 'auto',
  pushEnabled: true,
  soundEnabled: true,
  showOnlineStatus: true,
  showLastSeen: true,
  showReadReceipts: true,
  showTypingIndicator: true,
};

const deferred = () => {
  const box: { resolve: (value: ApiResult<unknown>) => void } = { resolve: () => undefined };
  const promise = new Promise<ApiResult<unknown>>((resolve) => {
    box.resolve = resolve;
  });
  return { promise, resolve: (value: ApiResult<unknown>) => box.resolve(value) };
};

const depsWith = (options: {
  readonly online: boolean;
  readonly answer: Promise<ApiResult<unknown>>;
  readonly seed?: AppPreferences;
}) => {
  const queryClient = new QueryClient();
  if (options.seed !== undefined) queryClient.setQueryData(APP_PREFERENCES_QUERY_KEY, options.seed);
  const calls: HttpRequest[] = [];
  const transport = {
    request: (request: HttpRequest) => {
      calls.push(request);
      return options.answer;
    },
  } as unknown as HttpTransport;
  const deps: PreferenceActionDeps = { source: 'gateway', transport, queryClient, isOnline: () => options.online };
  return { deps, calls, read: () => queryClient.getQueryData<AppPreferences>(APP_PREFERENCES_QUERY_KEY) };
};

describe('performPreferenceEdit', () => {
  test('le cache change AVANT la réponse du serveur', async () => {
    const answer = deferred();
    const { deps, read } = depsWith({ online: true, answer: answer.promise, seed: cached });
    const pending = performPreferenceEdit({ patch: { showOnlineStatus: false }, deps });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(read()?.showOnlineStatus).toBe(false);
    answer.resolve({ ok: true, data: { privacy: { showOnlineStatus: false, showLastSeen: true, showReadReceipts: true, showTypingIndicator: true } } });
    expect(await pending).toEqual({ status: 'saved' });
  });

  /* #6342 — la valeur RETENUE du geste l'emporte sur la valeur demandée ; la
     voisine servie dans la même catégorie n'est pas adoptée (elle date du
     traitement de CETTE requête, et peut être périmée). */
  test('confirmé : le réglage du geste porte ce que le serveur a RETENU, jamais ses voisins servis', async () => {
    const { deps, read } = depsWith({
      online: true,
      seed: cached,
      answer: Promise.resolve({ ok: true, data: { notification: { pushEnabled: true, soundEnabled: false } } }),
    });
    expect(await performPreferenceEdit({ patch: { pushEnabled: false }, deps })).toEqual({ status: 'saved' });
    expect(read()).toEqual({ ...cached, pushEnabled: true });
  });

  test('refusé : le cache revient EXACTEMENT à l’instantané, et le refus se dit', async () => {
    const { deps, read } = depsWith({
      online: true,
      seed: cached,
      answer: Promise.resolve({ ok: false, status: 500, error: 'Erreur 500' }),
    });
    expect(await performPreferenceEdit({ patch: { showReadReceipts: false }, deps })).toEqual({ status: 'refused', error: 'Erreur 500' });
    expect(read()).toEqual(cached);
  });

  test('hors ligne : rien ne part, rien ne change', async () => {
    const { deps, calls, read } = depsWith({ online: false, seed: cached, answer: Promise.resolve({ ok: true, data: {} }) });
    expect(await performPreferenceEdit({ patch: { soundEnabled: false }, deps })).toEqual({ status: 'offline' });
    expect(calls).toHaveLength(0);
    expect(read()).toEqual(cached);
  });

  test('sans cache encore lu, l’écriture part quand même et ne fabrique aucune valeur', async () => {
    const { deps, calls, read } = depsWith({
      online: true,
      answer: Promise.resolve({ ok: true, data: { application: { theme: 'dark' } } }),
    });
    expect(await performPreferenceEdit({ patch: { theme: 'dark' }, deps })).toEqual({ status: 'saved' });
    expect(calls).toHaveLength(1);
    expect(read()).toBeUndefined();
  });

  /* #6342 — la passerelle sert la catégorie COMPLÈTE, telle qu'elle était quand
     elle a traité CETTE requête. Deux bascules d'une même catégorie dont les
     réponses reviennent dans l'ordre inverse : la réponse périmée ne réécrit
     jamais la voisine. */
  test('deux bascules de la même catégorie, réponses inversées : chacune garde la valeur choisie', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(APP_PREFERENCES_QUERY_KEY, cached);
    const answers = [deferred(), deferred()];
    const sent: number[] = [];
    const transport = {
      request: () => answers[sent.push(1) - 1]?.promise ?? Promise.resolve({ ok: false, status: 0, error: 'inattendu' }),
    } as unknown as HttpTransport;
    const deps: PreferenceActionDeps = { source: 'gateway', transport, queryClient, isOnline: () => true };

    const push = performPreferenceEdit({ patch: { pushEnabled: false }, deps });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const sound = performPreferenceEdit({ patch: { soundEnabled: false }, deps });
    await new Promise((resolve) => setTimeout(resolve, 0));

    answers[1]?.resolve({ ok: true, data: { notification: { pushEnabled: false, soundEnabled: false } } });
    expect(await sound).toEqual({ status: 'saved' });
    answers[0]?.resolve({ ok: true, data: { notification: { pushEnabled: false, soundEnabled: true } } });
    expect(await push).toEqual({ status: 'saved' });

    expect(queryClient.getQueryData<AppPreferences>(APP_PREFERENCES_QUERY_KEY)).toEqual({ ...cached, pushEnabled: false, soundEnabled: false });
  });
});
