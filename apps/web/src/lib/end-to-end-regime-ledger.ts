import { createStore, type StoreApi } from 'zustand/vanilla';


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
 * l'avis système d'activation ou un message chiffré de bout en bout) et toute
 * rétrogradation servie est ignorée : ni confirmation, ni époque à départager,
 * ni oubli.
 *
 * #12986 (décision porteur du 2026-10-25, option 2) — un message chiffré de
 * bout en bout AFFICHÉ dans le fil scelle l'envoi, même servi sans régime,
 * dès qu'il porte un marqueur que la passerelle a admis comme tel
 * (`carriesEndToEnd`). Cela couvre une conversation dont le mode se perd en
 * route alors que ses messages le gardent ; une passerelle compromise qui
 * retirerait aussi les marques des messages n'est arrêtée que là où ce compte
 * a déjà vu la conversation chiffrée. Les trois tête-à-tête du staging qui
 * portaient de faux chiffrés de recette sans régime en ont été retirés d'abord ;
 * la production n'en comptait aucun.
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

export const SEALED_STORAGE_PREFIX = 'meeshy.e2ee-sealed.';

const storageKey = (identity: string): string => `${SEALED_STORAGE_PREFIX}${identity}`;

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

type SealedInput = {
  readonly conversationId: string;
  readonly servedMode?: string | null | undefined;
};

/**
 * La conversation est-elle fermée au clair ? Servie e2ee, ou apprise e2ee — ce
 * que le fil a montré (`threadShowsEndToEnd`, `lib/end-to-end-thread-signal.ts`)
 * y est inscrit par le fil ouvert et par la surveillance du cache.
 */
export function endToEndSealed(state: Pick<EndToEndRegimeState, 'sealed'>, input: SealedInput): boolean {
  return isEndToEndMode(input.servedMode) || state.sealed[input.conversationId] === true;
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
