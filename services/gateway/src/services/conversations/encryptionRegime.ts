/**
 * LE RÉGIME DE CHIFFREMENT D'UNE CONVERSATION (#12522, #12949).
 *
 * Spécification : `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md`
 * § 5. Chaque bascule incrémente `Conversation.encryptionEpoch` (absent = 0,
 * conversation jamais basculée).
 *
 * **UNE CONVERSATION CHIFFRÉE DE BOUT EN BOUT NE REPASSE JAMAIS EN CLAIR**
 * (décision porteur du 2026-10-25, #12949). Pour revenir au clair, on crée une
 * autre conversation. Ce fichier est l'UNIQUE écrivain du régime (garde de
 * source `e2ee-irreversible-write-guard.test.ts`), et sa condition MongoDB ne
 * laisse quitter que le clair ou le chiffrement au repos (`server`, `hybrid`,
 * que le serveur lit déjà) : un document `e2ee`, quelle que soit sa casse, ou
 * d'un mode inconnu, n'est réécrit par AUCUNE bascule, même concurrente, même
 * appelée par un site qui aurait oublié de regarder le mode.
 *
 * **La bascule est UNE écriture conditionnelle (#12521).** Elle n'aboutit que
 * si l'époque est encore celle que l'appelant a lue : deux bascules
 * concurrentes lisent la même époque, MongoDB n'en applique qu'une à son
 * document, l'autre trouve l'époque déjà avancée et rend `null`
 * (`E2EE_REGIME_CHANGED`). Lire puis écrire `encryptionEnabledAt`, comme le
 * faisait l'activation, laissait deux activations poser deux modes.
 *
 * Désactiver ne touche ni `serverEncryptionKeyId` (les messages `server` ou
 * `hybrid` déjà écrits restent lisibles par leur clé — et une activation e2ee
 * ne l'efface pas davantage, #12822), ni les messages `e2ee`
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

/** Les seuls régimes ACTIFS qu'une bascule peut quitter : ceux que le serveur lit déjà. */
export const LEAVABLE_ACTIVE_MODES = ['server', 'hybrid'] as const;

export const isEndToEndMode = (mode: string | null | undefined): boolean =>
  typeof mode === 'string' && mode.toLowerCase() === 'e2ee';

/** Le régime est-il de bout en bout ? La casse d'un ancien client n'y change rien. */
export const regimeIsEndToEnd = (regime: Pick<RegimeFields, 'encryptionMode'>): boolean => isEndToEndMode(regime.encryptionMode);

/**
 * Un régime ACTIF se quitte-t-il ? Seulement s'il est exactement `server` ou
 * `hybrid` : le bout en bout ne se quitte jamais, et une anomalie (mode
 * inconnu, date d'activation sans mode) reste fermée.
 */
export const regimeMayBeLeft = (regime: RegimeFields): boolean =>
  (LEAVABLE_ACTIVE_MODES as readonly string[]).includes(regime.encryptionMode ?? '');

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
    // #12822 (M1) — une activation sans clé (e2ee) ne remet jamais la
    // désignation à null : les messages `server`/`hybrid` déjà scellés sous
    // elle doivent rester lisibles, et une réactivation la reprendra.
    ...(change.target.serverEncryptionKeyId ? { serverEncryptionKeyId: change.target.serverEncryptionKeyId } : {}),
    encryptionEpoch: epoch,
  };
}

/**
 * Le filtre de ce qu'une bascule a le droit de réécrire : le clair (mode
 * absent ou nul) ou le chiffrement au repos. Une liste POSITIVE — une négation
 * (`not: 'e2ee'`) écarterait le document sans le champ et laisserait passer
 * `E2EE` ou un mode inconnu.
 */
const LEAVABLE_FILTER: Record<string, unknown> = {
  OR: [{ encryptionMode: { isSet: false } }, { encryptionMode: null }, { encryptionMode: { in: [...LEAVABLE_ACTIVE_MODES] } }],
};

/**
 * Bascule le régime si l'époque n'a pas bougé depuis sa lecture ET si le
 * régime courant se quitte ; `null` sinon. Une conversation `e2ee` ne se
 * réécrit vers aucun régime (#12949).
 */
export async function switchEncryptionRegime(
  prisma: Pick<PrismaClient, 'conversation'>,
  change: RegimeSwitch,
): Promise<SwitchedRegime | null> {
  const { count } = await prisma.conversation.updateMany({
    where: { id: change.conversationId, AND: [epochFilter(change.observedEpoch), LEAVABLE_FILTER] },
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
  readonly canDisableEncryption: boolean;
};

/**
 * Ce que `encryption-status` et les deux bascules servent : un ancien client
 * n'en lit que les cinq premiers champs. `mayToggle` est la politique de rôle
 * (#12588) ; le régime la borne : une conversation `e2ee` ne se bascule ni ne
 * se désactive, pour personne (#12949), et seul `server` ou `hybrid` se
 * désactive.
 */
export function encryptionStatusView(
  regime: RegimeFields,
  options: { readonly mayToggle: boolean },
): EncryptionStatusView {
  const mode = regime.encryptionMode;
  const active = regimeIsActive(regime);
  const mayDisable = options.mayToggle && regimeMayBeLeft(regime);
  return {
    isEncrypted: Boolean(regime.encryptionEnabledAt),
    mode,
    enabledAt: regime.encryptionEnabledAt,
    enabledBy: regime.encryptionEnabledBy ?? null,
    canTranslate: mode === 'server' || mode === 'hybrid',
    epoch: regimeEpochOf(regime),
    canToggleEncryption: active ? mayDisable : options.mayToggle,
    canDisableEncryption: mayDisable,
  };
}
