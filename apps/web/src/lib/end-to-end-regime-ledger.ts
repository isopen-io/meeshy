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
  /**
   * #12992 — l'ÈRE du bout en bout de chaque conversation apprise : l'instant
   * (ms) à partir duquel elle est chiffrée, la plus ancienne preuve reçue,
   * bornée par l'horloge de ce navigateur au moment où il l'apprend (#12936).
   * Un message qui se dit en clair après elle se montre scellé.
   */
  readonly since: Readonly<Record<string, number>>;
  /**
   * #13099 — les conversations dont le fil affiché retient l'envoi EN COURS
   * sans rien apprendre : un message chiffré sans mode ou d'un mode inconnu,
   * ou un message e2ee dans un groupe. En mémoire seulement : une vieille ligne
   * ne scelle pas la conversation à vie (revue de sécurité #12985).
   */
  readonly held: Readonly<Record<string, true>>;
  /**
   * #12992 (revue) — les messages EN CLAIR que ce navigateur avait déjà en cache
   * quand il a appris la conversation e2ee : les seuls clairs « d'avant
   * l'activation » qu'il croit. La date d'un message vient du serveur, qui peut
   * antidater un clair forgé ; un clair vu pour la première fois après
   * l'apprentissage reste scellé. Absent : la photographie n'est pas encore prise.
   */
  readonly clearKnown: Readonly<Record<string, readonly string[]>>;
  bind(identity: string | null): void;
  learnEndToEnd(conversationId: string, since?: number): void;
  holdSend(conversationId: string, held: boolean): void;
  /** Photographie unique : une seconde ne remplace jamais la première. */
  rememberClearBefore(conversationId: string, messageIds: readonly string[]): void;
  reset(): void;
};

/** Au plus autant de clairs retenus par conversation : les plus récents du cache. */
export const CLEAR_KNOWN_LIMIT = 1000;

export const SEALED_STORAGE_PREFIX = 'meeshy.e2ee-sealed.';
export const SINCE_STORAGE_PREFIX = 'meeshy.e2ee-since.';
export const CLEAR_STORAGE_PREFIX = 'meeshy.e2ee-clear.';

const storageKey = (identity: string): string => `${SEALED_STORAGE_PREFIX}${identity}`;
const sinceKey = (identity: string): string => `${SINCE_STORAGE_PREFIX}${identity}`;
const clearKey = (identity: string): string => `${CLEAR_STORAGE_PREFIX}${identity}`;

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

function readSince(storage: SealedStorage | null, identity: string): Record<string, number> {
  try {
    const raw = storage?.getItem(sinceKey(identity));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1])));
  } catch {
    return {};
  }
}

function writeSince(storage: SealedStorage | null, identity: string, since: Readonly<Record<string, number>>): void {
  try {
    storage?.setItem(sinceKey(identity), JSON.stringify(since));
  } catch {
    return;
  }
}

function readClear(storage: SealedStorage | null, identity: string): Record<string, readonly string[]> {
  try {
    const raw = storage?.getItem(clearKey(identity));
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, ids]) => (Array.isArray(ids) ? [[id, ids.filter((x): x is string => typeof x === 'string')] as const] : [])),
    );
  } catch {
    return {};
  }
}

function writeClear(storage: SealedStorage | null, identity: string, clear: Readonly<Record<string, readonly string[]>>): void {
  try {
    storage?.setItem(clearKey(identity), JSON.stringify(clear));
  } catch {
    return;
  }
}

/** La plus ancienne des deux ères ; une ère absente cède toujours. */
const earliest = (known: number | undefined, offered: number): number => (known === undefined ? offered : Math.min(known, offered));

/** Chaque conversation scellée a une ère : celle qui n'en a pas (registre d'avant #12992) prend `at`. */
const withEras = (sealed: Readonly<Record<string, true>>, since: Readonly<Record<string, number>>, at: number): Record<string, number> =>
  Object.fromEntries(Object.keys(sealed).map((id) => [id, since[id] ?? at] as const));

