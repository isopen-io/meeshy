import { useCallback, useRef } from 'react';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { GameVisibility } from '@meeshy/shared/types/game';
import { GAME_ERROR_CODES } from '@meeshy/shared/types/game-routes';

import { httpTransport, unwrap, ApiError } from '@/lib/api/client';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';
import {
  abandonDuo,
  acceptDuo,
  buySeasonSeal,
  claimSeasonStep,
  inviteToDuo,
  passToPrestige,
  setGameVisibility,
  setLeagueConsent,
  setLeaguePseudonym,
  setShowcaseOrder,
} from '@/lib/api/game-v2';
import { GAME_V2_QUERY_PREFIX, LEAGUE_WEEK_QUERY_KEY } from '@/lib/api/game-v2-queries';
import type { ApiResult, HttpTransport } from '@/lib/api/http';
import { gameErrorMessage } from '@/lib/view/game-copy';
import {
  afterAbandon,
  afterAccept,
  afterConsent,
  afterInvite,
  afterPrestige,
  afterSealBought,
  afterSeasonClaim,
  withConsentResult,
  withDuoId,
  withPseudonym,
  withShowcaseOrder,
  withVisibility,
} from '@/lib/view/game-optimistic-v2';

import { GAME_MUTATION_KEY } from './progression-game-actions';

/**
 * LES GESTES DE LA VAGUE 2 (#9481) — consentement et pseudonyme de ligue, duo,
 * saison, vitrine, visibilité, Prestige. Chacun suit la règle des gestes du jeu
 * (`progression-game-actions.ts`) :
 *
 *   capturer l'instantané → appliquer en local → envoyer → restaurer si échec
 *
 * L'identifiant d'idempotence naît UNE fois par intention et ne se renouvelle
 * qu'après un SUCCÈS (ou un conflit d'identifiant) : un retry après un échec
 * réseau rejoue la même requête, que la passerelle reconnaît — il ne devient
 * jamais une seconde écriture. Ce que le serveur seul connaît se pose à sa
 * réponse ; la relecture qui suit chaque geste rend la vérité.
 *
 * Les clés de requête du jeu (`GAME_V2_QUERY_PREFIX` : classement, ligue Amis)
 * sont invalidées avec le bloc : un consentement retiré ne laisse pas l'ancien
 * classement à l'écran.
 */

type Snapshot = { readonly snapshot: EngagementWithGame | undefined };

type Gesture<V> = {
  readonly run: (vars: V) => void;
  readonly pending: boolean;
  /** Ce que le geste en vol porte (l'étape réclamée, l'ami invité) ; `undefined` au repos. */
  readonly vars: V | undefined;
  readonly error: string | undefined;
};

const messageOf = (error: unknown): string => gameErrorMessage(error instanceof ApiError ? error.code : undefined);
const isIdConflict = (error: unknown): boolean => error instanceof ApiError && error.code === GAME_ERROR_CODES.requestIdConflict;

type Config<V, R> = {
  /** Une intention = une clé : tant qu'elle ne réussit pas, son identifiant d'idempotence est rejoué. */
  readonly intent: (vars: V) => string;
  readonly send: (transport: HttpTransport, requestId: string, vars: V) => Promise<ApiResult<R>>;
  readonly apply: (view: EngagementWithGame, vars: V) => EngagementWithGame;
  readonly land?: (view: EngagementWithGame, result: R, vars: V) => EngagementWithGame;
  /** Après l'application locale : ce que le geste retire AUTREMENT du cache (le classement d'une ligue quittée). */
  readonly afterApply?: (client: QueryClient, vars: V) => void;
};

function useGesture<V, R>(config: Config<V, R>, transport: HttpTransport): Gesture<V> {
  const client = useQueryClient();
  const ids = useRef(new Map<string, string>());
  const idFor = useCallback((intent: string): string => {
    const known = ids.current.get(intent);
    if (known !== undefined) return known;
    const fresh = newClientMessageId();
    ids.current.set(intent, fresh);
    return fresh;
  }, []);

  const mutation = useMutation<R, Error, V, Snapshot>({
    mutationKey: GAME_MUTATION_KEY,
    mutationFn: async (vars) => unwrap(await config.send(transport, idFor(config.intent(vars)), vars)),
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
      const snapshot = client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);
      if (snapshot !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, config.apply(snapshot, vars));
      config.afterApply?.(client, vars);
      return { snapshot };
    },
    onError: (error, vars, context) => {
      if (isIdConflict(error)) ids.current.delete(config.intent(vars));
      if (context?.snapshot !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, context.snapshot);
    },
    onSuccess: (result, vars) => {
      ids.current.delete(config.intent(vars));
      const land = config.land;
      const view = client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY);
      if (land !== undefined && view !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, land(view, result, vars));
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
      void client.invalidateQueries({ queryKey: GAME_V2_QUERY_PREFIX });
    },
  });

  return {
    run: (vars) => mutation.mutate(vars),
    pending: mutation.isPending,
    vars: mutation.isPending ? mutation.variables : undefined,
    error: mutation.isError ? messageOf(mutation.error) : undefined,
  };
}

