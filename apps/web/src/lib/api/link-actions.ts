import type { QueryClient } from '@tanstack/react-query';

import { patchedLink } from '../links/edit-draft';
import { withLinkActive, withLinkFirst, withLinkRemoved, withLinkReplaced } from '../links/view';
import {
  createShareLinkFromDraft,
  deleteShareLink,
  setShareLinkActive,
  updateShareLink,
  SHARE_LINKS_QUERY_KEY,
  SHARE_LINKS_QUERY_PREFIX,
  validateShareLinkDraft,
  type LinksDeps,
  type MyShareLink,
  type ShareLinkDraft,
  type ShareLinkDraftField,
  type ShareLinkPatch,
  type ShareLinksData,
} from './links';

/**
 * **LES GESTES SUR SES LIENS** (#6361) — miroir `ShareLinkDetailView.toggleActive`
 * et `CreateShareLinkView.create`.
 *
 * **(Dés)activer est optimiste, avec retour arrière.** La ligne, le détail et le
 * compte des actifs lisent le MÊME cache : ils changent au tap, et reviennent à
 * l'instantané si la passerelle refuse (puis la famille se revalide). Un second
 * appel VERS LA MÊME CIBLE pendant le vol rend la MÊME promesse ; une bascule
 * CONTRAIRE à celle en vol ne part pas et rend `busy` — l'écran ne l'annonce
 * pas : rendre la promesse en vol faisait dire « Lien activé » sur un lien
 * qu'on venait de désactiver (#6418).
 *
 * **Créer attend la passerelle, et c'est délibéré** (même arbitrage que D-60).
 * Le `linkId` est attribué par le serveur : une ligne posée avant la réponse
 * mènerait à un détail qui n'existe pas, et disparaîtrait sur un 403 — un
 * contrôle qui ment le temps d'un aller-retour. Le retour instantané est le
 * bouton, qui passe « Création en cours… » au geste ; la réponse écrit le lien
 * EN TÊTE de la liste, que le détail lit aussitôt.
 *
 * **Hors ligne, rien ne part** : le web n'a pas de file d'écriture (#6325).
 */

export type LinkActionDeps = LinksDeps & {
  readonly queryClient: QueryClient;
  readonly isOnline: () => boolean;
};

export type ShareLinkActionOutcome = 'done' | 'offline' | 'failed' | 'busy';

type Flight = { readonly isActive: boolean; readonly outcome: Promise<ShareLinkActionOutcome> };

const inFlight = new Map<string, Flight>();

function once(linkId: string, isActive: boolean, run: () => Promise<ShareLinkActionOutcome>): Promise<ShareLinkActionOutcome> {
  const pending = inFlight.get(linkId);
  if (pending !== undefined) return pending.isActive === isActive ? pending.outcome : Promise.resolve('busy');
  const outcome = run().finally(() => inFlight.delete(linkId));
  inFlight.set(linkId, { isActive, outcome });
  return outcome;
}

export function performSetShareLinkActive({
  link,
  isActive,
  deps,
}: {
  readonly link: MyShareLink;
  readonly isActive: boolean;
  readonly deps: LinkActionDeps;
}): Promise<ShareLinkActionOutcome> {
  return once(link.linkId, isActive, async () => {
    if (!deps.isOnline()) return 'offline';
    const snapshot = deps.queryClient.getQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY);
    deps.queryClient.setQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY, (data) => withLinkActive(data, link.linkId, isActive));

    const result = await setShareLinkActive(deps, link.linkId, isActive);
    if (result.ok) return 'done';
    deps.queryClient.setQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY, snapshot);
    void deps.queryClient.invalidateQueries({ queryKey: SHARE_LINKS_QUERY_PREFIX });
    return 'failed';
  });
}

/**
 * **ENREGISTRER UNE MODIFICATION EST OPTIMISTE** (#7797) — la page du créateur,
 * sa carte de configuration et la ligne de la liste lisent le MÊME cache : ils
 * changent au geste, et reviennent à l'instantané si la passerelle refuse (puis
 * la famille se revalide). Un corps vide ne part pas.
 */
export type ShareLinkUpdateOutcome = 'done' | 'offline' | 'failed' | 'unchanged';

