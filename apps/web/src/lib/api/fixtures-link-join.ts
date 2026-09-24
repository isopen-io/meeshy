import { CONVERSATION_ID, portraitStandIn } from './fixtures-base';
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

const INVITER = { name: 'Awa Diallo', username: 'awa', avatar: null } as const;

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
  mayImages: true,
  mayFiles: false,
};

/** Un lien qui EXIGE un compte — l'état où aucune porte anonyme n'est offerte. */
const ACCOUNT_ONLY_TERMS: GuestTerms = { ...OPEN_TERMS, allowed: false, mayWrite: false, mayImages: false };

/**
 * LA PAGE D'ACCUEIL ENTIÈRE (#7796) — message d'invitation, description,
 * date de création, chiffres et langues, validité et places : l'invitation
 * « Équipe déploiement » porte tout ce que la page sait montrer SANS logo ni
 * bannière (dégradé et initiales) ; « Nova Club » porte les deux.
 */
const DEPLOIEMENT: LinkInvitation = {
  linkId: 'mshy_equipe-deploiement_7f3a',
  title: 'Équipe déploiement',
  kind: 'group',
  inviter: INVITER,
  message: 'Viens suivre la mise en production avec nous : chacun écrit dans sa langue, tout le monde lit dans la sienne.',
  group: {
    description: 'Le fil de l’équipe qui livre Meeshy — déploiements, incidents et bonnes nouvelles.',
    createdAt: '2026-09-02T09:00:00.000Z',
    avatar: null,
    banner: null,
  },
  stats: {
    people: 248,
    languages: [
      { code: 'fr', count: 72 },
      { code: 'es', count: 52 },
      { code: 'ko', count: 45 },
      { code: 'ja', count: 35 },
      { code: 'pt', count: 27 },
      { code: 'ar', count: 17 },
    ],
  },
  limits: { expiresAt: '2099-12-31T23:59:00.000Z', maxUses: 50, currentUses: 12 },
  readsHistory: false,
  guest: OPEN_TERMS,
};

const NOVA_CLUB: LinkInvitation = {
  ...DEPLOIEMENT,
  linkId: 'mshy_nova-club_k7rb',
  title: 'Nova Club',
  inviter: { name: 'Priya N.', username: 'priya.n', avatar: portraitStandIn('#fb923c', '#f43f5e') },
  message: 'Viens, on commente l’épisode de ce soir ensemble. Chacun écrit dans sa langue, tout le monde lit dans la sienne.',
  group: {
    description: 'Le club des fans de Nova, de Séoul à Dakar. Théories, extraits, sorties : on en parle tous ensemble.',
    createdAt: '2025-09-02T09:00:00.000Z',
    avatar: portraitStandIn('#312e81', '#6366f1', 'aucune'),
    banner: portraitStandIn('#7c3aed', '#c026d3', 'aucune'),
  },
  stats: { people: 3, languages: [{ code: 'fr', count: null }, { code: 'ko', count: null }] },
  limits: { expiresAt: null, maxUses: null, currentUses: 3 },
  readsHistory: true,
  guest: { ...OPEN_TERMS, emailRequired: true, languages: ['fr', 'ko', 'en'], mayFiles: true },
};

const refusal = (status: number, code: string, error: string): ApiFailure => ({ ok: false, status, error, code });

const LINKS: ReadonlyMap<string, FixtureLink> = new Map<string, FixtureLink>([
  [
    'mshy_equipe-deploiement_7f3a',
    {
      kind: 'open',
      invitation: DEPLOIEMENT,
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
      invitation: {
        ...DEPLOIEMENT,
        linkId: 'mshy_annonces_2b91',
        title: 'Annonces produit',
        kind: 'broadcast',
        message: null,
        group: { description: null, createdAt: '2026-08-02T14:30:00.000Z', avatar: null, banner: null },
        stats: { people: null, languages: [] },
        limits: { expiresAt: null, maxUses: null, currentUses: 128 },
        readsHistory: true,
        guest: ACCOUNT_ONLY_TERMS,
      },
      join: refusal(409, 'LINK_EXHAUSTED', "Ce lien a atteint sa limite d'utilisation"),
      guestJoin: refusal(403, 'ACCOUNT_REQUIRED', 'Ce lien demande un compte Meeshy'),
    },
  ],
  [
    'mshy_nova-club_k7rb',
    {
      kind: 'open',
      invitation: NOVA_CLUB,
      join: { ok: true, data: { conversationId: CONVERSATION_ID, alreadyMember: false } },
      guestJoin: {
        ok: true,
        data: { conversationId: CONVERSATION_ID, participantId: 'p-invite-nova', sessionToken: 'anon_nova', readsHistory: true, mayWrite: true },
      },
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
