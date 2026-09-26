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
 * gestes de son bouton d'appel du fil, vocal et vidéo. `canCall` faux ⇒ l'appel
 * n'est pas permis (invité anonyme) et aucune entrée ne s'affiche. Chaque
 * libellé passe par le catalogue d'interface, dans la langue du lecteur (#8150).
 */
type RowMenuLabelKey =
  | 'call.action.audio'
  | 'call.action.video'
  | 'rowActions.pin'
  | 'rowActions.unpin'
  | 'rowActions.mute'
  | 'rowActions.unmute'
  | 'rowActions.read'
  | 'rowActions.unread'
  | 'rowActions.archive'
  | 'rowActions.unarchive';

export function rowMenuItems(params: {
  readonly flags: ConversationFlags;
  readonly unread: boolean;
  readonly language: InterfaceLanguage;
  readonly canCall?: boolean;
}): readonly RowMenuItem[] {
  const { flags, unread, language, canCall = false } = params;
  const label = (key: RowMenuLabelKey) => translate(language, key);
  return [
    ...(canCall
      ? [
          { id: 'callAudio', label: label('call.action.audio'), glyph: 'phone' } as const,
          { id: 'callVideo', label: label('call.action.video'), glyph: 'videoCamera' } as const,
        ]
      : []),
    { id: 'pin', label: label(flags.isPinned ? 'rowActions.unpin' : 'rowActions.pin'), glyph: 'pushPin' },
    { id: 'mute', label: label(flags.isMuted ? 'rowActions.unmute' : 'rowActions.mute'), glyph: flags.isMuted ? 'bell' : 'bellSlash' },
    { id: 'read', label: label(unread ? 'rowActions.read' : 'rowActions.unread'), glyph: 'envelopeOpen' },
    { id: 'archive', label: label(flags.isArchived ? 'rowActions.unarchive' : 'rowActions.archive'), glyph: 'archive' },
  ];
}
