/**
 * Le choix de lentille est COLLANT et stocké par conversation.
 *
 * Règle du volume 3 : l'orchestrateur ne s'exécute qu'à l'ouverture, jamais
 * pendant la lecture — changer de mode sous les yeux de quelqu'un qui lit est
 * la seule faute que ce système ne peut pas se permettre. Un choix manuel
 * (Lentille ou `Aa`) écrit ici et gagne à chaque réouverture.
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import {
  DEFAULT_READING_MODE,
  isReadingMode,
  nextDensity,
  type ReadingMode,
} from '@/lib/conversations/reading-mode';

interface ReadingModeState {
  modes: Record<string, ReadingMode>;
  getMode: (conversationId: string) => ReadingMode;
  setMode: (conversationId: string, mode: ReadingMode) => void;
  toggleDensity: (conversationId: string) => void;
}

export const useReadingModeStore = create<ReadingModeState>()(
  devtools(
    persist(
      (set, get) => ({
        modes: {},

        getMode: (conversationId) => {
          const stored = get().modes[conversationId];
          return isReadingMode(stored) ? stored : DEFAULT_READING_MODE;
        },

        setMode: (conversationId, mode) =>
          set((state) => ({ modes: { ...state.modes, [conversationId]: mode } })),

        toggleDensity: (conversationId) =>
          set((state) => {
            const current = isReadingMode(state.modes[conversationId])
              ? state.modes[conversationId]
              : DEFAULT_READING_MODE;
            return { modes: { ...state.modes, [conversationId]: nextDensity(current) } };
          }),
      }),
      {
        name: 'meeshy-reading-mode',
        version: 1,
        partialize: (state) => ({ modes: state.modes }),
      }
    ),
    { name: 'reading-mode-store' }
  )
);

export function useReadingMode(conversationId: string | undefined): ReadingMode {
  return useReadingModeStore((state) => {
    if (!conversationId) return DEFAULT_READING_MODE;
    const stored = state.modes[conversationId];
    return isReadingMode(stored) ? stored : DEFAULT_READING_MODE;
  });
}
