import { useCallback, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { GameMintPreview, MissionRerollResponse } from '@meeshy/shared/types/game';

import { GAME_ERROR_CODES } from '@meeshy/shared/types/game-routes';

import { httpTransport, unwrap, ApiError } from '@/lib/api/client';
import { newClientMessageId } from '@/lib/api/client-message-id';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, mintMeesh, type EngagementWithGame, type MeeshMintResult } from '@/lib/api/engagement';
import { buyFlameFreeze, claimChest, relightFlame, rerollMission } from '@/lib/api/game';
import type { HttpTransport } from '@/lib/api/http';
import { gameErrorMessage } from '@/lib/view/game-copy';
import {
  afterChestOpening,
  afterFreeze,
  afterMint,
  afterRelight,
  afterReroll,
  withChestReward,
  withRelit,
  withRerolled,
} from '@/lib/view/game-optimistic';

import type { MintCelebration } from '@/components/game-mint-preview';

/**
 * LES GESTES DU JEU (#9383) — frappe, changement de mission, coffre, gel,
 * rallumage. Chacun suit la même règle (§ Instant App Principles) :
 *
 *   capturer l'instantané → appliquer en local → envoyer → restaurer si échec
 *
 * L'identifiant d'idempotence est généré UNE fois par intention et ne se
 * renouvelle qu'après un SUCCÈS : un retry après échec réseau rejoue la même
 * requête (la passerelle la reconnaît), il ne devient jamais une seconde
 * frappe — c'est la raison d'être de l'identifiant (#5743).
 *
 * Ce que le serveur seul connaît (la mission tirée, le contenu du coffre, la
 * série rallumée) n'est jamais deviné : il se pose à la réponse. La relecture
 * qui suit chaque geste rend la vérité.
 */

export type GameActions = {
  readonly mint: () => void;
  readonly reroll: (missionId: string) => void;
  readonly claimChest: () => void;
  readonly buyFreeze: () => void;
  readonly relight: () => void;
  readonly pending: {
    readonly mint: boolean;
    readonly rerollId: string | null;
    readonly chest: boolean;
    readonly freeze: boolean;
    readonly relight: boolean;
  };
  readonly errors: {
    readonly mint?: string;
    readonly reroll?: string;
    readonly chest?: string;
    readonly freeze?: string;
    readonly relight?: string;
  };
  /** La dernière pièce frappée, pour la scène ; `null` tant qu'aucune n'a été frappée depuis l'ouverture. */
  readonly celebration: MintCelebration | null;
};

type Snapshot = { readonly snapshot: EngagementWithGame | undefined };

/**
 * La clé commune des gestes du jeu : tant qu'un geste est EN VOL, la lecture
 * en cache est l'optimiste — le guide et les propositions de photo attendent
 * qu'il soit réglé pour célébrer (un geste refusé ne se célèbre pas).
 */
export const GAME_MUTATION_KEY = ['game', 'gesture'] as const;

const messageOf = (error: unknown): string => gameErrorMessage(error instanceof ApiError ? error.code : undefined);

/** Un identifiant que la passerelle dit déjà pris par UNE AUTRE écriture ne sert plus : le prochain geste en génère un neuf. */
const isIdConflict = (error: unknown): boolean => error instanceof ApiError && error.code === GAME_ERROR_CODES.requestIdConflict;

