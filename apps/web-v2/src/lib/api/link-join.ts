import * as z from 'zod/mini';
import type { ConversationType } from '@meeshy/shared/types/conversation';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DE LA JONCTION PAR LIEN** (#5561, bascule #6702) — l'adresse
 * `/chat/:link` que la passerelle (`routes/conversations/sharing.ts:243`), iOS
 * (`ShareLinkModels.swift`), Android et la v2 elle-même (`links.ts §
 * shareLinkUrl`) émettent. Le legacy la servait ; depuis la bascule, c'est ici.
 *
 * DEUX appels, et le choix de chacun est une question de CONFIDENTIALITÉ :
 *
 * - **Lire** : `GET /api/v1/anonymous/link/:identifier` (`anonymous.ts:441-749`),
 *   l'aperçu public qu'iOS lit déjà (`AnonymousEndpoint.linkByIdentifier`). Il
 *   ne sert ni message ni participant : le lien, sa conversation (titre, type)
 *   et son créateur. `GET /api/v1/links/:identifier` (`links/retrieval.ts`)
 *   n'est JAMAIS appelé ici : sans session, il sert jusqu'à cinquante messages,
 *   les membres et les invités dès que le lien autorise l'historique, et refuse
 *   en 403 le lien qui ne l'autorise pas — il en dit trop à qui peut le lire,
 *   et rien à qui ne le peut pas.
 * - **Rejoindre** : `POST /api/v1/links/:key/members` (`link-admission.ts:723`),
 *   la porte canonique. Le compte vient de la CRÉANCE (le Bearer), jamais du
 *   corps ; le corps ne porte que la langue du compte, que la loi
 *   `allowedLanguages` juge (`link-admission.ts:445-450`).
 *
 * **L'invitation décodée est une PROJECTION** de quatre champs — ceux que
 * l'écran affiche. Identifiants, description, compteurs, langues parlées, et
 * tout ce qu'une évolution de la passerelle ajouterait à la charge restent sur
 * le fil : rien de la conversation n'atteint la mémoire du client avant que le
 * visiteur ait choisi de la rejoindre.
 */

export type LinkJoinDeps = { readonly source: DataSource; readonly transport: HttpTransport };

/** Les types que la passerelle connaît (`ConversationType`, `packages/shared`).
 * Un type hors de cette liste ne s'invente pas : l'écran le tait. */
export const INVITATION_KINDS = ['direct', 'group', 'public', 'global', 'broadcast'] as const satisfies readonly ConversationType[];
export type InvitationKind = (typeof INVITATION_KINDS)[number];

export type LinkInviter = { readonly name: string; readonly avatar: string | null };

/**
 * **CE QUE LE LIEN EXIGE ET CONCÈDE À QUI N'A PAS DE COMPTE** (#5561).
 *
 * Six valeurs que l'aperçu sert déjà (`anonymous.ts:714-743`) et que l'écran
 * doit connaître AVANT de proposer quoi que ce soit : offrir « Continuer en
 * anonyme » sur un lien qui exige un compte serait un contrôle qui ment (loi 4),
 * et demander une date de naissance qu'aucun lien n'exige coûte un champ à tout
 * le monde.
 *
 * **Elles s'ajoutent à la projection, et c'est une exception RAISONNÉE.** Le
 * reste du fichier retient tout ce que la charge transporte, parce que rien de
 * la CONVERSATION ne doit atteindre la mémoire du client avant le choix. Ces
 * six-là ne disent rien de la conversation : elles décrivent la PORTE. Les
 * compteurs, les langues parlées, les identifiants et les membres restent
 * dehors.
 *
 * **Fail-closed dans les deux sens, et les deux sens n'ont pas la même
 * direction** — une exigence absente est SUPPOSÉE (on demande le pseudo), une
 * permission absente est REFUSÉE (on ne promet ni l'entrée ni l'écriture). La
 * direction juste est celle qui ne fait pas promettre : demander un champ de
 * trop coûte une frappe, promettre une porte fermée coûte le visiteur.
 */
export type GuestTerms = {
  /** `requireAccount === false`, explicitement : sans cette valeur, aucune
   * porte anonyme n'est offerte. */
  readonly allowed: boolean;
  readonly nicknameRequired: boolean;
  readonly emailRequired: boolean;
  readonly birthdayRequired: boolean;
  /** `allowedLanguages` — VIDE signifie « toutes », jamais « aucune » : c'est
   * ce que la passerelle applique (`link-admission.ts:445-450`). */
  readonly languages: readonly string[];
  /** `allowAnonymousMessages` — l'écran le DIT avant d'entrer ; le composeur du
   * fil, lui, le relit sur les droits SERVIS (`entry.rights`). */
  readonly mayWrite: boolean;
};

export type LinkInvitation = {
  readonly title: string | null;
  readonly kind: InvitationKind | null;
  readonly inviter: LinkInviter | null;
  /**
   * `allowViewHistory` — le SEUL droit qui distingue un compte entré par ce
   * lien d'un autre membre. Ses droits d'écriture sont pleins
   * (`joinAsRegistered`, `link-admission.ts:351-371`) ; les `allowAnonymous*`
   * gouvernent un invité sans compte, et vivent dans `guest` ci-dessous.
   */
  readonly readsHistory: boolean;
  readonly guest: GuestTerms;
};

export type LinkJoined = { readonly conversationId: string; readonly alreadyMember: boolean };

/**
 * CE QUE L'ÉCRAN DIT D'UN REFUS — une cause, jamais un statut HTTP.
 *
 * `session-expired` n'est pas un code de la passerelle : c'est le verdict que
 * ce port pose quand une jonction demandée par un compte revient servie EN
 * INVITÉ (voir `joinLinkAsMember`).
 */
export type LinkRefusal =
  | 'not-found'
  | 'revoked'
  | 'expired'
  | 'closed'
  | 'full'
  | 'language'
  | 'banned'
  | 'region'
  | 'account-required'
  | 'session-expired'
  | 'rate-limited'
  | 'offline'
  | 'unavailable';

const UNREADABLE_INVITATION = 'UNREADABLE_INVITATION';
const UNREADABLE_JOIN = 'UNREADABLE_JOIN';
const JOINED_AS_GUEST = 'JOINED_AS_GUEST';

const optionalText = z.optional(z.nullable(z.string()));

const optionalFlag = z.optional(z.nullable(z.boolean()));

const WireInvitation = z.object({
  name: optionalText,
  allowViewHistory: optionalFlag,
  requireAccount: optionalFlag,
  requireNickname: optionalFlag,
  requireEmail: optionalFlag,
  requireBirthday: optionalFlag,
  allowAnonymousMessages: optionalFlag,
  allowedLanguages: z.optional(z.nullable(z.array(z.string()))),
  conversation: z.object({ title: optionalText, type: optionalText }),
  creator: z.optional(
    z.nullable(
      z.object({
        username: optionalText,
        firstName: optionalText,
        lastName: optionalText,
        displayName: optionalText,
        avatar: optionalText,
      }),
    ),
  ),
});

type WireCreator = z.infer<typeof WireInvitation>['creator'];

const WireJoined = z.object({
  conversationId: z.string().check(z.minLength(1)),
  sessionToken: optionalText,
  entry: z.optional(z.nullable(z.object({ outcome: optionalText }))),
});

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/** Le nom de l'invitant, dans l'ordre de `ShareLinkCreator.name` d'iOS
 * (`ShareLinkModels.swift:41-43`) : le nom affiché, puis prénom et nom, puis
 * le pseudo. Un créateur sans aucun nom lisible n'est pas un invitant qu'on
 * peut nommer — l'invitation reste lisible, sans lui. */
function inviterOf(creator: WireCreator): LinkInviter | null {
  if (creator === undefined || creator === null) return null;
  const fullName = [creator.firstName, creator.lastName]
    .map(textOrNull)
    .filter((part): part is string => part !== null)
    .join(' ');
  const name = textOrNull(creator.displayName) ?? textOrNull(fullName) ?? textOrNull(creator.username);
  return name === null ? null : { name, avatar: textOrNull(creator.avatar) };
}

export function decodeLinkInvitation(raw: unknown): LinkInvitation | null {
  const parsed = WireInvitation.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    title: textOrNull(wire.conversation.title) ?? textOrNull(wire.name),
    kind: INVITATION_KINDS.find((kind) => kind === wire.conversation.type) ?? null,
    inviter: inviterOf(wire.creator),
    readsHistory: wire.allowViewHistory === true,
    guest: {
      allowed: wire.requireAccount === false,
      // Une EXIGENCE absente est supposée (le défaut serveur de
      // `requireNickname` est vrai, `links/types.ts:548-564`) ; une PERMISSION
      // absente est refusée. Voir le doc-comment de `GuestTerms`.
      nicknameRequired: wire.requireNickname !== false,
      emailRequired: wire.requireEmail === true,
      birthdayRequired: wire.requireBirthday === true,
      languages: (wire.allowedLanguages ?? []).map((code) => code.trim()).filter((code) => code !== ''),
      mayWrite: wire.allowAnonymousMessages === true,
    },
  };
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadLinkInvitation(
  params: LinkJoinDeps & { readonly link: string; readonly signal?: AbortSignal },
): Promise<ApiResult<LinkInvitation>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureLinkInvitation } = await import('./fixtures-link-join');
    return fixtureLinkInvitation(params.link);
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/anonymous/link/${encodeURIComponent(params.link)}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const invitation = decodeLinkInvitation(result.data);
  return invitation === null
    ? { ok: false, status: 0, error: 'Invitation illisible', code: UNREADABLE_INVITATION }
    : { ok: true, data: invitation };
}

