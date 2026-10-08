/**
 * CE QU'UN ÉVÉNEMENT DE SÉCURITÉ SERT DE SON ACTEUR (audit L2-2, #9614).
 *
 * Un `SecurityEvent` vit sur le compte qu'il CONCERNE, mais son adresse, son
 * agent et son lieu sont ceux de qui a AGI. Pour trois événements, l'acteur
 * n'est pas le titulaire : le transfert d'un numéro de téléphone est demandé
 * par un AUTRE compte, et l'événement posé sur le compte du détenteur porte
 * l'adresse du demandeur (`PhoneTransferService`, `PhonePasswordResetService`).
 * Servir cette trace au détenteur — par l'export RGPD, sa propre lecture, ou
 * l'administration — livrerait l'adresse et le lieu d'un TIERS.
 *
 * L'événement reste servi (le titulaire doit savoir qu'on a demandé son
 * numéro), sans la trace de l'acteur. Les lignes stockées ne sont pas
 * réécrites : la redaction se fait à la lecture, à un seul endroit.
 */
export const THIRD_PARTY_ACTOR_EVENT_TYPES: ReadonlySet<string> = new Set([
  'PHONE_TRANSFER_INITIATED',
  'PHONE_TRANSFER_REGISTRATION_INITIATED',
  'PHONE_TRANSFERRED_OUT',
]);

type ActorTrace = {
  readonly eventType: string;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly geoLocation?: string | null;
  readonly deviceFingerprint?: string | null;
};

export function withoutThirdPartyTrace<T extends ActorTrace>(event: T): T {
  if (!THIRD_PARTY_ACTOR_EVENT_TYPES.has(event.eventType)) return event;
  return {
    ...event,
    ipAddress: null,
    userAgent: null,
    geoLocation: null,
    ...('deviceFingerprint' in event ? { deviceFingerprint: null } : {}),
  };
}
