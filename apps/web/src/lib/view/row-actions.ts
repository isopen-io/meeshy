import type { ConversationFlags } from '@/lib/api/preferences';
import { translate } from '@/lib/i18n-catalog';
import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
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
export type RowActionId =
  | 'callAudio'
  | 'callVideo'
  | 'pin'
  | 'mute'
  | 'read'
  | 'details'
  | 'rename'
  | 'favorite'
  | 'moveTo'
  | 'archive'
  | 'block'
  | 'delete';

export type RowCallActionId = Extract<RowActionId, 'callAudio' | 'callVideo'>;

/** Les actions de DRAPEAU — celles que `performRowAction` arbitre. L'appel et la
 * suppression ont chacun leur chemin (`callActions`, `requestDeparture`). */
export type RowFlagActionId = Extract<RowActionId, 'pin' | 'mute' | 'read' | 'archive'>;

/** Les entrées qui ne basculent pas un drapeau (#10593) : elles ouvrent une
 * fiche, une fenêtre ou une confirmation, que l'écran de la liste porte. */
export type RowIntentActionId = Extract<RowActionId, 'details' | 'rename' | 'block'>;

export const isRowFlagAction = (id: RowActionId): id is RowFlagActionId => id === 'pin' || id === 'mute' || id === 'read' || id === 'archive';

export const isRowCallAction = (id: RowActionId): id is RowCallActionId => id === 'callAudio' || id === 'callVideo';

/**
 * Sous-ensemble de `GlyphName` (`@/components/glyphs`) — délibérément
 * NON importé ici : `src/lib/` reste en amont de `src/components/`, jamais
 * l'inverse. `RowActions` vérifie la compatibilité structurelle à l'usage.
 */
export type RowActionGlyph =
  | 'phone'
  | 'videoCamera'
  | 'pushPin'
  | 'bell'
  | 'bellSlash'
  | 'envelopeOpen'
  | 'archive'
  | 'trash'
  | 'info'
  | 'pencilSimple'
  | 'star'
  | 'starFill'
  | 'folderSimple'
  | 'handPalm';

/** Les deux entrées qui ouvrent un SOUS-MENU, comme les `Menu` d'iOS. */
export type RowSubmenu = 'favorite' | 'moveTo';

export type RowMenuItem = {
  readonly id: RowActionId;
  readonly label: string;
  readonly glyph: RowActionGlyph;
  /** Un geste qui RETIRE : rendu en rouge, comme le `role: .destructive` d'iOS. */
  readonly destructive?: true;
  /** L'entrée ouvre un sous-menu au lieu d'agir. */
  readonly submenu?: RowSubmenu;
};

/**
 * CE QUE LA LIGNE SAIT EN PLUS (#10593) — les entrées d'iOS que le balayage ne
 * porte pas. `details` : la fiche s'ouvre (un compte) ; `rename` : hors direct
 * ; `organize` : favori et catégorie, préférences d'un compte ; `favorite` :
 * l'emoji posé ; `block` : direct à un pair qui a un compte — « Bloquer » ou
 * « Débloquer » selon l'état servi, `null` sinon.
 */
export type RowMenuMore = {
  readonly details: boolean;
  readonly rename: boolean;
  readonly organize: boolean;
  readonly favorite: string | undefined;
  readonly block: 'block' | 'unblock' | null;
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
  | 'rowActions.unarchive'
  | 'rowActions.delete';

export function rowMenuItems(params: {
  readonly flags: ConversationFlags;
  readonly unread: boolean;
  readonly language: InterfaceLanguage;
  readonly canCall?: boolean;
  /** Un compte : « Supprimer » ferme le menu, comme dans la liste iOS (#7285). */
  readonly canDelete?: boolean;
  /** Absent (le balayage) : aucune des entrées de #10593. */
  readonly more?: RowMenuMore;
}): readonly RowMenuItem[] {
  const { flags, unread, language, canCall = false, canDelete = false, more } = params;
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
    ...(more === undefined ? [] : moreItems(more, language)),
    ...(flags.archiveLocked === true
      ? []
      : [{ id: 'archive', label: label(flags.isArchived ? 'rowActions.unarchive' : 'rowActions.archive'), glyph: 'archive' } as const]),
    ...(more === undefined ? [] : blockItems(more, language)),
    ...(canDelete ? [{ id: 'delete', label: label('rowActions.delete'), glyph: 'trash', destructive: true } as const] : []),
  ];
}

