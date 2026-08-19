/**
 * Règle produit (spec 2026-08-19, Volet C) : le nom de la conversation source
 * s'affiche pour tout GROUPE, jamais pour un tête-à-tête.
 * RÈGLE JUMELLE : apps/ios/Meeshy/Features/Main/Views/Bubble/ForwardBadgePolicy.swift
 * — toute évolution touche les deux.
 */

const HIDDEN_TYPES = new Set(['direct', 'bot']);

export function forwardBadgeConversationName(
  conv?: { title?: string | null; identifier?: string | null; type?: string | null } | null,
): string | null {
  if (!conv) return null;
  const name = conv.title ?? conv.identifier ?? null;
  if (!name) return null;
  if (conv.type && HIDDEN_TYPES.has(conv.type)) return null;
  return name;
}