/**
 * REJOINDRE EN TANT QUE COMPTE.
 *
 * **Une réponse qui remet un `sessionToken` n'est pas une jonction de membre.**
 * La porte est en authentification OPTIONNELLE : un Bearer expiré ou invalide
 * fait lever `jwt.verify` (`middleware/auth.ts:264`), l'erreur est avalée et le
 * contexte retombe NON AUTHENTIFIÉ (`auth.ts:772-780`), l'identité est dérivée
 * « invité » (`link-admission.ts:102-109`) et la passerelle crée un participant
 * ANONYME (`joinAsGuest`) — sans le 401 qui aurait fermé la session côté
 * client. Le jeton d'invité n'est remis QU'à cette branche
 * (`link-admission.ts:683`) : sa présence prouve que le compte n'a pas été
 * reconnu. Le port refuse donc d'y voir un succès ; le mettre de côté aurait
 * mené l'utilisateur dans un fil où il n'est pas membre sous son nom.
 */
export async function joinLinkAsMember(
  deps: LinkJoinDeps,
  params: { readonly link: string; readonly language: string | null },
): Promise<ApiResult<LinkJoined>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureJoinLink } = await import('./fixtures-link-join');
    return fixtureJoinLink(params.link);
  }
  const language = textOrNull(params.language);
  const result = await deps.transport.request<unknown>({
    method: 'POST',
    path: `/api/v1/links/${encodeURIComponent(params.link)}/members`,
    body: language === null ? {} : { language },
  });
  if (!result.ok) return result;
  const parsed = WireJoined.safeParse(result.data);
  if (!parsed.success) return { ok: false, status: 0, error: 'Jonction illisible', code: UNREADABLE_JOIN };
  if (textOrNull(parsed.data.sessionToken) !== null) {
    return { ok: false, status: 0, error: 'Session expirée', code: JOINED_AS_GUEST };
  }
  return {
    ok: true,
    data: { conversationId: parsed.data.conversationId, alreadyMember: parsed.data.entry?.outcome === 'already-member' },
  };
}

