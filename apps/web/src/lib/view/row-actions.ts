import type { ConversationFlags } from '@/lib/api/preferences';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

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
export type RowActionId = 'callAudio' | 'callVideo' | 'pin' | 'mute' | 'read' | 'archive';

export type RowCallActionId = Extract<RowActionId, 'callAudio' | 'callVideo'>;

export const isRowCallAction = (id: RowActionId): id is RowCallActionId => id === 'callAudio' || id === 'callVideo';

/**
 * Sous-ensemble de `GlyphName` (`@/components/glyphs`) — délibérément
 * NON importé ici : `src/lib/` reste en amont de `src/components/`, jamais
 * l'inverse. `RowActions` vérifie la compatibilité structurelle à l'usage.
 */
export type RowActionGlyph = 'phone' | 'videoCamera' | 'pushPin' | 'bell' | 'bellSlash' | 'envelopeOpen' | 'archive';

export type RowMenuItem = {
  readonly id: RowActionId;
  readonly label: string;
  readonly glyph: RowActionGlyph;
};

/**
 * APPELER DEPUIS LA LIGNE (#8109) — iOS offre « Appeler » au menu contextuel
 * d'une ligne (`ConversationListView+Overlays.swift`) ; le web y pose les deux
 * gestes de son bouton d'appel du fil, vocal et vidéo. `call` absent ⇒ l'appel
 * n'est pas permis (invité anonyme) et aucune entrée ne s'affiche.
 */
export function rowMenuItems(params: {
  readonly flags: ConversationFlags;
  readonly unread: boolean;
  readonly call?: { readonly language: InterfaceLanguage };
}): readonly RowMenuItem[] {
  const { flags, unread, call } = params;
  return [
    ...(call === undefined
      ? []
      : [
          { id: 'callAudio', label: translate(call.language, 'call.action.audio'), glyph: 'phone' } as const,
          { id: 'callVideo', label: translate(call.language, 'call.action.video'), glyph: 'videoCamera' } as const,
        ]),
    { id: 'pin', label: flags.isPinned ? 'Désépingler' : 'Épingler', glyph: 'pushPin' },
    { id: 'mute', label: flags.isMuted ? 'Son' : 'Silence', glyph: flags.isMuted ? 'bell' : 'bellSlash' },
    { id: 'read', label: unread ? 'Lu' : 'Non lu', glyph: 'envelopeOpen' },
    { id: 'archive', label: flags.isArchived ? 'Désarchiver' : 'Archiver', glyph: 'archive' },
  ];
}