/** L'ordre d'iOS : Détails, Renommer, Favori, Déplacer vers… */
function moreItems(more: RowMenuMore, language: InterfaceLanguage): readonly RowMenuItem[] {
  return [
    ...(more.details ? [{ id: 'details', label: rowMenuText(language, 'rowMenu.details'), glyph: 'info' } as const] : []),
    ...(more.organize && more.rename ? [{ id: 'rename', label: rowMenuText(language, 'rowMenu.rename'), glyph: 'pencilSimple' } as const] : []),
    ...(more.organize
      ? [
          {
            id: 'favorite',
            label: rowMenuText(language, 'rowMenu.favorite'),
            glyph: more.favorite === undefined ? 'star' : 'starFill',
            submenu: 'favorite',
          } as const,
          { id: 'moveTo', label: rowMenuText(language, 'rowMenu.moveTo'), glyph: 'folderSimple', submenu: 'moveTo' } as const,
        ]
      : []),
  ];
}

/** « Bloquer » rougit (`role: .destructive` d'iOS), « Débloquer » non. */
function blockItems(more: RowMenuMore, language: InterfaceLanguage): readonly RowMenuItem[] {
  if (!more.organize || more.block === null) return [];
  return more.block === 'block'
    ? [{ id: 'block', label: rowMenuText(language, 'rowMenu.block'), glyph: 'handPalm', destructive: true }]
    : [{ id: 'block', label: rowMenuText(language, 'rowMenu.unblock'), glyph: 'handPalm' }];
}

/** Les huit emojis du favori, ceux d'iOS et dans son ordre. */
export const FAVORITE_EMOJIS = ['⭐️', '❤️', '🔥', '💎', '🎯', '✨', '🏆', '💡'] as const;

/** Ce qu'une entrée de sous-menu ÉCRIT — `null` retire. */
export type RowSubmenuChoice =
  | { readonly kind: 'favorite'; readonly emoji: string | null }
  | { readonly kind: 'moveTo'; readonly categoryId: string | null };

/**
 * CE QUE LA LIGNE DEMANDE À L'ÉCRAN (#10593) — renommer (une fenêtre),
 * bloquer ou débloquer (une confirmation pour bloquer), ou un choix de
 * sous-menu à écrire. L'écran possède les fenêtres et le store ; la ligne,
 * mémoïsée, ne fait que nommer le geste.
 */
export type RowIntent =
  | { readonly kind: 'rename' }
  | { readonly kind: 'block'; readonly intent: 'block' | 'unblock' }
  | RowSubmenuChoice;

export type RowSubmenuItem = {
  readonly key: string;
  readonly label: string;
  readonly checked: boolean;
  readonly choice: RowSubmenuChoice;
  readonly destructive?: true;
};

/**
 * LES SOUS-MENUS — Favori (les huit emojis, puis « Retirer le favori » quand
 * un favori est posé) et Déplacer vers… (les catégories dans l'ordre que le
 * lecteur leur a donné, puis « Mes conversations »). Toucher la catégorie
 * COURANTE la vide, comme `ConversationMoveToSectionMenuItems` d'iOS.
 */
export function rowSubmenuItems(params: {
  readonly submenu: RowSubmenu;
  readonly favorite: string | undefined;
  readonly categoryId: string | undefined;
  readonly categories: readonly { readonly id: string; readonly name: string }[];
  readonly language: InterfaceLanguage;
}): readonly RowSubmenuItem[] {
  const { submenu, favorite, categoryId, categories, language } = params;
  if (submenu === 'favorite') {
    return [
      ...FAVORITE_EMOJIS.map((emoji) => ({ key: emoji, label: emoji, checked: emoji === favorite, choice: { kind: 'favorite', emoji } as const })),
      ...(favorite === undefined
        ? []
        : [
            {
              key: 'remove',
              label: rowMenuText(language, 'rowMenu.favorite.remove'),
              checked: false,
              choice: { kind: 'favorite', emoji: null },
              destructive: true,
            } as const,
          ]),
    ];
  }
  return [
    ...categories.map((category) => ({
      key: category.id,
      label: category.name,
      checked: category.id === categoryId,
      choice: { kind: 'moveTo', categoryId: category.id === categoryId ? null : category.id } as const,
    })),
    { key: 'mine', label: rowMenuText(language, 'rowMenu.moveTo.mine'), checked: categoryId === undefined, choice: { kind: 'moveTo', categoryId: null } },
  ];
}