/* ========================================================================= *
 *  REJOINDRE SANS COMPTE (#5561)
 * ========================================================================= */

/**
 * CE QUE LE VISITEUR SAISIT — le brouillon de l'écran, jamais le corps envoyé.
 *
 * `birthday` est un JOUR (`AAAA-MM-JJ`, ce que rend `<input type="date">`) ; la
 * passerelle attend un INSTANT ISO (`z.iso.datetime()`,
 * `link-admission.ts:629-635`). La conversion est faite ici, une fois, plutôt
 * que par l'écran : un champ de date qui envoie sa propre valeur au format du
 * serveur est la jumelle qui diverge au premier écran de plus.
 */
export type GuestDraft = {
  readonly nickname: string;
  readonly email: string;
  readonly birthday: string;
  readonly language: string;
};

export type GuestField = 'nickname' | 'email' | 'birthday' | 'language';

/** Le corps EXACT de `POST /links/:key/members` pour un invité — `language` a
 * un défaut serveur (`'fr'`), les trois autres sont OMIS quand ils sont vides,
 * jamais envoyés à `''` : le schéma accepte `''` pour `email`/`birthday`, mais
 * envoyer du vide là où la clé peut être absente demande au serveur de
 * distinguer deux formes qui disent la même chose. */
export type GuestJoinBody = {
  readonly language: string;
  readonly nickname?: string;
  readonly email?: string;
  readonly birthday?: string;
};

