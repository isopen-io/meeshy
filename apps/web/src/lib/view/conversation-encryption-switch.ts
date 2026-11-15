import type { StoreApi } from 'zustand/vanilla';

import {
  CREATION_ENCRYPTION_MODES,
  type CreationEncryptionMode,
  type CreationEncryptionUnavailability,
} from '@meeshy/shared/utils/conversation-creation-encryption';

import type { ApiResult } from '@/lib/api/http';
import type { ConversationEncryptionCatalogKey } from '@/lib/i18n-conversation-encryption-catalog';
import { WEB_END_TO_END_SUPPORTED } from '@/lib/conversation-new/encryption';
import { endToEndRegimeLedger, isEndToEndMode, type EndToEndRegimeState } from '@/lib/end-to-end-regime-ledger';

import { encryptionRegime } from './conversation-encryption-explanation';

/**
 * **CHANGER LE CHIFFREMENT D'UNE CONVERSATION DEPUIS LE WEB** (#14648) — même
 * route et même droit que `ConversationEncryptionModeSwitch` (iOS,
 * `ConversationEncryptionActivationPolicy.swift`) : au droit que la passerelle
 * SERT (`canToggleEncryption` : rôle de plateforme, appartenance et, dans un
 * groupe, rang de modérateur), une conversation que le serveur lit change de
 * mode par `POST /conversations/:id/encryption` : clair → serveur ou hybride,
 * serveur ↔ hybride (le retour hybride → serveur est permis, décision
 * porteur #14663). Seule la sortie du bout en bout est interdite.
 *
 * FERMÉ PAR DÉFAUT, dans cet ordre :
 * - le bout en bout ne se quitte jamais (#12949) : servi, VU par ce compte
 *   (registre `endToEndRegimeLedger`) ou d'un mode inconnu, aucune cible n'est
 *   proposée et aucune requête ne part ; un `409 E2EE_IRREVERSIBLE` scelle la
 *   conversation ;
 * - le navigateur ne demande jamais le bout en bout tant que #12975 n'est pas
 *   tranchée (`WEB_END_TO_END_SUPPORTED`) : la cible s'affiche, grisée, et le
 *   POST est refusé localement ;
 * - le mode servi ne se repropose pas, et le clair n'est jamais une cible
 *   (`CREATION_ENCRYPTION_MODES` ne le porte pas) ; un POST vers le mode servi
 *   est refusé localement ;
 * - une passerelle qui ne sert pas le droit ne l'accorde pas.
 */

export type EncryptionSwitchTarget = {
  readonly mode: CreationEncryptionMode;
  readonly available: boolean;
  readonly unavailability: CreationEncryptionUnavailability | null;
};

const currentModeOf = (servedMode: string | null | undefined): CreationEncryptionMode | null => {
  const regime = encryptionRegime(servedMode);
  return regime === 'server' || regime === 'hybrid' ? regime : null;
};

const isLeavable = (servedMode: string | null | undefined): boolean => encryptionRegime(servedMode) !== 'end-to-end';

/**
 * #14664 — CE QUI FERME LE GESTE, la source unique de la fiche et du geste :
 * `sealed` (servie e2ee, d'un mode inconnu ou vue e2ee par ce compte) ou
 * `held` (le fil affiché retient l'envoi, #13099, sans rien apprendre). Une
 * conversation retenue n'est pas « chiffrée de bout en bout » : elle se tait
 * sans le prétendre.
 */
export type EncryptionSwitchLock = 'sealed' | 'held';

export function encryptionSwitchLock(
  state: Pick<EndToEndRegimeState, 'sealed' | 'held'>,
  input: { readonly conversationId: string; readonly servedMode: string | null | undefined },
): EncryptionSwitchLock | null {
  if (isEndToEndMode(input.servedMode) || !isLeavable(input.servedMode) || state.sealed[input.conversationId] === true) return 'sealed';
  return state.held[input.conversationId] === true ? 'held' : null;
}

const isMove = (servedMode: string | null | undefined, target: CreationEncryptionMode): boolean => target !== currentModeOf(servedMode);

export function encryptionSwitchTargets(params: {
  readonly servedMode: string | null | undefined;
  readonly sealed: boolean;
  readonly mayToggle: boolean;
}): readonly EncryptionSwitchTarget[] {
  if (params.sealed || !params.mayToggle || !isLeavable(params.servedMode)) return [];
  return CREATION_ENCRYPTION_MODES.filter((mode) => isMove(params.servedMode, mode)).map((mode) =>
    mode === 'e2ee' && !WEB_END_TO_END_SUPPORTED
      ? { mode, available: false, unavailability: 'client-not-yet' as const }
      : { mode, available: true, unavailability: null },
  );
}

