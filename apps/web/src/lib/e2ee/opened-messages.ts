import { createStore } from 'zustand/vanilla';

/**
 * LES CLAIRS OUVERTS SUR CE NAVIGATEUR, EN MÉMOIRE SEULE (#14592) — jamais dans
 * le cache de requêtes (rangé sur le disque en clair) ni `localStorage` ; la
 * source durable est la base scellée (`record-vault.ts`). Le fil ne les lit pas
 * encore : le branchement attend qu'un moteur soit retenu (décision en revue).
 */
export type OpenedText = { readonly text: string; readonly language: string | null };

export const openedMessagesStore = createStore<Readonly<Record<string, OpenedText>>>(() => ({}));

export const publishOpened = (messageId: string, opened: OpenedText): void => openedMessagesStore.setState({ [messageId]: opened });

export const forgetOpened = (): void => openedMessagesStore.setState({}, true);