export type Friend = { readonly id: string; readonly displayName: string };

export type GameV2Actions = {
  readonly consent: Gesture<{ readonly consent: boolean; readonly pseudonym?: string }>;
  readonly pseudonym: Gesture<string>;
  readonly invite: Gesture<Friend>;
  readonly accept: Gesture<string>;
  readonly abandon: Gesture<string>;
  readonly claimStep: Gesture<number>;
  readonly buySeal: Gesture<void>;
  readonly saveOrder: Gesture<readonly string[]>;
  readonly visibility: Gesture<Partial<GameVisibility>>;
  readonly prestige: Gesture<void>;
};

export function useGameV2Actions(options: { readonly transport?: HttpTransport } = {}): GameV2Actions {
  const transport = options.transport ?? httpTransport;

  const consent = useGesture<{ readonly consent: boolean; readonly pseudonym?: string }, { readonly consent: boolean; readonly pseudonym: string | null }>(
    {
      intent: (vars) => `consent:${vars.consent}:${vars.pseudonym ?? ''}`,
      send: (t, requestId, vars) => setLeagueConsent(t, { requestId, consent: vars.consent, ...(vars.pseudonym === undefined ? {} : { pseudonym: vars.pseudonym }) }),
      apply: afterConsent,
      land: (view, result) => withConsentResult(view, result),
      /* Quitter la ligue retire le classement du cache, donc du disque : les pseudonymes des autres membres ne restent pas sur
         l'appareil d'une personne qui n'y joue plus (conformité A-9). */
      afterApply: (client, vars) => {
        if (!vars.consent) client.removeQueries({ queryKey: LEAGUE_WEEK_QUERY_KEY });
      },
    },
    transport,
  );
  const pseudonym = useGesture<string, { readonly pseudonym: string }>(
    { intent: (name) => `pseudonym:${name}`, send: (t, id, name) => setLeaguePseudonym(t, id, name), apply: withPseudonym },
    transport,
  );
  const invite = useGesture<Friend, { readonly duoId: string }>(
    {
      intent: (friend) => `invite:${friend.id}`,
      send: (t, id, friend) => inviteToDuo(t, id, friend.id),
      apply: afterInvite,
      land: (view, result) => withDuoId(view, result.duoId),
    },
    transport,
  );
  const accept = useGesture<string, unknown>(
    { intent: (duoId) => `accept:${duoId}`, send: (t, id, duoId) => acceptDuo(t, id, duoId), apply: (view) => afterAccept(view) },
    transport,
  );
  const abandon = useGesture<string, unknown>(
    { intent: (duoId) => `abandon:${duoId}`, send: (t, id, duoId) => abandonDuo(t, id, duoId), apply: (view) => afterAbandon(view) },
    transport,
  );
  const claimStep = useGesture<number, unknown>(
    { intent: (step) => `claim:${step}`, send: (t, id, step) => claimSeasonStep(t, id, step), apply: afterSeasonClaim },
    transport,
  );
  const buySeal = useGesture<void, unknown>(
    { intent: () => 'seal', send: (t, id) => buySeasonSeal(t, id), apply: (view) => afterSealBought(view) },
    transport,
  );
  const saveOrder = useGesture<readonly string[], unknown>(
    { intent: (order) => `order:${order.join(',')}`, send: (t, id, order) => setShowcaseOrder(t, id, order), apply: withShowcaseOrder },
    transport,
  );
  const visibility = useGesture<Partial<GameVisibility>, unknown>(
    { intent: (patch) => `visibility:${JSON.stringify(patch)}`, send: (t, id, patch) => setGameVisibility(t, id, patch), apply: withVisibility },
    transport,
  );
  const prestige = useGesture<void, unknown>(
    { intent: () => 'prestige', send: (t, id) => passToPrestige(t, id), apply: (view) => afterPrestige(view) },
    transport,
  );

  return { consent, pseudonym, invite, accept, abandon, claimStep, buySeal, saveOrder, visibility, prestige };
}
