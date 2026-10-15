import type { FastifyReply } from 'fastify';
import type { PresentedMemberCount } from '@meeshy/shared/utils/member-visibility';
import { sendForbidden } from '../../utils/response';

/**
 * CE QU'UN INVITÉ NE VOIT PAS (#10205, directive porteur du 2026-10-11) :
 * « si on est pas utilisateur Meeshy, ne pas afficher le nombre de
 * participants ni les détails de la conversation, il ne faut pas permettre
 * d'afficher les profils utilisateurs non plus sauf les utilisateurs membres
 * de meeshy ».
 *
 * Un INVITÉ est tout lecteur sans compte Meeshy : la session d'un participant
 * entré par lien (`X-Session-Token`) comme la requête sans aucune session. Il
 * garde son fil — les noms d'auteurs voyagent avec les messages — mais ne
 * reçoit ni la liste des membres (sa propre ligne exceptée, qui porte son
 * nom), ni leur nombre, ni la fiche de qui que ce soit. La loi échoue FERMÉ :
 * un contexte absent ou incohérent est un invité.
 */

export const ACCOUNT_REQUIRED_CODE = 'ACCOUNT_REQUIRED' as const;

export type GuestViewerContext = {
  readonly type?: string;
  readonly isAuthenticated?: boolean;
  readonly isAnonymous?: boolean;
  readonly participantId?: string;
  readonly registeredUser?: unknown;
} | null | undefined;

/**
 * Un COMPTE est un contexte authentifié, non anonyme, qui se déclare `user` ou
 * porte sa ligne `User` (`registeredUser`, toujours posée par la branche JWT de
 * `middleware/auth.ts`). Tout le reste — session de lien, requête nue, `bot`,
 * contexte absent — est un invité.
 */
export function isGuestViewer(context: GuestViewerContext): boolean {
  if (!context || context.isAuthenticated !== true || context.isAnonymous === true) return true;
  if (context.type === 'anonymous' || context.type === 'bot') return true;
  return !(context.type === 'user' || context.registeredUser);
}

/** Un compte reçoit la liste entière ; un invité sa SEULE ligne ; une requête sans session, rien. */
export function membersServedToViewer<T extends { readonly id: string }>(
  members: readonly T[],
  context: GuestViewerContext,
): T[] {
  if (!isGuestViewer(context)) return [...members];
  const ownId = context?.isAuthenticated ? context.participantId : undefined;
  return ownId ? members.filter((member) => member.id === ownId) : [];
}

/** L'effectif présenté pour un compte ; AUCUNE clé pour un invité (champ absent, jamais un faux zéro). */
export function memberCountServedToViewer(
  presented: PresentedMemberCount,
  context: GuestViewerContext,
): PresentedMemberCount | Record<string, never> {
  return isGuestViewer(context) ? {} : presented;
}

/**
 * RÉTROCOMPATIBILITÉ (#9223) — le SDK iOS publié décode certains effectifs en
 * champs OBLIGATOIRES (`WorldEntry.memberCount`, `ShareLinkStats`,
 * `ShareLinkCreator.id`). À lui, une forme DÉCODABLE aux valeurs NEUTRES —
 * jamais le vrai chiffre. Le discriminant est la PLATEFORME que l'app pose sur
 * chaque requête (`X-Meeshy-Platform: ios`, `X-App-Platform: ios`), jamais la
 * VERSION : le web construit lui aussi `X-Meeshy-Version`
 * (`clientSessionHeaders`). Le web lit ces champs en optionnels et reçoit la
 * forme sans clé.
 */
export function clientDecodesLegacyCounts(headers: Readonly<Record<string, unknown>>): boolean {
  const isIos = (name: string): boolean => typeof headers[name] === 'string' && (headers[name] as string).trim().toLowerCase() === 'ios';
  return isIos('x-meeshy-platform') || isIos('x-app-platform');
}

/** Les en-têtes qui font varier la forme d'une réponse publique (`Vary`). */
export const LEGACY_COUNTS_VARY = 'X-Meeshy-Platform, X-App-Platform';

export function sendAccountRequired(reply: FastifyReply, message: string) {
  return sendForbidden(reply, 'Account required', { code: ACCOUNT_REQUIRED_CODE, message });
}
