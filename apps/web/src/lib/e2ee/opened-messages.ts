import { createStore } from 'zustand/vanilla';

/**
 * LES CLAIRS OUVERTS SUR CE NAVIGATEUR, EN MÉMOIRE SEULE (#14592). Le fil y lit
 * le texte d'un message chiffré de bout en bout que libsignal a ouvert ici ;
 * la source durable est la base scellée (`record-vault.ts`), jamais le cache de
 * requêtes (rangé sur le disque en clair) ni `localStorage`.
 *
 * La PROVENANCE ne se lit jamais sur un champ du message servi : un serveur
 * compromis pourrait l'y poser. Un message rendu ouvert est un objet fabriqué
 * ici, reconnu par son IDENTITÉ (`openedOnDevice`).
 */
export type OpenedText = {
  readonly text: string;
  readonly language: string | null;
  readonly senderUserId: string;
};

export type OpenedState = {
  readonly opened: Readonly<Record<string, OpenedText>>;
  readonly undecryptable: Readonly<Record<string, true>>;
};

export const openedMessagesStore = createStore<OpenedState>(() => ({ opened: {}, undecryptable: {} }));

export function publishOpened(messageId: string, opened: OpenedText): void {
  openedMessagesStore.setState((state) => ({ ...state, opened: { ...state.opened, [messageId]: opened } }));
}

export function publishUndecryptable(messageId: string): void {
  openedMessagesStore.setState((state) => ({ ...state, undecryptable: { ...state.undecryptable, [messageId]: true } }));
}

/** À la fin d'une session : plus aucun clair en mémoire. */
export function forgetOpened(): void {
  openedMessagesStore.setState({ opened: {}, undecryptable: {} });
}

const provenance = new WeakSet<object>();

/** Marque un objet comme ouvert ici ; seul ce module en fabrique. */
export function markOpenedOnDevice<T extends object>(value: T): T {
  provenance.add(value);
  return value;
}

/** L'objet a-t-il été ouvert par libsignal sur CE navigateur ? Jamais vrai pour une donnée servie. */
export const openedOnDevice = (value: object): boolean => provenance.has(value);
