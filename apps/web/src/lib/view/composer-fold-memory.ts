import { safeLocalStorage, type SafeStorage } from '@/lib/storage';

/**
 * LA MÉMOIRE DU REPLI, PAR CONVERSATION (#16341, demande porteur 2026-11-05).
 * Une conversation dont on a replié la barre la retrouve repliée en y
 * revenant, y compris après un rechargement ; une conversation jamais touchée
 * garde le défaut (dépliée). Seules les conversations REPLIÉES sont inscrites,
 * les plus récentes en dernier, et la liste est bornée : un appareil qui a
 * replié mille conversations ne grossit pas son stockage sans fin.
 */
const KEY = 'meeshy.conversation.composerFolded';
const CAP = 300;

export type ComposerFoldMemory = {
  readonly isFolded: (conversationId: string) => boolean;
  readonly remember: (conversationId: string, folded: boolean) => void;
};

function readFolded(storage: SafeStorage): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === 'string') : [];
  } catch {
    return [];
  }
}

export function composerFoldMemory(storage: SafeStorage = safeLocalStorage()): ComposerFoldMemory {
  return {
    isFolded: (conversationId) => readFolded(storage).includes(conversationId),
    remember: (conversationId, folded) => {
      const others = readFolded(storage).filter((entry) => entry !== conversationId);
      const next = (folded ? [...others, conversationId] : others).slice(-CAP);
      try {
        if (next.length === 0) storage.removeItem(KEY);
        else storage.setItem(KEY, JSON.stringify(next));
      } catch {
        return;
      }
    },
  };
}

let shared: ComposerFoldMemory | null = null;

/** La mémoire de l'appareil, créée au premier usage (jamais à l'import). */
export function deviceComposerFoldMemory(): ComposerFoldMemory {
  shared ??= composerFoldMemory();
  return shared;
}