export type GuestDraftValidation =
  | { readonly ok: true; readonly body: GuestJoinBody }
  | { readonly ok: false; readonly field: GuestField };

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const DAY_SHAPE = /^\d{4}-\d{2}-\d{2}$/u;

/**
 * LE REFUS DE SAISIE SE CONNAÎT AVANT L'ALLER-RETOUR — miroir
 * `validateCommunityDraft` (`api/communities.ts`).
 *
 * C'est ce qui permet à l'écran de tenir la promesse de #5561 : « un refus de
 * SAISIE se pose SUR SON CHAMP ». La passerelle rend un 400 sans nommer le
 * champ quand une exigence n'est pas satisfaite (`link-admission.ts:671-720`) ;
 * deviner lequel après coup serait un mensonge une fois sur trois.
 */
export function validateGuestDraft(draft: GuestDraft, terms: GuestTerms): GuestDraftValidation {
  const nickname = draft.nickname.trim();
  const email = draft.email.trim();
  const birthday = draft.birthday.trim();
  const language = draft.language.trim();

  if (terms.nicknameRequired && nickname === '') return { ok: false, field: 'nickname' };
  if (terms.emailRequired && email === '') return { ok: false, field: 'email' };
  if (email !== '' && !EMAIL_SHAPE.test(email)) return { ok: false, field: 'email' };
  if (terms.birthdayRequired && birthday === '') return { ok: false, field: 'birthday' };
  if (birthday !== '' && !DAY_SHAPE.test(birthday)) return { ok: false, field: 'birthday' };
  if (language === '') return { ok: false, field: 'language' };
  if (terms.languages.length > 0 && !terms.languages.includes(language)) return { ok: false, field: 'language' };

  return {
    ok: true,
    body: {
      language,
      ...(nickname === '' ? {} : { nickname }),
      ...(email === '' ? {} : { email }),
      ...(birthday === '' ? {} : { birthday: `${birthday}T00:00:00.000Z` }),
    },
  };
}

/**
 * CE QUE LA PASSERELLE REMET À UN INVITÉ — le jeton de session compris.
 *
 * `sessionToken` est le régime `X-Session-Token` (`http.ts § Credential`), remis
 * UNE fois et jamais rejoué : le perdre, c'est perdre la participation.
 */
export type LinkGuestJoined = {
  readonly conversationId: string;
  readonly participantId: string | null;
  readonly sessionToken: string;
  readonly readsHistory: boolean;
  readonly mayWrite: boolean;
};

