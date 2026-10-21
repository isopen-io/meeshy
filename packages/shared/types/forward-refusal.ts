/**
 * LE MOTIF STABLE D'UN TRANSFERT REFUSÉ (#9598).
 *
 * La passerelle (`services/gateway/.../forwardAdmission.ts`) refuse un
 * transfert avec l'un de ces codes, posé en `code` à côté d'`error` — sur la
 * réponse REST (400) comme sur l'accusé socket. Les clients disent le refus
 * dans la langue du lecteur depuis ce code, jamais depuis la phrase française
 * d'`error`, qui reste servie pour les anciens clients.
 *
 * Les trois premiers existaient déjà comme donnée (et le web les lisait sous
 * `code`) ; ils ne changent pas d'orthographe.
 *
 * - `ENCRYPTED_SOURCE` (D7, #10949) : la source vit dans une conversation
 *   CHIFFRÉE, ou porte un contenu chiffré — la passerelle n'en recopie jamais
 *   rien. Le transfert passe par le CLIENT, qui renvoie lui-même le contenu
 *   (rechiffré pour une destination chiffrée, en clair après avertissement
 *   pour une destination qui ne l'est pas).
 * - `ATTACHMENT_NOT_IN_SOURCE` (#9914) : `forwardedAttachmentIds` nomme une
 *   pièce que le message source ne porte pas.
 */
export const FORWARD_REFUSAL_CODES = {
  VIEW_ONCE: 'view-once-not-forwardable',
  EPHEMERAL: 'ephemeral-not-forwardable',
  SOURCE_UNAVAILABLE: 'forward-source-unavailable',
  ENCRYPTED_SOURCE: 'encrypted-source-not-server-copyable',
  ATTACHMENT_NOT_IN_SOURCE: 'forwarded-attachment-not-in-source',
} as const;

export type ForwardRefusalCode = (typeof FORWARD_REFUSAL_CODES)[keyof typeof FORWARD_REFUSAL_CODES];

const KNOWN: ReadonlySet<string> = new Set(Object.values(FORWARD_REFUSAL_CODES));

export const isForwardRefusalCode = (value: unknown): value is ForwardRefusalCode =>
  typeof value === 'string' && KNOWN.has(value);
