import { GlobalUserRole, globalRoleLevel } from '../types/role-types.js';

/**
 * **Le mode de chiffrement d'une conversation se choisit à sa CRÉATION**
 * (directive porteur du 2026-11-01).
 *
 * Le serveur chiffre toujours au repos : « sans chiffrement » n'est pas un
 * choix. Trois modes s'offrent, dans cet ordre :
 * - `server` : le choix de tous, et le défaut d'un utilisateur ordinaire ;
 * - `hybrid` : visible pour tous, il chiffre aujourd'hui comme `server` ;
 * - `e2ee` : réservé, pendant la phase de test, au rôle de plateforme qui peut
 *   déjà l'activer (`ANALYST` et plus, #12588). Il est le défaut de ces rôles
 *   LÀ OÙ IL FONCTIONNE : un tête-à-tête, sur un client qui sait chiffrer.
 *   Ailleurs (groupe, client qui ne lit pas encore le bout en bout) il paraît
 *   « bientôt » et le défaut reste `server`.
 *
 * Une conversation créée en `e2ee` ne repasse jamais en clair (#12949) : pour
 * échanger autrement, on crée une autre conversation.
 *
 * Miroirs : iOS `ConversationCreationEncryption`, Android
 * `ConversationCreationEncryption.kt` — toute évolution touche les TROIS.
 */

export const CREATION_ENCRYPTION_MODES = ['server', 'hybrid', 'e2ee'] as const;

export type CreationEncryptionMode = (typeof CREATION_ENCRYPTION_MODES)[number];

/**
 * Le mode d'une création SANS choix : un ancien client, et toute création qui
 * ne passe pas par l'écran de création (ouvrir la conversation depuis un
 * profil, un partage, un transfert). Jamais `e2ee` d'office : ces chemins
 * portent des pièces jointes que le bout en bout ne scelle pas encore.
 */
export const IMPLICIT_CREATION_ENCRYPTION_MODE: CreationEncryptionMode = 'server';

export const END_TO_END_MINIMUM_PLATFORM_ROLE = GlobalUserRole.ANALYST;

export type CreationEncryptionContext = {
  readonly platformRole: string | null | undefined;
  readonly conversationType: string;
  /** Le client qui crée sait-il lire ET écrire le bout en bout ? */
  readonly endToEndSupported: boolean;
};

export type CreationEncryptionUnavailability = 'groups-not-yet' | 'client-not-yet';

export type CreationEncryptionChoice = {
  readonly mode: CreationEncryptionMode;
  readonly available: boolean;
  readonly unavailability: CreationEncryptionUnavailability | null;
};

export type CreationEncryptionOffer = {
  readonly choices: readonly CreationEncryptionChoice[];
  readonly defaultMode: CreationEncryptionMode;
};

/** Le rôle de plateforme qui peut activer — et donc choisir — le bout en bout. */
export function mayChooseEndToEnd(platformRole: string | null | undefined): boolean {
  return globalRoleLevel(platformRole ?? '') >= globalRoleLevel(END_TO_END_MINIMUM_PLATFORM_ROLE);
}

export function isCreationEncryptionMode(value: unknown): value is CreationEncryptionMode {
  return typeof value === 'string' && (CREATION_ENCRYPTION_MODES as readonly string[]).includes(value);
}

/**
 * **Le bout en bout ne se chiffre aujourd'hui qu'en tête-à-tête** (#16113).
 * iOS et Android scellent un message pour UN correspondant (Sesame, sans
 * Sender Keys ni MLS) et le web ne détient aucune clé : un groupe `e2ee`
 * serait muet à jamais, le bout en bout ne se quittant pas (#12949). La
 * passerelle refuse donc ce mode, à la création comme à la bascule, avec
 * `ENCRYPTION_MODE_UNSUPPORTED_CODE` ; l'offre de création dit « bientôt ».
 */
export function endToEndSupportsConversationType(conversationType: string): boolean {
  return conversationType === 'direct';
}

export const ENCRYPTION_MODE_UNSUPPORTED_CODE = 'ENCRYPTION_MODE_UNSUPPORTED' as const;

export const END_TO_END_DIRECT_ONLY_MESSAGE =
  'End-to-end encryption is only available for a direct conversation for now: no Meeshy app can encrypt a group end to end yet';

function endToEndUnavailability(context: CreationEncryptionContext): CreationEncryptionUnavailability | null {
  if (!endToEndSupportsConversationType(context.conversationType)) return 'groups-not-yet';
  if (!context.endToEndSupported) return 'client-not-yet';
  return null;
}

const offered = (mode: CreationEncryptionMode): CreationEncryptionChoice => ({ mode, available: true, unavailability: null });

/** Ce que l'écran de création propose, et ce qu'il présélectionne. */
export function creationEncryptionOffer(context: CreationEncryptionContext): CreationEncryptionOffer {
  const readable = [offered('server'), offered('hybrid')];
  if (!mayChooseEndToEnd(context.platformRole)) {
    return { choices: readable, defaultMode: 'server' };
  }
  const unavailability = endToEndUnavailability(context);
  return {
    choices: [...readable, { mode: 'e2ee', available: unavailability === null, unavailability }],
    defaultMode: unavailability === null ? 'e2ee' : 'server',
  };
}
