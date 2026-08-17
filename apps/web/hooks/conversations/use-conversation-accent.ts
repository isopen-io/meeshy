'use client';

import { useMemo } from 'react';
import {
  colorForName,
  conversationAccentPalette,
} from '@meeshy/shared/utils/conversation-colors';
import type { Conversation } from '@meeshy/shared/types';

/**
 * L'accent de conversation, en variables CSS.
 *
 * `packages/shared/utils/conversation-colors.ts` est le portage TS de
 * `ColorGeneration.swift` (`blend(langue × 0.30, type × 0.30, thème × 0.40)`,
 * `secondary`/`accent` = teinte ±30°). Il existait déjà mais n'avait AUCUN
 * consommateur web — l'indigo était codé en dur. Ce hook le branche.
 *
 * Règle produit (CLAUDE.md § Conversation Accent Color) : tout composant en
 * contexte de conversation utilise cet accent, jamais une couleur en dur. Le
 * ring de focus du mode Focal et la Lentille le consomment via `--conv-accent`.
 */
export type ConversationAccentStyle = {
  '--conv-accent': string;
  '--conv-accent-secondary': string;
  '--conv-accent-soft': string;
};

export function conversationAccentStyle(
  conversation: Pick<Conversation, 'id' | 'title' | 'type'> & {
    identifier?: string | null;
    language?: string | null;
  } | null | undefined
): ConversationAccentStyle | undefined {
  if (!conversation) return undefined;

  const name = conversation.title || conversation.identifier || conversation.id;

  // Sans type exploitable, on retombe sur le hash de nom — le même repli
  // qu'iOS (`DynamicColorGenerator.colorForName`).
  const palette = conversation.type
    ? conversationAccentPalette({
        name,
        type: conversation.type,
        language: conversation.language ?? undefined,
      })
    : { primary: colorForName(name), secondary: colorForName(name), accent: colorForName(name) };

  return {
    '--conv-accent': palette.primary,
    '--conv-accent-secondary': palette.secondary,
    '--conv-accent-soft': `${palette.primary}1F`,
  };
}

export function useConversationAccent(
  conversation: Parameters<typeof conversationAccentStyle>[0]
): ConversationAccentStyle | undefined {
  return useMemo(
    () => conversationAccentStyle(conversation),
    [conversation?.id, conversation?.title, conversation?.type]
  );
}
