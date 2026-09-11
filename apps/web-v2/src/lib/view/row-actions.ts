import type { ConversationFlags } from '@/lib/api/preferences';

/**
 * LES ACTIONS DE RANGÉE (#5559 §5.6) — le cœur du critère de fin de l'issue :
 * épingler, sourdine, lu/non-lu, archiver, chacune à EFFET sur la donnée
 * (le store, `conversation-store.ts`).
 *
 * Loi PURE, testable sans monter de composant — le composant `RowActions`
 * (`@/components/row-actions.tsx`) ne fait que la RENDRE et router le clic
 * vers le store, jamais décider un libellé lui-même.
 *
 * Libellés repris MOT POUR MOT du catalogue iOS
 * (`apps/ios/Meeshy/Localizable.xcstrings`, clés `swipe.*`) — cohérence de
 * vocabulaire (directive « même mot, même icône, même couleur de contexte »).
 * `ConversationListView.swift:929-943` précalcule les MÊMES couples.
 */
export type RowActionId = 'pin' | 'mute' | 'read' | 'archive';

/**
 * Sous-ensemble de `GlyphName` (`@/components/glyphs`) — délibérément
 * NON importé ici : `src/lib/` reste en amont de `src/components/`, jamais
 * l'inverse. `RowActions` vérifie la compatibilité structurelle à l'usage.
 */
export type RowActionGlyph = 'pushPin' | 'bell' | 'bellSlash' | 'envelopeOpen' | 'archive';

export type RowMenuItem = {
  readonly id: RowActionId;
  readonly label: string;
  readonly glyph: RowActionGlyph;
};

export function rowMenuItems(params: {
  readonly flags: ConversationFlags;
  readonly unread: boolean;
}): readonly RowMenuItem[] {
  const { flags, unread } = params;
  return [
    { id: 'pin', label: flags.isPinned ? 'Désépingler' : 'Épingler', glyph: 'pushPin' },
    { id: 'mute', label: flags.isMuted ? 'Son' : 'Silence', glyph: flags.isMuted ? 'bell' : 'bellSlash' },
    { id: 'read', label: unread ? 'Lu' : 'Non lu', glyph: 'envelopeOpen' },
    { id: 'archive', label: flags.isArchived ? 'Désarchiver' : 'Archiver', glyph: 'archive' },
  ];
}