export function useGameActions(
  options: { readonly transport?: HttpTransport; readonly onMinted?: (result: MeeshMintResult) => void } = {},
): GameActions {
  const transport = options.transport ?? httpTransport;
  const client = useQueryClient();
  const ids = useRef(new Map<string, string>());
  const [celebration, setCelebration] = useState<MintCelebration | null>(null);
  const celebrations = useRef(0);

  const idFor = useCallback((key: string): string => {
    const known = ids.current.get(key);
    if (known !== undefined) return known;
    const fresh = newClientMessageId();
    ids.current.set(key, fresh);
    return fresh;
  }, []);
  const spent = useCallback((key: string) => void ids.current.delete(key), []);

  const read = useCallback(() => client.getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY), [client]);
  const write = useCallback(
    (update: (view: EngagementWithGame) => EngagementWithGame) => {
      const view = read();
      if (view !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, update(view));
    },
    [client, read],
  );
  const begin = useCallback(
    async (apply: (view: EngagementWithGame) => EngagementWithGame): Promise<Snapshot> => {
      await client.cancelQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY });
      const snapshot = read();
      write(apply);
      return { snapshot };
    },
    [client, read, write],
  );
  const restore = useCallback(
    (context: Snapshot | undefined) => {
      if (context?.snapshot !== undefined) client.setQueryData(ENGAGEMENT_PROGRESS_QUERY_KEY, context.snapshot);
    },
    [client],
  );
  const refresh = useCallback(() => void client.invalidateQueries({ queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY }), [client]);

  const mint = useMutation<MeeshMintResult, Error, void, Snapshot & { readonly preview: GameMintPreview | undefined }>({
    mutationKey: GAME_MUTATION_KEY,
    mutationFn: async () => unwrap(await mintMeesh(transport, idFor('mint'))),
    onMutate: async () => {
      const preview = read()?.game?.mint;
      return { ...(await begin(afterMint)), preview };
    },
    onError: (error, _vars, context) => {
      if (isIdConflict(error)) spent('mint');
      restore(context);
    },
    onSuccess: (result, _vars, context) => {
      spent('mint');
      options.onMinted?.(result);
      if (result.status === 'minted') {
        celebrations.current += 1;
        const number = result.number ?? context?.preview?.number;
        const edition = result.edition ?? context?.preview?.edition;
        if (number !== undefined && edition !== undefined) setCelebration({ number, edition, key: celebrations.current });
      }
    },
    onSettled: refresh,
  });

  const reroll = useMutation<MissionRerollResponse, Error, string, Snapshot>({
    mutationKey: GAME_MUTATION_KEY,
    mutationFn: async (missionId) => unwrap(await rerollMission(transport, missionId, idFor(`reroll:${missionId}`))),
    onMutate: () => begin(afterReroll),
    onError: (error, missionId, context) => {
      if (isIdConflict(error)) spent(`reroll:${missionId}`);
      restore(context);
    },
    onSuccess: (result, missionId) => {
      spent(`reroll:${missionId}`);
      write((view) => withRerolled(view, missionId, result.mission, result.balance));
    },
    onSettled: refresh,
  });

  const chest = useMutation({
    mutationKey: GAME_MUTATION_KEY,
    mutationFn: async () => unwrap(await claimChest(transport, idFor('chest'))),
    onMutate: () => begin(afterChestOpening),
    onError: (error, _vars, context: Snapshot | undefined) => {
      if (isIdConflict(error)) spent('chest');
      restore(context);
    },
    onSuccess: (result) => {
      spent('chest');
      write((view) => withChestReward(view, result.reward, result.score));
    },
    onSettled: refresh,
  });

  const freeze = useMutation({
    mutationKey: GAME_MUTATION_KEY,
    mutationFn: async () => unwrap(await buyFlameFreeze(transport, idFor('freeze'))),
    onMutate: () => begin(afterFreeze),
    onError: (error, _vars, context: Snapshot | undefined) => {
      if (isIdConflict(error)) spent('freeze');
      restore(context);
    },
    onSuccess: () => spent('freeze'),
    onSettled: refresh,
  });

  const relight = useMutation({
    mutationKey: GAME_MUTATION_KEY,
    mutationFn: async () => unwrap(await relightFlame(transport, idFor('relight'))),
    onMutate: () => begin(afterRelight),
    onError: (error, _vars, context: Snapshot | undefined) => {
      if (isIdConflict(error)) spent('relight');
      restore(context);
    },
    onSuccess: (result) => {
      spent('relight');
      write((view) => withRelit(view, result.streak, result.balance));
    },
    onSettled: refresh,
  });

  return {
    mint: () => mint.mutate(),
    reroll: (missionId) => reroll.mutate(missionId),
    claimChest: () => chest.mutate(),
    buyFreeze: () => freeze.mutate(),
    relight: () => relight.mutate(),
    pending: {
      mint: mint.isPending,
      rerollId: reroll.isPending ? reroll.variables ?? null : null,
      chest: chest.isPending,
      freeze: freeze.isPending,
      relight: relight.isPending,
    },
    errors: {
      ...(mint.isError ? { mint: messageOf(mint.error) } : {}),
      ...(reroll.isError ? { reroll: messageOf(reroll.error) } : {}),
      ...(chest.isError ? { chest: messageOf(chest.error) } : {}),
      ...(freeze.isError ? { freeze: messageOf(freeze.error) } : {}),
      ...(relight.isError ? { relight: messageOf(relight.error) } : {}),
    },
    celebration,
  };
}
