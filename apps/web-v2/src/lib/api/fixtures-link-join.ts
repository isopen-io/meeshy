import { CONVERSATION_ID } from './fixtures-base';
import type { ApiFailure, ApiResult } from './http';
import type { LinkInvitation, LinkJoined } from './link-join';

/**
 * **LES INVITATIONS DU LECTEUR DE RECETTE** (#5561) — servies par le MÊME
 * chemin que la passerelle (`link-join.ts`, garde `__FIXTURES__ && source ===
 * 'fixtures'`), élaguées de tout build `VITE_DATA_SOURCE=gateway`
 * (`vite.config.ts § FIXTURE_MODULE`).
 *
 * Les `linkId` sont ceux de `fixtures-links.ts` : la liste des liens et l'écran
 * qu'ouvre leur adresse parlent des MÊMES liens. Chaque état de l'écran a son
 * lien : une invitation qu'on rejoint, une invitation dont la jonction est
 * refusée (lien plein), et trois liens que la lecture refuse déjà — désactivé,
 * conversation fermée, expiré. Une adresse inconnue est introuvable.
 */

type FixtureLink =
  | { readonly kind: 'open'; readonly invitation: LinkInvitation; readonly join: ApiResult<LinkJoined> }
  | { readonly kind: 'refused'; readonly refusal: ApiFailure };

const INVITER = { name: 'Awa Diallo', avatar: null } as const;

const refusal = (status: number, code: string, error: string): ApiFailure => ({ ok: false, status, error, code });

const LINKS: ReadonlyMap<string, FixtureLink> = new Map<string, FixtureLink>([
  [
    'mshy_equipe-deploiement_7f3a',
    {
      kind: 'open',
      invitation: { title: 'Équipe déploiement', kind: 'group', inviter: INVITER, readsHistory: false },
      join: { ok: true, data: { conversationId: CONVERSATION_ID, alreadyMember: false } },
    },
  ],
  [
    'mshy_annonces_2b91',
    {
      kind: 'open',
      invitation: { title: 'Annonces produit', kind: 'broadcast', inviter: INVITER, readsHistory: true },
      join: refusal(409, 'LINK_EXHAUSTED', "Ce lien a atteint sa limite d'utilisation"),
    },
  ],
  ['mshy_newsletter_5c21', { kind: 'refused', refusal: refusal(410, 'LINK_INACTIVE', "Ce lien n'est plus actif") }],
  ['mshy_salon-ete_91e2', { kind: 'refused', refusal: refusal(410, 'CONVERSATION_CLOSED', 'Cette conversation est terminée') }],
  ['mshy_atelier-juin_c4d0', { kind: 'refused', refusal: refusal(410, 'LINK_EXPIRED', 'Ce lien a expiré') }],
]);

const NOT_FOUND: ApiFailure = { ok: false, status: 404, error: 'Lien de conversation introuvable' };

export function fixtureLinkInvitation(link: string): ApiResult<LinkInvitation> {
  const entry = LINKS.get(link);
  if (entry === undefined) return NOT_FOUND;
  return entry.kind === 'open' ? { ok: true, data: entry.invitation } : entry.refusal;
}

export function fixtureJoinLink(link: string): ApiResult<LinkJoined> {
  const entry = LINKS.get(link);
  if (entry === undefined) return NOT_FOUND;
  return entry.kind === 'open' ? entry.join : entry.refusal;
}
