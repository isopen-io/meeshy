/**
 * CE QU'UN ÉVÉNEMENT DE SÉCURITÉ SERT DE SON ACTEUR (audit L2-2, revue
 * « incomplete redaction registry », #9614).
 *
 * Un `SecurityEvent` vit sur le compte qu'il CONCERNE, mais son adresse, son
 * agent, son lieu et son empreinte sont ceux de qui a AGI — souvent quelqu'un
 * d'autre que le titulaire : le demandeur d'un transfert de numéro, la
 * personne qui demande une réinitialisation pour une adresse qu'elle ne
 * possède pas, l'auteur d'une tentative échouée.
 *
 * Le classement est FERMÉ PAR DÉFAUT : la trace ne se sert au titulaire (export
 * RGPD, `GET /me/security-events`) QUE si le type est déclaré `holder` — un
 * acte que seul le titulaire a pu accomplir (connexion réussie, réinitialisation
 * menée au bout, numéro reçu). Tout autre type, et tout type NON CLASSÉ, est
 * servi sans trace. Le témoin `security-event-actor-registry.test.ts` balaie
 * les producteurs du code et tombe sur un type non classé.
 *
 * L'administration (BIGBOSS, ADMIN, lectures journalisées) voit en plus la trace
 * d'une tentative NON PROUVÉE (`unproven`) — c'est l'enquête de sécurité —, et
 * jamais celle d'un AUTRE compte identifié (`third_party`) ni d'un type non
 * classé. Les lignes stockées ne sont pas réécrites : le masque se pose à la
 * lecture, ici et nulle part ailleurs.
 */
export type SecurityEventActor =
  /** Le titulaire, et lui seul, a pu accomplir l'acte. */
  | 'holder'
  /** Quelqu'un — titulaire ou non — l'a tenté ; rien ne prouve que ce soit le titulaire. */
  | 'unproven'
  /** Un AUTRE compte identifié a agi (transfert de numéro, revendication d'adresse). */
  | 'third_party'
  /** Le système ou l'équipe a agi ; aucune trace d'acteur n'est écrite. */
  | 'system';

export const SECURITY_EVENT_ACTORS: Readonly<Record<string, SecurityEventActor>> = {
  // Sessions (SessionService) — la confiance se pose sur une session ouverte.
  SESSION_TRUSTED: 'holder',
  SESSION_TRUSTED_FAILED: 'unproven',
  // Lien magique (MagicLinkService)
  MAGIC_LINK_LOGIN_SUCCESS: 'holder',
  MAGIC_LINK_REQUESTED: 'unproven',
  MAGIC_LINK_REUSE_ATTEMPT: 'unproven',
  MAGIC_LINK_EXPIRED: 'unproven',
  MAGIC_LINK_2FA_REQUIRED: 'unproven',
  MAGIC_LINK_2FA_INDETERMINATE: 'unproven',
  // Réinitialisation par e-mail (PasswordResetService)
  PASSWORD_RESET_SUCCESS: 'holder',
  PASSWORD_RESET_REQUEST: 'unproven',
  PASSWORD_RESET_LOCKED_ACCOUNT: 'unproven',
  PASSWORD_RESET_ABUSE: 'unproven',
  PASSWORD_RESET_INVALID_TOKEN: 'unproven',
  PASSWORD_RESET_EXPIRED_TOKEN: 'unproven',
  PASSWORD_RESET_TOKEN_REUSE: 'unproven',
  PASSWORD_RESET_REVOKED_TOKEN: 'unproven',
  RATE_LIMIT_EXCEEDED: 'unproven',
  TWO_FA_FAILED: 'unproven',
  SUSPICIOUS_PASSWORD_RESET: 'unproven',
  ACCOUNT_LOCKED: 'unproven',
  // Réinitialisation par téléphone (PhonePasswordResetService)
  PHONE_RESET_SUCCESS: 'holder',
  PHONE_RESET_RATE_LIMIT: 'unproven',
  PHONE_RESET_LOOKUP: 'unproven',
  PHONE_RESET_IDENTITY_BLOCKED: 'unproven',
  PHONE_RESET_IDENTITY_FAILED: 'unproven',
  PHONE_RESET_CODE_SENT: 'unproven',
  PHONE_RESET_CODE_BLOCKED: 'unproven',
  PHONE_RESET_CODE_FAILED: 'unproven',
  PHONE_RESET_CODE_RESENT: 'unproven',
  // Transfert de numéro (PhoneTransferService, PhonePasswordResetService)
  PHONE_TRANSFERRED_IN: 'holder',
  PHONE_TRANSFER_CODE_FAILED: 'unproven',
  PHONE_TRANSFER_CODE_RESENT: 'unproven',
  PHONE_TRANSFER_INITIATED: 'third_party',
  PHONE_TRANSFER_REGISTRATION_INITIATED: 'third_party',
  PHONE_TRANSFERRED_OUT: 'third_party',
  // Revendication d'adresse e-mail (services/auth/email-claim.ts)
  EMAIL_RELEASED_BY_CLAIM: 'third_party',
  // Système et équipe
  ACCOUNT_UNLOCKED: 'system',
  SESSION_CLOSED_BY_TEAM: 'system',
  SESSIONS_CLOSED_BY_TEAM: 'system',
};

type ActorTrace = {
  readonly eventType: string;
  readonly metadata?: unknown;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly geoLocation?: string | null;
  readonly deviceFingerprint?: string | null;
};

/**
 * La trace d'acteur ne vit pas que dans les colonnes : les producteurs la
 * recopient dans `metadata` (`requestedBy`, `ipAddress`, `pendingUsername`,
 * `claimantUserId` — audit A2-3). Un événement masqué perd donc AUSSI ses
 * métadonnées, forme libre qu'aucun lecteur ne sait trier clé par clé.
 */
const masked = <T extends ActorTrace>(event: T): T => ({
  ...event,
  ipAddress: null,
  userAgent: null,
  geoLocation: null,
  ...('deviceFingerprint' in event ? { deviceFingerprint: null } : {}),
  ...('metadata' in event ? { metadata: null } : {}),
});

/** Le titulaire voit la trace d'un acte que lui seul a pu accomplir — rien d'autre. */
export function forAccountHolder<T extends ActorTrace>(event: T): T {
  return SECURITY_EVENT_ACTORS[event.eventType] === 'holder' ? event : masked(event);
}

/** L'administration voit aussi les tentatives non prouvées ; jamais un autre compte ni un type non classé. */
export function forAdministration<T extends ActorTrace>(event: T): T {
  const actor = SECURITY_EVENT_ACTORS[event.eventType];
  return actor === 'holder' || actor === 'unproven' || actor === 'system' ? event : masked(event);
}
