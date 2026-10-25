/**
 * LE RÉGIME DE CHIFFREMENT D'UNE CONVERSATION EST COMMUTABLE (#12522).
 *
 * Spécification : `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md`
 * § 5. Activer et désactiver basculent le régime ; chaque bascule incrémente
 * `Conversation.encryptionEpoch` (absent = 0, conversation jamais basculée).
 *
 * **La bascule est UNE écriture conditionnelle (#12521).** Elle n'aboutit que
 * si l'époque est encore celle que l'appelant a lue : deux bascules
 * concurrentes lisent la même époque, MongoDB n'en applique qu'une à son
 * document, l'autre trouve l'époque déjà avancée et rend `null`
 * (`E2EE_REGIME_CHANGED`). Lire puis écrire `encryptionEnabledAt`, comme le
 * faisait l'activation, laissait deux activations poser deux modes.
 *
 * Désactiver ne touche ni `serverEncryptionKeyId` (les messages `server` ou
 * `hybrid` déjà écrits restent lisibles par leur clé), ni les messages `e2ee`
 * déjà envoyés : ils restent chiffrés à jamais, et la désactivation n'envoie
 * aucun clair au serveur (§ 5.2).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

export type ConversationEncryptionMode = 'e2ee' | 'server' | 'hybrid';

export const ENCRYPTION_ALREADY_ENABLED_CODE = 'ENCRYPTION_ALREADY_ENABLED' as const;
export const ENCRYPTION_NOT_ENABLED_CODE = 'ENCRYPTION_NOT_ENABLED' as const;

export type RegimeFields = {
  readonly encryptionMode: string | null;
  readonly encryptionEnabledAt: Date | null;
  readonly encryptionEnabledBy?: string | null;
  readonly encryptionEpoch?: number | null;
};

/** L'époque d'un régime : un document jamais basculé n'a pas le champ, il vaut 0. */
export const regimeEpochOf = (regime: { readonly encryptionEpoch?: number | null } | null | undefined): number =>
  regime?.encryptionEpoch ?? 0;

/**
 * Le régime est actif dès qu'il a un mode OU une date d'activation : la
 * bascule écrit les deux ensemble, et une anomalie (l'un sans l'autre) reste
 * fermée — elle se désactive, elle ne se réactive pas par-dessus.
 * `encryptionEnabledAt` garde sa sémantique pour les anciens clients.
 */
export const regimeIsActive = (regime: RegimeFields): boolean =>
  Boolean(regime.encryptionMode) || Boolean(regime.encryptionEnabledAt);

/**
 * Le filtre de l'époque lue. Un document jamais basculé n'a PAS le champ, et
 * `{ encryptionEpoch: 0 }` ne l'apparie pas sous MongoDB : l'époque 0 se lit
 * « absent, nul ou zéro ».
 */
export function epochFilter(epoch: number): Record<string, unknown> {
  if (epoch !== 0) return { encryptionEpoch: epoch };
  return { OR: [{ encryptionEpoch: { isSet: false } }, { encryptionEpoch: null }, { encryptionEpoch: 0 }] };
}

export type RegimeActivation = {
  readonly mode: ConversationEncryptionMode;
  readonly protocol: string;
  readonly enabledBy: string;
  readonly serverEncryptionKeyId: string | null;
};

export type RegimeSwitch = {
  readonly conversationId: string;
  readonly observedEpoch: number;
  /** Le régime à poser, ou `null` pour désactiver. */
  readonly target: RegimeActivation | null;
  readonly at: Date;
};

export type SwitchedRegime = {
  readonly epoch: number;
  readonly mode: ConversationEncryptionMode | null;
  readonly enabledAt: Date | null;
  readonly enabledBy: string | null;
};

function switchData(change: RegimeSwitch): Record<string, unknown> {
  const epoch = change.observedEpoch + 1;
  if (!change.target) {
    return { encryptionMode: null, encryptionProtocol: null, encryptionEnabledAt: null, encryptionEnabledBy: null, encryptionEpoch: epoch };
  }
  return {
    encryptionMode: change.target.mode,
    encryptionProtocol: change.target.protocol,
    encryptionEnabledAt: change.at,
    encryptionEnabledBy: change.target.enabledBy,
    serverEncryptionKeyId: change.target.serverEncryptionKeyId,
    encryptionEpoch: epoch,
  };
}

/** Bascule le régime si l'époque n'a pas bougé depuis sa lecture ; `null` sinon. */
export async function switchEncryptionRegime(
  prisma: Pick<PrismaClient, 'conversation'>,
  change: RegimeSwitch,
): Promise<SwitchedRegime | null> {
  const { count } = await prisma.conversation.updateMany({
    where: { id: change.conversationId, ...epochFilter(change.observedEpoch) },
    data: switchData(change),
  } as never);
  if (count !== 1) return null;
  return {
    epoch: change.observedEpoch + 1,
    mode: change.target?.mode ?? null,
    enabledAt: change.target ? change.at : null,
    enabledBy: change.target?.enabledBy ?? null,
  };
}

export type EncryptionStatusView = {
  readonly isEncrypted: boolean;
  readonly mode: string | null;
  readonly enabledAt: Date | null;
  readonly enabledBy: string | null;
  readonly canTranslate: boolean;
  readonly epoch: number;
  readonly canToggleEncryption: boolean;
};

/** Ce que `encryption-status` et les deux bascules servent : un ancien client n'en lit que les cinq premiers champs. */
export function encryptionStatusView(
  regime: RegimeFields,
  options: { readonly canToggleEncryption: boolean },
): EncryptionStatusView {
  const mode = regime.encryptionMode;
  return {
    isEncrypted: Boolean(regime.encryptionEnabledAt),
    mode,
    enabledAt: regime.encryptionEnabledAt,
    enabledBy: regime.encryptionEnabledBy ?? null,
    canTranslate: mode === 'server' || mode === 'hybrid',
    epoch: regimeEpochOf(regime),
    canToggleEncryption: options.canToggleEncryption,
  };
}
