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

/** Le mode qu'un appelant SANS choix (ancien client) reçoit : le serveur chiffre toujours. */
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

function endToEndUnavailability(context: CreationEncryptionContext): CreationEncryptionUnavailability | null {
  if (context.conversationType !== 'direct') return 'groups-not-yet';
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

/**
 * Le mode d'une création qui ne passe pas par l'écran de création (ouvrir la
 * conversation avec quelqu'un depuis son profil, un partage, une réponse) :
 * le défaut de l'offre.
 */
export function implicitCreationEncryptionMode(context: CreationEncryptionContext): CreationEncryptionMode {
  return creationEncryptionOffer(context).defaultMode;
}