export type EncryptionStatus = {
  readonly mode: string | null;
  readonly canToggleEncryption: boolean;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

/** Sans zod : le socle partagé de zod est à son plafond de poids (`budgets.json`). */
export function decodeEncryptionStatus(raw: unknown): EncryptionStatus | null {
  if (!isRecord(raw)) return null;
  const { mode, canToggleEncryption } = raw;
  if (mode !== undefined && mode !== null && typeof mode !== 'string') return null;
  if (canToggleEncryption !== undefined && canToggleEncryption !== null && typeof canToggleEncryption !== 'boolean') return null;
  return { mode: mode ?? null, canToggleEncryption: canToggleEncryption === true };
}

export type EncryptionSwitchRefusal =
  | 'irreversible'
  | 'held'
  | 'regime-changed'
  | 'restricted'
  | 'forbidden'
  | 'unavailable'
  | 'offline'
  | 'failed'
  | 'refused';

export type EncryptionSwitchOutcome =
  | { readonly kind: 'switched'; readonly mode: CreationEncryptionMode }
  | { readonly kind: EncryptionSwitchRefusal };

export type EncryptionSwitchPorts = {
  readonly online: () => boolean;
  readonly post: (mode: CreationEncryptionMode) => Promise<ApiResult<unknown>>;
  /** Le mode que le serveur vient de servir : l'hôte le pose dans ses caches, sans jamais rouvrir le clair. */
  readonly learn: (mode: CreationEncryptionMode) => void;
  readonly ledger?: StoreApi<EndToEndRegimeState>;
};

const servedModeOf = (data: unknown): CreationEncryptionMode | null => {
  const mode = decodeEncryptionStatus(data)?.mode?.trim().toLowerCase();
  return CREATION_ENCRYPTION_MODES.find((candidate) => candidate === mode) ?? null;
};

/**
 * Les codes de `E2EE_ERROR_CODES` (`@meeshy/shared/types/e2ee-directory`),
 * recopiés : ce module tire le `zod` CLASSIQUE, et le chunk `zod` du web est à
 * son plafond (`budgets.json`). Le témoin les épingle contre la source.
 */
export const SWITCH_REFUSAL_CODES = {
  irreversible: 'E2EE_IRREVERSIBLE',
  regimeChanged: 'E2EE_REGIME_CHANGED',
} as const;

const REFUSALS: Readonly<Record<string, EncryptionSwitchRefusal>> = {
  [SWITCH_REFUSAL_CODES.irreversible]: 'irreversible',
  [SWITCH_REFUSAL_CODES.regimeChanged]: 'regime-changed',
  ENCRYPTION_ALREADY_ENABLED: 'regime-changed',
  ENCRYPTION_ACTIVATION_RESTRICTED: 'restricted',
};

const refusalOf = (status: number, code: string | undefined): EncryptionSwitchRefusal => {
  const known = code === undefined ? undefined : REFUSALS[code];
  if (known !== undefined) return known;
  if (status === 403) return 'forbidden';
  if (status === 503) return 'unavailable';
  return 'failed';
};

export async function switchConversationEncryption(
  ports: EncryptionSwitchPorts,
  params: { readonly conversationId: string; readonly servedMode: string | null | undefined; readonly target: CreationEncryptionMode },
): Promise<EncryptionSwitchOutcome> {
  const ledger = ports.ledger ?? endToEndRegimeLedger;
  const sealEndToEnd = (): EncryptionSwitchOutcome => {
    ledger.getState().learnEndToEnd(params.conversationId);
    ports.learn('e2ee');
    return { kind: 'irreversible' };
  };
  const lock = encryptionSwitchLock(ledger.getState(), { conversationId: params.conversationId, servedMode: params.servedMode });
  if (lock === 'sealed') return { kind: 'irreversible' };
  if (lock === 'held') return { kind: 'held' };
  if (params.target === 'e2ee' && !WEB_END_TO_END_SUPPORTED) return { kind: 'refused' };
  if (!isMove(params.servedMode, params.target)) return { kind: 'refused' };
  if (!ports.online()) return { kind: 'offline' };

  const result = await ports.post(params.target).catch(() => null);
  if (result === null) return { kind: 'failed' };
  if (!result.ok) {
    const kind = refusalOf(result.status, result.code);
    return kind === 'irreversible' ? sealEndToEnd() : { kind };
  }
  const served = servedModeOf(result.data);
  if (served === null) return { kind: 'failed' };
  if (served === 'e2ee') {
    ledger.getState().learnEndToEnd(params.conversationId);
  }
  ports.learn(served);
  return { kind: 'switched', mode: served };
}

/**
 * LE GESTE tel que la fiche le reçoit — l'hôte qui connaît la passerelle le
 * fournit (`conversation-encryption-switch-gesture.ts`) ; sans lui, la fiche
 * explique et ne propose rien.
 */
export type EncryptionModeSwitchGesture = {
  readonly readStatus: () => Promise<EncryptionStatus | null>;
  readonly switchTo: (params: { readonly servedMode: string | null; readonly target: CreationEncryptionMode }) => Promise<EncryptionSwitchOutcome>;
};

/** Les mots du geste (`catalog-conversation-encryption-*.ts`). */
export const SWITCH_KEY = {
  to: 'conversationEncryption.switch.to',
  busy: 'conversationEncryption.switch.busy',
  done: 'conversationEncryption.switch.done',
  footer: 'conversationEncryption.switch.footer',
  endToEndOnApps: 'conversationEncryption.switch.endToEndOnApps',
} as const satisfies Record<string, ConversationEncryptionCatalogKey>;

/** Un refus local `refused` ne devrait jamais s'afficher : il se dit comme un échec. */
export const SWITCH_REFUSAL_KEY = {
  irreversible: 'conversationEncryption.switch.irreversible',
  held: 'conversationEncryption.switch.held',
  'regime-changed': 'conversationEncryption.switch.regimeChanged',
  restricted: 'conversationEncryption.switch.restricted',
  forbidden: 'conversationEncryption.switch.forbidden',
  unavailable: 'conversationEncryption.switch.unavailable',
  offline: 'conversationEncryption.switch.offline',
  failed: 'conversationEncryption.switch.failed',
  refused: 'conversationEncryption.switch.failed',
} as const satisfies Record<EncryptionSwitchRefusal, ConversationEncryptionCatalogKey>;
