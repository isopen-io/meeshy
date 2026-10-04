import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import {
  AFFILIATE_QUERY_PREFIX,
  AFFILIATE_STATS_QUERY_KEY,
  AFFILIATE_TOKENS_QUERY_KEY,
  createAffiliateToken,
  deleteAffiliateToken,
  validateAffiliateTokenDraft,
  type AffiliateDraftField,
  type AffiliateToken,
  type AffiliateTokenDraft,
  type AffiliateTokensData,
  type AffiliateTokensDeps,
} from './affiliate-tokens';
import {
  createTrackingLink,
  deleteTrackingLink,
  setTrackingLinkActive,
  TRACKING_LINKS_QUERY_KEY,
  TRACKING_LINKS_QUERY_PREFIX,
  TRACKING_LINKS_SUMMARY_QUERY_KEY,
  validateTrackingLinkDraft,
  type MyTrackingLink,
  type MyTrackingLinksDeps,
  type TrackingLinkDraft,
  type TrackingLinkDraftField,
  type TrackingLinksData,
  type TrackingLinksSummary,
} from './my-tracking-links';

/**
 * **LES GESTES SUR SES LIENS DE SUIVI ET DE PARRAINAGE** (#6408, #6409) — même
 * doctrine que `link-actions.ts` pour les liens de partage.
 *
 * **(Dés)activer et supprimer sont optimistes, avec retour arrière** : la
 * ligne, le détail et les agrégats lisent le MÊME cache, changent au geste, et
 * reviennent à l'instantané si la passerelle refuse (puis la famille se
 * revalide). Une bascule CONTRAIRE à celle en vol rend `busy`.
 *
 * **Créer attend la passerelle** : le jeton est attribué par le serveur, une
 * ligne posée avant mènerait à un détail qui n'existe pas. La réponse écrit le
 * lien EN TÊTE de la liste ; les agrégats se revalident.
 *
 * **Hors ligne, rien ne part** : le web n'a pas de file d'écriture (#6325).
 */

type QueryDeps = { readonly queryClient: QueryClient; readonly isOnline: () => boolean };
export type TrackingActionDeps = MyTrackingLinksDeps & QueryDeps;
export type AffiliateActionDeps = AffiliateTokensDeps & QueryDeps;

export type LinkFamilyOutcome = 'done' | 'offline' | 'failed' | 'busy';

type Paged<T> = { readonly nextOffset: number | null } & T;

function mapPages<P extends Paged<object>>(data: InfiniteData<P, number> | undefined, map: (page: P) => P): InfiniteData<P, number> | undefined {
  return data === undefined ? undefined : { ...data, pages: data.pages.map(map) };
}

function prependFirst<P extends Paged<object>>(data: InfiniteData<P, number> | undefined, prepend: (page: P) => P, empty: P): InfiniteData<P, number> {
  if (data === undefined || data.pages.length === 0) return { pages: [prepend(empty)], pageParams: [0] };
  return { ...data, pages: data.pages.map((page, index) => (index === 0 ? prepend(page) : page)) };
}

export const withTrackingActive = (data: TrackingLinksData | undefined, token: string, isActive: boolean): TrackingLinksData | undefined =>
  mapPages(data, (page) => ({ ...page, links: page.links.map((link) => (link.token === token ? { ...link, isActive } : link)) }));

export const withTrackingRemoved = (data: TrackingLinksData | undefined, token: string): TrackingLinksData | undefined =>
  mapPages(data, (page) => ({ ...page, links: page.links.filter((link) => link.token !== token) }));

export const withTrackingFirst = (data: TrackingLinksData | undefined, created: MyTrackingLink): TrackingLinksData =>
  prependFirst(data, (page) => ({ ...page, links: [created, ...page.links.filter((link) => link.token !== created.token)] }), { links: [], nextOffset: null });

export const withAffiliateRemoved = (data: AffiliateTokensData | undefined, id: string): AffiliateTokensData | undefined =>
  mapPages(data, (page) => ({ ...page, tokens: page.tokens.filter((token) => token.id !== id) }));

export const withAffiliateFirst = (data: AffiliateTokensData | undefined, created: AffiliateToken): AffiliateTokensData =>
  prependFirst(data, (page) => ({ ...page, tokens: [created, ...page.tokens.filter((token) => token.id !== created.id)] }), { tokens: [], nextOffset: null });

const adjustActive = (summary: TrackingLinksSummary | undefined, delta: number): TrackingLinksSummary | undefined =>
  summary === undefined ? undefined : { ...summary, activeLinks: Math.max(0, summary.activeLinks + delta) };

type Flight = { readonly isActive: boolean; readonly outcome: Promise<LinkFamilyOutcome> };
const inFlight = new Map<string, Flight>();

function once(token: string, isActive: boolean, run: () => Promise<LinkFamilyOutcome>): Promise<LinkFamilyOutcome> {
  const pending = inFlight.get(token);
  if (pending !== undefined) return pending.isActive === isActive ? pending.outcome : Promise.resolve('busy');
  const outcome = run().finally(() => inFlight.delete(token));
  inFlight.set(token, { isActive, outcome });
  return outcome;
}

function restoreTracking(deps: TrackingActionDeps, list: TrackingLinksData | undefined, summary: TrackingLinksSummary | undefined): void {
  deps.queryClient.setQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY, list);
  deps.queryClient.setQueryData<TrackingLinksSummary>(TRACKING_LINKS_SUMMARY_QUERY_KEY, summary);
  void deps.queryClient.invalidateQueries({ queryKey: TRACKING_LINKS_QUERY_PREFIX });
}