const WireGuestJoined = z.object({
  conversationId: z.string().check(z.minLength(1)),
  participantId: optionalText,
  sessionToken: z.string().check(z.minLength(1)),
  entry: z.optional(
    z.nullable(
      z.object({
        canViewHistory: optionalFlag,
        rights: z.optional(z.nullable(z.object({ canSendMessages: optionalFlag }))),
      }),
    ),
  ),
});

const UNREADABLE_GUEST_JOIN = 'UNREADABLE_GUEST_JOIN';
const MEMBER_NOT_GUEST = 'MEMBER_NOT_GUEST';

/**
 * REJOINDRE EN INVITÉ — la MÊME porte que `joinLinkAsMember`
 * (`POST /links/:key/members`, auth OPTIONNELLE), avec le corps de l'invité.
 *
 * **L'alias `POST /anonymous/join/:linkId` n'est PAS appelé** : il est déprécié
 * depuis le 2026-08-30 au profit de celle-ci, et il exige en plus un prénom et
 * un nom que la porte canonique ne demande pas — deux champs de moins à faire
 * remplir à quelqu'un qui veut juste lire un fil.
 *
 * **Une réponse SANS jeton de session n'est pas une jonction d'invité**, exactement
 * comme sa jumelle refuse l'inverse : la porte est en authentification
 * optionnelle, donc un Bearer encore valide dans le transport ferait entrer le
 * COMPTE sous son nom pendant que l'écran croit créer un invité. Le port refuse
 * de s'en accommoder plutôt que de rendre une session d'invité qui n'existe pas.
 */
export async function joinLinkAsGuest(
  deps: LinkJoinDeps,
  params: { readonly link: string; readonly body: GuestJoinBody },
): Promise<ApiResult<LinkGuestJoined>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureJoinLinkAsGuest } = await import('./fixtures-link-join');
    return fixtureJoinLinkAsGuest(params.link, params.body);
  }
  const result = await deps.transport.request<unknown>({
    method: 'POST',
    path: `/api/v1/links/${encodeURIComponent(params.link)}/members`,
    body: params.body,
  });
  if (!result.ok) return result;
  const parsed = WireGuestJoined.safeParse(result.data);
  if (!parsed.success) {
    const asMember = WireJoined.safeParse(result.data);
    return asMember.success
      ? { ok: false, status: 0, error: 'Rejoint sous un compte, pas en invité', code: MEMBER_NOT_GUEST }
      : { ok: false, status: 0, error: 'Jonction illisible', code: UNREADABLE_GUEST_JOIN };
  }
  const wire = parsed.data;
  return {
    ok: true,
    data: {
      conversationId: wire.conversationId,
      participantId: textOrNull(wire.participantId),
      sessionToken: wire.sessionToken,
      readsHistory: wire.entry?.canViewHistory === true,
      mayWrite: wire.entry?.rights?.canSendMessages === true,
    },
  };
}

/** Le code du refus de pseudo, tel que la passerelle le pose (`link-admission.ts:778-787`). */
export const NICKNAME_TAKEN = 'USERNAME_TAKEN_IN_CONVERSATION';

/**
 * **LES DEUX FAMILLES DE REFUS, ET POURQUOI ELLES NE SE CONFONDENT PAS** (#5561).
 *
 * - `input` — ce que le visiteur peut CORRIGER ici même : le formulaire est
 *   GARDÉ, le message se pose sur le champ visé (`field`), et `suggestion`
 *   pré-remplit un pseudo libre quand la passerelle en propose un.
 * - `link` — ce que rien ne corrigera : le formulaire est RETIRÉ, un bandeau
 *   dit la cause, et les deux sorties (se connecter, créer un compte) restent.
 *
 * Les confondre fait réessayer quelqu'un dont le lien est mort, ou abandonner
 * quelqu'un dont le pseudo était juste pris.
 *
 * **`LANGUAGE_NOT_ALLOWED` est un refus de SAISIE**, bien qu'il arrive en 403 :
 * la langue est un champ de ce formulaire, et le visiteur peut en choisir une
 * autre. Le ranger avec les refus du lien retirerait le formulaire au moment
 * précis où il suffit d'y toucher.
 *
 * **`field: null`** — un 400 que la passerelle ne rattache à aucun champ. Le
 * formulaire reste (c'est bien une saisie qu'elle refuse), mais le message se
 * pose AU-DESSUS : le placer sous un champ deviné serait faux une fois sur
 * trois.
 */
