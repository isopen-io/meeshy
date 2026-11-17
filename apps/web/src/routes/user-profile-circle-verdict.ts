import { useCallback, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';

import { apiDeps } from '@/lib/api/deps';
import { profileCircleQueryKey, profileCircleQueryOptions } from '@/lib/api/profile-circle';
import { appQueryClient } from '@/lib/api/query-client';
import { relationLinksQueryOptions, type RelationLink } from '@/lib/api/relations';

/**
 * **LE CERCLE COMMUN, JUGÉ PAR LA PASSERELLE, ET RELU QUAND LA RELATION BOUGE** (#18879) — la paire
 * réelle, jamais recalculée ici. Le verdict se fige sinon pour la vie de l'écran : accepter une demande
 * laisserait le talkie verrouillé « dès Proche » sous une relation devenue Ami, et monter d'un cercle
 * laisserait « Notre cercle » dire le cran d'avant.
 *
 * Ce qui fait relire : la relation de la fiche (Ajouter, Accepter, Bloquer…) et le lien que la ligne
 * du cercle tient en cache (monter, descendre). La relecture attend que le geste soit RÉGLÉ (`settled`) :
 * relire pendant l'envoi lirait l'état d'avant. Un geste refusé rend la relation d'avant — l'empreinte
 * revient à celle déjà lue, et rien ne part.
 */
const linkFingerprint = (link: RelationLink | undefined): string =>
  link === undefined ? '' : `${link.effectiveLevel}/${link.grantedByMe}`;

/**
 * **UN ANCIEN SERVEUR N'EST PAS UN VERDICT EN ATTENTE** (revue #18879) — `served` : la paire jugée ;
 * `legacy` : la réponse est arrivée sans cercle (passerelle d'avant) ou rien n'a été demandé (sans
 * compte, soi, bloqué), la fiche d'avant reste juge ; `pending` : en chargement OU en échec, aucune
 * rangée qui dépend du cercle ne s'offre — jamais l'ancienne règle par défaut (fail-closed).
 */
export type CircleVerdictState = { readonly kind: 'served'; readonly view: ProfileCircleView } | { readonly kind: 'legacy' } | { readonly kind: 'pending' };

export const circleVerdictStateOf = ({
  enabled,
  status,
  data,
}: {
  readonly enabled: boolean;
  readonly status: 'pending' | 'error' | 'success';
  readonly data: ProfileCircleView | null | undefined;
}): CircleVerdictState => {
  if (!enabled) return { kind: 'legacy' };
  if (data !== null && data !== undefined) return { kind: 'served', view: data };
  return status === 'success' ? { kind: 'legacy' } : { kind: 'pending' };
};

type RelationMark = { readonly kind: string; readonly link: string | undefined };

/** Les liens qui ARRIVENT en cache ne font pas relire : seul un lien connu qui CHANGE, ou la relation de la fiche. */
export const verdictMustRefresh = (seen: RelationMark, next: RelationMark): boolean =>
  seen.kind !== next.kind || (seen.link !== undefined && next.link !== undefined && seen.link !== next.link);

/** La fiche demande la paire par pseudo, la carte par identifiant : relire l'une relit l'autre. */
export const circleVerdictKeysOf = ({ handle, personId, viewerId }: { readonly handle: string; readonly personId: string; readonly viewerId: string }) =>
  [handle, personId]
    .filter((key, index, all) => key !== '' && all.findIndex((other) => other.toLowerCase() === key.toLowerCase()) === index)
    .map((key) => profileCircleQueryKey(key, viewerId));

export function useRelationCircleVerdict({
  handle,
  viewerId,
  personId,
  relationKind,
  enabled,
  settled,
}: {
  readonly handle: string;
  readonly viewerId: string | null;
  readonly personId: string;
  readonly relationKind: string;
  readonly enabled: boolean;
  readonly settled: boolean;
}): CircleVerdictState {
  const viewer = viewerId ?? '';
  const asked = viewerId !== null && enabled;
  const circle = useQuery({ ...profileCircleQueryOptions({ ...apiDeps, handle, viewerId: viewer }), enabled: asked }, appQueryClient);
  const selectLink = useCallback(
    (links: readonly RelationLink[]) => linkFingerprint(links.find((candidate) => candidate.userId === personId)),
    [personId],
  );
  /* Lu, jamais demandé : la ligne du cercle charge les liens, ce crochet ne fait qu'écouter le cache. */
  const link = useQuery({ ...relationLinksQueryOptions(apiDeps), enabled: false, select: selectLink }, appQueryClient);
  const seen = useRef<RelationMark>({ kind: relationKind, link: link.data });
  useEffect(() => {
    if (!settled) return;
    const next: RelationMark = { kind: relationKind, link: link.data ?? seen.current.link };
    const refresh = verdictMustRefresh(seen.current, next);
    seen.current = next;
    if (!refresh || viewerId === null) return;
    circleVerdictKeysOf({ handle, personId, viewerId: viewer }).forEach((queryKey) => void appQueryClient.invalidateQueries({ queryKey, exact: true }));
  }, [relationKind, link.data, handle, personId, settled, viewer, viewerId]);
  return circleVerdictStateOf({ enabled: asked, status: circle.status, data: circle.data });
}
