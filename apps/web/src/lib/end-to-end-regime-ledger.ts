import { createStore, type StoreApi } from 'zustand/vanilla';

import type { Message } from '@/lib/api/types';

/**
 * **UNE CONVERSATION VUE CHIFFRÉE DE BOUT EN BOUT RESTE FERMÉE AU CLAIR**
 * (#12949, décision porteur du 2026-10-25). Le bout en bout ne se désactive
 * pas : la passerelle refuse toute désactivation (`409 E2EE_IRREVERSIBLE`) et
 * sa seule écriture du régime ne quitte jamais `e2ee`. Pour échanger en clair,
 * on crée une autre conversation.
 *
 * Le web n'écrit pas en bout en bout : son composeur s'y efface
 * (`write-restriction.ts`). Le risque est qu'il se ROUVRE en clair sur la seule
 * parole du serveur — un serveur compromis qui servirait la conversation sans
 * mode. Ce registre retient donc, par compte, les conversations que ce
 * navigateur a vues `e2ee` (mode servi, bascule temps réel, fil qui montre
 * l'avis système d'activation) et toute rétrogradation servie est ignorée : ni
 * confirmation, ni époque à départager, ni oubli.
 *
 * Un message isolé marqué `e2ee` n'est PAS un signal de régime : mesuré sur
 * staging le 2026-10-25, trois tête-à-tête sans aucun régime portent un ancien
 * message iOS marqué `e2ee` suivi de clair ; les fermer au composeur
 * fermerait des conversations qui n'ont jamais été chiffrées.
 *
 * Il survit au rechargement : la liste est rangée dans le stockage du
 * navigateur sous la clé du compte (`bind`). Un stockage absent, plein ou
 * corrompu n'ôte rien de ce qui est en mémoire.
 */
export type SealedStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type EndToEndRegimeState = {
  readonly identity: string | null;
  readonly sealed: Readonly<Record<string, true>>;
  bind(identity: string | null): void;
  learnEndToEnd(conversationId: string): void;
  reset(): void;
};

const STORAGE_PREFIX = 'meeshy.e2ee-sealed.';

const storageKey = (identity: string): string => `${STORAGE_PREFIX}${identity}`;

const browserStorage = (): SealedStorage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

function readSealed(storage: SealedStorage | null, identity: string): Record<string, true> {
  try {
    const raw = storage?.getItem(storageKey(identity));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const ids = Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
    return Object.fromEntries(ids.map((id) => [id, true] as const));
  } catch {
    return {};
  }
}

function writeSealed(storage: SealedStorage | null, identity: string, sealed: Readonly<Record<string, true>>): void {
  try {
    storage?.setItem(storageKey(identity), JSON.stringify(Object.keys(sealed)));
  } catch {
    return;
  }
}

export function createEndToEndRegimeLedger(options: { readonly storage?: SealedStorage | null } = {}): StoreApi<EndToEndRegimeState> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  return createStore<EndToEndRegimeState>((set, get) => ({
    identity: null,
    sealed: {},
    bind: (identity) => {
      const { identity: previous, sealed } = get();
      if (identity === previous) return;
      if (identity === null) {
        set({ identity, sealed: {} });
        return;
      }
      /* Appris AVANT toute liaison (le démarrage, avant que la session ne soit
         rattachée) : c'est ce compte qui l'a vu — rien ne se perd. */
      const inherited = previous === null ? sealed : {};
      const next = { ...readSealed(storage, identity), ...inherited };
      set({ identity, sealed: next });
      if (Object.keys(inherited).length > 0) writeSealed(storage, identity, next);
    },
    learnEndToEnd: (conversationId) => {
      const { identity, sealed } = get();
      if (sealed[conversationId] === true) return;
      const next = { ...sealed, [conversationId]: true as const };
      set({ sealed: next });
      if (identity !== null) writeSealed(storage, identity, { ...readSealed(storage, identity), ...next });
    },
    reset: () => set({ identity: null, sealed: {} }),
  }));
}

export const endToEndRegimeLedger = createEndToEndRegimeLedger();

export const isEndToEndMode = (mode: string | null | undefined): boolean => typeof mode === 'string' && mode.trim().toLowerCase() === 'e2ee';

type SignalSource = Pick<Message, 'messageType' | 'metadata'> & { readonly systemEvent?: unknown };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null;

/** L'avis d'ACTIVATION du bout en bout, sur un message système seulement : un texte d'utilisateur qui l'imiterait ne dit rien. */
function announcesEndToEnd(message: SignalSource): boolean {
  if (message.messageType !== 'system') return false;
  const { metadata, systemEvent } = message;
  if (isRecord(metadata) && metadata.kind === 'encryption-enabled') return isEndToEndMode(typeof metadata.mode === 'string' ? metadata.mode : null);
  if (isRecord(systemEvent) && systemEvent.key === 'system.encryption-enabled' && isRecord(systemEvent.params)) {
    return isEndToEndMode(typeof systemEvent.params.mode === 'string' ? systemEvent.params.mode : null);
  }
  return false;
}

/** Le fil chargé montre-t-il l'activation du bout en bout ? Un avis de désactivation n'y retire rien. */
export function threadShowsEndToEnd(messages: readonly SignalSource[]): boolean {
  return messages.some(announcesEndToEnd);
}

type SealedInput = {
  readonly conversationId: string;
  readonly servedMode?: string | null | undefined;
  readonly messages?: readonly SignalSource[] | undefined;
};

/** La conversation est-elle fermée au clair ? Servie e2ee, apprise e2ee, ou montrée e2ee par le fil. */
export function endToEndSealed(state: Pick<EndToEndRegimeState, 'sealed'>, input: SealedInput): boolean {
  return isEndToEndMode(input.servedMode) || state.sealed[input.conversationId] === true || threadShowsEndToEnd(input.messages ?? []);
}

/** Le refus local d'un envoi en clair vers une conversation vue e2ee : rien ne part au réseau. */
export const E2EE_PLAINTEXT_WITHHELD = 'E2EE_PLAINTEXT_WITHHELD';

/**
 * **LA GARDE UNIQUE DE TOUT MESSAGE EN CLAIR DU WEB** (#12949) — lue AVANT tout
 * téléversement de pièce et avant tout `POST` : `sendMessage`
 * (`lib/api/messages.ts`, par où passent le composeur, l'outbox, la file hors
 * connexion, le transfert, la feuille d'envoi et le partage entrant), la phase
 * d'envoi du composeur (`perform-send.ts`), l'envoi de fichiers de la feuille
 * (`send-sheet-run.ts`) et la modification d'un message (`edit-message.ts`).
 * Les appels (sous-titres, enregistrement) et les réactions n'y passent pas
 * encore : #12963.
 */
export function canSendPlaintext(input: SealedInput, state: Pick<EndToEndRegimeState, 'sealed'> = endToEndRegimeLedger.getState()): boolean {
  return !endToEndSealed(state, input);
}
