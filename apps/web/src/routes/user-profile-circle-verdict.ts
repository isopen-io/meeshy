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
}): ProfileCircleView | null {
  const viewer = viewerId ?? '';
  const circle = useQuery(
    { ...profileCircleQueryOptions({ ...apiDeps, handle, viewerId: viewer }), enabled: viewerId !== null && enabled },
    appQueryClient,
  );
  const selectLink = useCallback(
    (links: readonly RelationLink[]) => linkFingerprint(links.find((candidate) => candidate.userId === personId)),
    [personId],
  );
  /* Lu, jamais demandé : la ligne du cercle charge les liens, ce crochet ne fait qu'écouter le cache. */
  const link = useQuery({ ...relationLinksQueryOptions(apiDeps), enabled: false, select: selectLink }, appQueryClient);
  const fingerprint = `${relationKind}|${link.data ?? ''}`;
  const seen = useRef(fingerprint);
  useEffect(() => {
    if (!settled || seen.current === fingerprint) return;
    seen.current = fingerprint;
    if (viewerId !== null) void appQueryClient.invalidateQueries({ queryKey: profileCircleQueryKey(handle, viewer), exact: true });
  }, [fingerprint, handle, settled, viewer, viewerId]);
  return circle.data ?? null;
}