export function createEndToEndRegimeLedger(
  options: { readonly storage?: SealedStorage | null; readonly now?: () => number } = {},
): StoreApi<EndToEndRegimeState> {
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const now = options.now ?? Date.now;
  return createStore<EndToEndRegimeState>((set, get) => ({
    identity: null,
    sealed: {},
    since: {},
    held: {},
    clearKnown: {},
    bind: (identity) => {
      const { identity: previous, sealed, since, clearKnown } = get();
      if (identity === previous) return;
      if (identity === null) {
        set({ identity, sealed: {}, since: {}, held: {}, clearKnown: {} });
        return;
      }
      /* Appris AVANT toute liaison (le démarrage, avant que la session ne soit
         rattachée) : c'est ce compte qui l'a vu — rien ne se perd. */
      const inherited = previous === null ? sealed : {};
      const inheritedSince = previous === null ? since : {};
      const next = { ...readSealed(storage, identity), ...inherited };
      const stored = readSince(storage, identity);
      const merged = Object.fromEntries(Object.entries(inheritedSince).map(([id, at]) => [id, earliest(stored[id], at)] as const));
      const nextSince = withEras(next, { ...stored, ...merged }, now());
      const storedClear = readClear(storage, identity);
      const inheritedClear = previous === null ? clearKnown : {};
      const nextClear = { ...inheritedClear, ...storedClear };
      set({ identity, sealed: next, since: nextSince, held: {}, clearKnown: nextClear });
      if (Object.keys(inheritedClear).some((id) => storedClear[id] === undefined)) writeClear(storage, identity, nextClear);
      if (Object.keys(inherited).length > 0) writeSealed(storage, identity, next);
      if (Object.keys(nextSince).some((id) => stored[id] !== nextSince[id])) writeSince(storage, identity, nextSince);
    },
    learnEndToEnd: (conversationId, offered) => {
      const { identity, sealed, since } = get();
      const at = Math.min(offered !== undefined && Number.isFinite(offered) ? offered : Number.POSITIVE_INFINITY, now());
      const era = earliest(since[conversationId], at);
      if (sealed[conversationId] === true && since[conversationId] === era) return;
      const next = { ...sealed, [conversationId]: true as const };
      const nextSince = { ...since, [conversationId]: era };
      set({ sealed: next, since: nextSince });
      if (identity === null) return;
      writeSealed(storage, identity, { ...readSealed(storage, identity), ...next });
      writeSince(storage, identity, { ...readSince(storage, identity), [conversationId]: era });
    },
    holdSend: (conversationId, held) => {
      const current = get().held;
      if ((current[conversationId] === true) === held) return;
      const { [conversationId]: _released, ...rest } = current;
      set({ held: held ? { ...current, [conversationId]: true } : rest });
    },
    rememberClearBefore: (conversationId, messageIds) => {
      const { identity, clearKnown } = get();
      if (clearKnown[conversationId] !== undefined) return;
      const kept = [...new Set(messageIds)].slice(-CLEAR_KNOWN_LIMIT);
      const next = { ...clearKnown, [conversationId]: kept };
      set({ clearKnown: next });
      if (identity !== null) writeClear(storage, identity, { ...readClear(storage, identity), [conversationId]: kept });
    },
    reset: () => set({ identity: null, sealed: {}, since: {}, held: {}, clearKnown: {} }),
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
export function endToEndSealed(state: Pick<EndToEndRegimeState, 'sealed'> & Partial<Pick<EndToEndRegimeState, 'held'>>, input: SealedInput): boolean {
  return isEndToEndMode(input.servedMode) || state.sealed[input.conversationId] === true || state.held?.[input.conversationId] === true;
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
export function canSendPlaintext(
  input: SealedInput,
  state: Pick<EndToEndRegimeState, 'sealed'> & Partial<Pick<EndToEndRegimeState, 'held'>> = endToEndRegimeLedger.getState(),
): boolean {
  return !endToEndSealed(state, input);
}