export function performSetTrackingLinkActive({
  link,
  isActive,
  deps,
}: {
  readonly link: MyTrackingLink;
  readonly isActive: boolean;
  readonly deps: TrackingActionDeps;
}): Promise<LinkFamilyOutcome> {
  return once(link.token, isActive, async () => {
    if (!deps.isOnline()) return 'offline';
    const list = deps.queryClient.getQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY);
    const summary = deps.queryClient.getQueryData<TrackingLinksSummary>(TRACKING_LINKS_SUMMARY_QUERY_KEY);
    deps.queryClient.setQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY, (data) => withTrackingActive(data, link.token, isActive));
    if (link.isActive !== isActive) deps.queryClient.setQueryData<TrackingLinksSummary>(TRACKING_LINKS_SUMMARY_QUERY_KEY, (data) => adjustActive(data, isActive ? 1 : -1));
    const result = await setTrackingLinkActive(deps, link.token, isActive);
    if (result.ok) return 'done';
    restoreTracking(deps, list, summary);
    return 'failed';
  });
}

export async function performDeleteTrackingLink({ link, deps }: { readonly link: MyTrackingLink; readonly deps: TrackingActionDeps }): Promise<LinkFamilyOutcome> {
  if (!deps.isOnline()) return 'offline';
  const list = deps.queryClient.getQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY);
  const summary = deps.queryClient.getQueryData<TrackingLinksSummary>(TRACKING_LINKS_SUMMARY_QUERY_KEY);
  deps.queryClient.setQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY, (data) => withTrackingRemoved(data, link.token));
  const result = await deleteTrackingLink(deps, link.token);
  if (!result.ok) {
    restoreTracking(deps, list, summary);
    return 'failed';
  }
  void deps.queryClient.invalidateQueries({ queryKey: TRACKING_LINKS_SUMMARY_QUERY_KEY });
  return 'done';
}

export type CreateFamilyLinkOutcome<Link, Field> =
  | { readonly status: 'created'; readonly link: Link }
  | { readonly status: 'invalid'; readonly field: Field }
  | { readonly status: 'offline' }
  | { readonly status: 'conflict' }
  | { readonly status: 'error' };

export async function performCreateTrackingLink({
  draft,
  deps,
  now,
}: {
  readonly draft: TrackingLinkDraft;
  readonly deps: TrackingActionDeps;
  readonly now: Date;
}): Promise<CreateFamilyLinkOutcome<MyTrackingLink, TrackingLinkDraftField>> {
  const verdict = validateTrackingLinkDraft(draft);
  if (!verdict.ok) return { status: 'invalid', field: verdict.field };
  if (!deps.isOnline()) return { status: 'offline' };
  const result = await createTrackingLink(deps, verdict.body, now);
  if (!result.ok) return result.status === 409 ? { status: 'conflict' } : { status: 'error' };
  deps.queryClient.setQueryData<TrackingLinksData>(TRACKING_LINKS_QUERY_KEY, (data) => withTrackingFirst(data, result.data));
  void deps.queryClient.invalidateQueries({ queryKey: TRACKING_LINKS_SUMMARY_QUERY_KEY });
  return { status: 'created', link: result.data };
}

export async function performDeleteAffiliateToken({ token, deps }: { readonly token: AffiliateToken; readonly deps: AffiliateActionDeps }): Promise<LinkFamilyOutcome> {
  if (!deps.isOnline()) return 'offline';
  const snapshot = deps.queryClient.getQueryData<AffiliateTokensData>(AFFILIATE_TOKENS_QUERY_KEY);
  deps.queryClient.setQueryData<AffiliateTokensData>(AFFILIATE_TOKENS_QUERY_KEY, (data) => withAffiliateRemoved(data, token.id));
  const result = await deleteAffiliateToken(deps, token.id);
  if (result.ok) {
    void deps.queryClient.invalidateQueries({ queryKey: AFFILIATE_STATS_QUERY_KEY });
    return 'done';
  }
  deps.queryClient.setQueryData<AffiliateTokensData>(AFFILIATE_TOKENS_QUERY_KEY, snapshot);
  void deps.queryClient.invalidateQueries({ queryKey: AFFILIATE_QUERY_PREFIX });
  return 'failed';
}

export async function performCreateAffiliateToken({
  draft,
  deps,
  now,
}: {
  readonly draft: AffiliateTokenDraft;
  readonly deps: AffiliateActionDeps;
  readonly now: Date;
}): Promise<CreateFamilyLinkOutcome<AffiliateToken, AffiliateDraftField>> {
  const verdict = validateAffiliateTokenDraft(draft);
  if (!verdict.ok) return { status: 'invalid', field: verdict.field };
  if (!deps.isOnline()) return { status: 'offline' };
  const result = await createAffiliateToken(deps, verdict.body, now);
  if (!result.ok) return { status: 'error' };
  deps.queryClient.setQueryData<AffiliateTokensData>(AFFILIATE_TOKENS_QUERY_KEY, (data) => withAffiliateFirst(data, result.data));
  void deps.queryClient.invalidateQueries({ queryKey: AFFILIATE_STATS_QUERY_KEY });
  return { status: 'created', link: result.data };
}
