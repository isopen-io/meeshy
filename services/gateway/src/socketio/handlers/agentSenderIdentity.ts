import { resolveParticipantDisplayName } from '@meeshy/shared/utils/participant-helpers';

/**
 * COMMENT L'AGENT APPREND LE NOM DE L'AUTEUR (#8604).
 *
 * Les deux tuyaux d'envoi — `handleMessageSend` et
 * `handleMessageSendWithAttachments` — composaient ce couple à la main, à
 * l'identique, avec `sender?.displayName ?? sender?.user?.username`. Deux
 * défauts dans cette coalescence :
 *
 * 1. **le `displayName` du COMPTE n'était jamais consulté.** L'ordre canonique
 *    est participation → compte → pseudo ; `??` sautait le maillon du milieu
 *    pour descendre droit au handle. Un membre dont le nom vit sur son compte
 *    était annoncé `jdupont` au lieu de `Jean Dupont`.
 * 2. **une chaîne blanche passait.** `??` ne garde que `null`/`undefined` : un
 *    `displayName: ''` traversait tel quel et l'agent recevait un nom VIDE.
 *
 * Les deux premiers maillons sont la SSOT `resolveParticipantDisplayName`, dont
 * le doc-comment nomme précisément ce défaut. Le pseudo reste en DERNIER
 * recours, voulu : l'agent doit pouvoir nommer l'auteur même sans aucun nom
 * d'affichage.
 *
 * Site UNIQUE, parce que les deux tuyaux doivent nommer l'auteur de la même
 * façon : une loi écrite à deux endroits est une loi dont la version la plus
 * pauvre décide.
 */
export type AgentSenderSource = {
  readonly displayName?: string | null | undefined;
  readonly user?: { readonly displayName?: string | null | undefined; readonly username?: string | null | undefined } | null | undefined;
};

export type AgentSenderIdentity = {
  readonly senderDisplayName: string | undefined;
  readonly senderUsername: string | undefined;
};

export function agentSenderIdentity(sender: AgentSenderSource | null | undefined): AgentSenderIdentity {
  const username = sender?.user?.username ?? undefined;
  return {
    senderDisplayName: resolveParticipantDisplayName(sender) ?? username,
    senderUsername: username,
  };
}
