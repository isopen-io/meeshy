import { CONVERSATION_ID } from './fixtures-base';
import type { ApiFailure, ApiResult } from './http';
import type { GuestJoinBody, GuestTerms, LinkGuestJoined, LinkInvitation, LinkJoined } from './link-join';

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
  | {
      readonly kind: 'open';
      readonly invitation: LinkInvitation;
      readonly join: ApiResult<LinkJoined>;
      /** Ce que la MÊME porte rend à un invité — l'issue est INDÉPENDANTE de
       * celle d'un compte : un lien peut accueillir les membres et refuser les
       * invités (`requireAccount`), et l'inverse n'existe pas. */
      readonly guestJoin: ApiResult<LinkGuestJoined>;
    }
  | { readonly kind: 'refused'; readonly refusal: ApiFailure };

const INVITER = { name: 'Awa Diallo', avatar: null } as const;

/** Les conditions par DÉFAUT d'un lien de recette : la porte anonyme ouverte,
 * un pseudo demandé, ni e-mail ni date de naissance — les défauts que la
 * passerelle applique à la création d'un lien (`links/types.ts:548-564`). */
const OPEN_TERMS: GuestTerms = {
  allowed: true,
  nicknameRequired: true,
  emailRequired: false,
  birthdayRequired: false,
  languages: [],
  mayWrite: true,
};

/** Un lien qui EXIGE un compte — l'état où aucune porte anonyme n'est offerte. */
const ACCOUNT_ONLY_TERMS: GuestTerms = { ...OPEN_TERMS, allowed: false, mayWrite: false };

const refusal = (status: number, code: string, error: string): ApiFailure => ({ ok: false, status, error, code });

const LINKS: ReadonlyMap<string, FixtureLink> = new Map<string, FixtureLink>([
  [
    'mshy_equipe-deploiement_7f3a',
    {
      kind: 'open',
      invitation: { title: 'Équipe déploiement', kind: 'group', inviter: INVITER, readsHistory: false, guest: OPEN_TERMS },
      join: { ok: true, data: { conversationId: CONVERSATION_ID, alreadyMember: false } },
      guestJoin: {
        ok: true,
        data: {
          conversationId: CONVERSATION_ID,
          participantId: 'p-invite-recette',
          sessionToken: 'anon_recette',
          readsHistory: false,
          mayWrite: true,
        },
      },
    },
  ],
  [
    'mshy_annonces_2b91',
    {
      kind: 'open',
      /* Un lien qui EXIGE un compte : l'état où le formulaire d'invité n'est
         pas offert du tout, et où seules les deux sorties restent. */
      invitation: { title: 'Annonces produit', kind: 'broadcast', inviter: INVITER, readsHistory: true, guest: ACCOUNT_ONLY_TERMS },
      join: refusal(409, 'LINK_EXHAUSTED', "Ce lien a atteint sa limite d'utilisation"),
      guestJoin: refusal(403, 'ACCOUNT_REQUIRED', 'Ce lien demande un compte Meeshy'),
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

/**
 * REJOINDRE EN INVITÉ, SANS RÉSEAU (#5561). Le pseudo `recette` est RÉSERVÉ :
 * il rejoue le refus `USERNAME_TAKEN_IN_CONVERSATION` avec sa suggestion, le
 * seul état de l'écran qu'aucun autre lien de ce corpus ne produit.
 */
export function fixtureJoinLinkAsGuest(link: string, body: GuestJoinBody): ApiResult<LinkGuestJoined> {
  const entry = LINKS.get(link);
  if (entry === undefined) return NOT_FOUND;
  if (entry.kind !== 'open') return entry.refusal;
  if (body.nickname?.trim().toLocaleLowerCase('fr') === 'recette') {
    return { ...refusal(409, 'USERNAME_TAKEN_IN_CONVERSATION', 'Ce pseudo est déjà pris ici'), suggestedNickname: 'recette2' };
  }
  if (!entry.guestJoin.ok) return entry.guestJoin;
  return { ...entry.guestJoin, data: { ...entry.guestJoin.data, mayWrite: entry.invitation.guest.mayWrite } };
}