export async function performUpdateShareLink({
  link,
  patch,
  deps,
}: {
  readonly link: MyShareLink;
  readonly patch: ShareLinkPatch;
  readonly deps: LinkActionDeps;
}): Promise<ShareLinkUpdateOutcome> {
  if (Object.keys(patch).length === 0) return 'unchanged';
  if (!deps.isOnline()) return 'offline';
  const snapshot = deps.queryClient.getQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY);
  deps.queryClient.setQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY, (data) => withLinkReplaced(data, patchedLink(link, patch)));
  const result = await updateShareLink(deps, link.linkId, patch);
  if (result.ok) return 'done';
  deps.queryClient.setQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY, snapshot);
  void deps.queryClient.invalidateQueries({ queryKey: SHARE_LINKS_QUERY_PREFIX });
  return 'failed';
}

/**
 * **SUPPRIMER** (#7797) — le lien quitte la liste au geste ; un refus le remet.
 * La passerelle ne fait aujourd'hui que FERMER la ligne (`DELETE /links/:id`,
 * `admin.ts`) : une relecture ultérieure de la liste le rendra « inactif »
 * tant que #6411 n'a pas tranché la suppression réelle.
 */
export async function performDeleteShareLink({ link, deps }: { readonly link: MyShareLink; readonly deps: LinkActionDeps }): Promise<ShareLinkActionOutcome> {
  if (!deps.isOnline()) return 'offline';
  const snapshot = deps.queryClient.getQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY);
  deps.queryClient.setQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY, (data) => withLinkRemoved(data, link.linkId));
  const result = await deleteShareLink(deps, link.linkId);
  if (result.ok) return 'done';
  deps.queryClient.setQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY, snapshot);
  void deps.queryClient.invalidateQueries({ queryKey: SHARE_LINKS_QUERY_PREFIX });
  return 'failed';
}

export type CreateShareLinkOutcome =
  | { readonly status: 'created'; readonly link: MyShareLink }
  | { readonly status: 'invalid'; readonly field: ShareLinkDraftField }
  | { readonly status: 'offline' }
  | { readonly status: 'refused' }
  | { readonly status: 'error' };

export async function performCreateShareLink({
  draft,
  conversationTitle,
  deps,
  now,
}: {
  readonly draft: ShareLinkDraft;
  readonly conversationTitle: string | null;
  readonly deps: LinkActionDeps;
  readonly now: Date;
}): Promise<CreateShareLinkOutcome> {
  const verdict = validateShareLinkDraft(draft, now);
  if (!verdict.ok) return { status: 'invalid', field: verdict.field };
  if (!deps.isOnline()) return { status: 'offline' };

  const result = await createShareLinkFromDraft(deps, draft, now);
  if (!result.ok) return result.status === 403 || result.status === 410 ? { status: 'refused' } : { status: 'error' };

  const { shareLink } = result.data;
  const link: MyShareLink = {
    id: shareLink.id,
    linkId: result.data.linkId,
    identifier: null,
    name: shareLink.name,
    isActive: shareLink.isActive,
    currentUses: 0,
    maxUses: verdict.body.maxUses ?? null,
    expiresAt: shareLink.expiresAt,
    createdAt: now.toISOString(),
    conversationTitle,
    inactiveReason: shareLink.isActive ? null : 'REVOKED',
    description: shareLink.description,
    policy: {
      maxConcurrentUsers: null,
      requireAccount: verdict.body.requireAccount,
      requireNickname: verdict.body.requireNickname,
      requireEmail: verdict.body.requireEmail,
      requireBirthday: verdict.body.requireBirthday,
      allowAnonymousMessages: verdict.body.allowAnonymousMessages,
      allowAnonymousImages: verdict.body.allowAnonymousImages,
      allowAnonymousFiles: verdict.body.allowAnonymousFiles,
      allowViewHistory: verdict.body.allowViewHistory,
      allowedLanguages: [],
    },
  };
  deps.queryClient.setQueryData<ShareLinksData>(SHARE_LINKS_QUERY_KEY, (data) => withLinkFirst(data, link));
  void deps.queryClient.invalidateQueries({ queryKey: SHARE_LINKS_QUERY_PREFIX, refetchType: 'none' });
  return { status: 'created', link };
}
