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

export type LinkInvitation = {
  readonly title: string | null;
  readonly kind: InvitationKind | null;
  readonly inviter: LinkInviter | null;
  /**
   * `allowViewHistory` — le SEUL droit qui distingue un compte entré par ce
   * lien d'un autre membre. Ses droits d'écriture sont pleins
   * (`joinAsRegistered`, `link-admission.ts:351-371`) ; les `allowAnonymous*`
   * gouvernent un invité sans compte, que cet écran ne fait pas entrer.
   */
  readonly readsHistory: boolean;
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

const WireInvitation = z.object({
  name: optionalText,
  allowViewHistory: z.optional(z.nullable(z.boolean())),
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