export type GuestJoinRefusal =
  | { readonly on: 'input'; readonly field: GuestField | null; readonly suggestion: string | null }
  | { readonly on: 'link'; readonly refusal: LinkRefusal };

const GUEST_FIELDS: readonly GuestField[] = ['nickname', 'email', 'birthday', 'language'];

export function guestRefusalOf(
  failure: Pick<ApiFailure, 'status' | 'code' | 'field' | 'suggestedNickname'>,
): GuestJoinRefusal {
  if (failure.code === NICKNAME_TAKEN) {
    return { on: 'input', field: 'nickname', suggestion: textOrNull(failure.suggestedNickname) };
  }
  if (failure.code === 'LANGUAGE_NOT_ALLOWED') return { on: 'input', field: 'language', suggestion: null };
  if (failure.status === 400) {
    return { on: 'input', field: GUEST_FIELDS.find((name) => name === failure.field) ?? null, suggestion: null };
  }
  return { on: 'link', refusal: linkRefusalOf(failure) };
}

/** Une `Map` et non un objet littéral : un code inconnu comme `toString` ne
 * doit pas trouver une méthode du prototype à sa place. */
const REFUSAL_BY_CODE: ReadonlyMap<string, LinkRefusal> = new Map<string, LinkRefusal>([
  ['LINK_DEACTIVATED', 'revoked'],
  ['LINK_INACTIVE', 'revoked'],
  ['LINK_EXPIRED', 'expired'],
  ['CONVERSATION_CLOSED', 'closed'],
  ['LINK_EXHAUSTED', 'full'],
  ['LINK_MAX_USES', 'full'],
  ['LANGUAGE_NOT_ALLOWED', 'language'],
  ['BANNED', 'banned'],
  ['REGION_NOT_ALLOWED', 'region'],
  ['ACCOUNT_REQUIRED', 'account-required'],
  [JOINED_AS_GUEST, 'session-expired'],
]);

/**
 * LE REFUS SE LIT SUR SON CODE (#5561). Deux mêmes statuts disent des causes
 * différentes — un 410 est un lien désactivé, expiré OU une conversation
 * fermée ; un 403, une langue refusée OU un bannissement — et un même code
 * voyage sous deux statuts selon la porte (`LINK_MAX_USES` en 410 à la
 * lecture, `LINK_EXHAUSTED` en 409 à la jonction).
 *
 * Le statut ne sert QUE là où la passerelle ne pose AUCUN code, mesuré :
 * `sendNotFound` (`anonymous.ts:614,624`, `link-admission.ts:661`) et le
 * limiteur global (`rate-limiter.ts:136-141`). Un code posé mais inconnu reste
 * `unavailable` : deviner sa cause à son statut, c'est dire à l'utilisateur
 * quelque chose que la passerelle n'a pas dit.
 *
 * **Hors ligne = aucune réponse ET aucun code.** Le transport rend aussi
 * `status: 0` pour un délai dépassé (`TIMEOUT`, `http.ts § DÉLAI DE GARDE`) :
 * une passerelle qui accepte la connexion puis se tait n'est pas un réseau
 * coupé, et « vous êtes hors ligne » y serait un conseil faux.
 */
export function linkRefusalOf(failure: Pick<ApiFailure, 'status' | 'code'>): LinkRefusal {
  if (failure.code !== undefined) return REFUSAL_BY_CODE.get(failure.code) ?? 'unavailable';
  if (failure.status === 404) return 'not-found';
  if (failure.status === 429) return 'rate-limited';
  if (failure.status === 0) return 'offline';
  return 'unavailable';
}
