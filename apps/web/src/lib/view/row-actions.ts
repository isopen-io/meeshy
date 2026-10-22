import { conversationActionsFor, type ConversationActions } from '@meeshy/shared/utils/conversation-action-policy';
import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { ConversationFlags } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { MenuRow } from '@/lib/reading-mode/catalog';

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
  | 'search'
  | 'read'
  | 'readingMode'
  | 'details'
  | 'rename'
  | 'invite'
  | 'manageMembers'
  | 'favorite'
  | 'moveTo'
  | 'archive'
  | 'adminOpen'
  | 'block'
  | 'leave'
  | 'delete';

export type RowCallActionId = Extract<RowActionId, 'callAudio' | 'callVideo'>;

/** Les actions de DRAPEAU — celles que `performRowAction` arbitre. L'appel et la
 * suppression ont chacun leur chemin (`callActions`, `requestDeparture`). */
export type RowFlagActionId = Extract<RowActionId, 'pin' | 'mute' | 'read' | 'archive'>;

/** Les entrées qui ne basculent pas un drapeau (#10593) : elles ouvrent une
 * fiche, une fenêtre ou une confirmation, que l'écran de la liste porte. */
export type RowIntentActionId = Extract<RowActionId, 'details' | 'rename' | 'block'>;

/** Les entrées que les RÔLES ouvrent (#11211) : la ligne les route elle-même
 * (la fiche, le départ, l'administration), sans passer par l'écran. */
export type RowRoleActionId = Extract<RowActionId, 'invite' | 'manageMembers' | 'adminOpen' | 'leave'>;

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
  | 'handPalm'
  | 'userPlus'
  | 'users'
  | 'shieldCheck'
  | 'signOut'
  | 'magnifyingGlass'
  | 'eye';

/** Les entrées qui ouvrent un SOUS-MENU, comme les `Menu` d'iOS. */
export type RowSubmenu = 'favorite' | 'moveTo' | 'readingMode';

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
 * LES DEUX PORTES DU FIL (#11226) — « Rechercher » ouvre la conversation sur
 * sa recherche, « Mode de lecture › » choisit comment elle s'ouvrira : celles
 * du menu d'iOS (`ConversationListView+Overlays.swift`). Le mode suit le
 * drapeau de construction (`apiConfig.readingModesEnabled`) : coupé, un mode
 * choisi ici serait ignoré à l'ouverture, et l'entrée n'existe pas.
 */
export type RowMenuDoors = {
  readonly search: boolean;
  readonly readingMode: boolean;
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

/**
 * QUI TIENT LA LIGNE (#11211) — ce que la loi partagée lit du lecteur : son
 * compte, s'il parle en invité, et son rôle de PLATEFORME tel que la passerelle
 * l'a servi (`null` tant qu'il ne l'a pas été : rien de ce qu'il ouvrirait ne
 * s'offre avant).
 */
export type RowViewer = {
  readonly id: string;
  readonly hasAccount: boolean;
  readonly isAnonymous: boolean;
  readonly platformRole: string | null;
};

export type RowConversation = Pick<Conversation, 'type'> &
  Partial<Pick<Conversation, 'encryptionMode' | 'isActive' | 'isAnnouncementChannel' | 'defaultWriteRole' | 'currentUserRole' | 'isMember'>>;

/**
 * LES VERDICTS DE LA LIGNE — `conversationActionsFor` (`@meeshy/shared`), la
 * loi que le menu d'iOS lit aussi : le rang dans la conversation vient de
 * `currentUserRole`, et une conversation que le serveur dit non membre
 * (`isMember: false`) n'ouvre que ce que la plateforme accorde.
 */
export function rowConversationActions(input: { readonly conversation: RowConversation; readonly viewer: RowViewer }): ConversationActions {
  const { conversation, viewer } = input;
  const hasAccount = viewer.hasAccount && !viewer.isAnonymous;
  return conversationActionsFor({
    conversation: {
      type: conversation.type,
      encryptionMode: conversation.encryptionMode ?? null,
      isActive: conversation.isActive ?? null,
      isAnnouncementChannel: conversation.isAnnouncementChannel ?? null,
      defaultWriteRole: conversation.defaultWriteRole ?? null,
    },
    viewer: {
      id: viewer.id,
      participantId: null,
      hasAccount,
      isAnonymous: viewer.isAnonymous,
      platformRole: hasAccount ? viewer.platformRole : null,
      conversationRole: conversation.currentUserRole ?? null,
      isActiveMember: conversation.isMember !== false,
      canSendMessages: hasAccount,
      isDeclaredMinor: false,
    },
  });
}

export function rowMenuItems(params: {
  readonly flags: ConversationFlags;
  readonly unread: boolean;
  readonly language: InterfaceLanguage;
  readonly canCall?: boolean;
  /** Un compte : « Supprimer » ferme le menu, comme dans la liste iOS (#7285). */
  readonly canDelete?: boolean;
  /** Absent (le balayage) : aucune des entrées de #10593. */
  readonly more?: RowMenuMore;
  /**
   * LES VERDICTS DU RÔLE (#11211) — absents (le balayage), le menu reste
   * celui d'avant ; présents, ils GOUVERNENT l'appel, Renommer et Supprimer,
   * et ouvrent Inviter, Gérer les membres, l'administration et Quitter.
   */
  readonly actions?: ConversationActions;
  /** Absentes (le balayage) : ni « Rechercher » ni « Mode de lecture ». */
  readonly doors?: RowMenuDoors;
}): readonly RowMenuItem[] {
  const { flags, unread, language, canCall = false, canDelete = false, more, actions, doors } = params;
  const label = (key: RowMenuLabelKey) => translate(language, key);
  const call = canCall && (actions?.call ?? true);
  const remove = canDelete && (actions?.hide ?? true);
  return [
    ...(call
      ? [
          { id: 'callAudio', label: label('call.action.audio'), glyph: 'phone' } as const,
          { id: 'callVideo', label: label('call.action.video'), glyph: 'videoCamera' } as const,
        ]
      : []),
    { id: 'pin', label: label(flags.isPinned ? 'rowActions.unpin' : 'rowActions.pin'), glyph: 'pushPin' },
    { id: 'mute', label: label(flags.isMuted ? 'rowActions.unmute' : 'rowActions.mute'), glyph: flags.isMuted ? 'bell' : 'bellSlash' },
    ...(doors?.search === true ? [{ id: 'search', label: rowMenuText(language, 'rowMenu.search'), glyph: 'magnifyingGlass' } as const] : []),
    { id: 'read', label: label(unread ? 'rowActions.read' : 'rowActions.unread'), glyph: 'envelopeOpen' },
    ...(doors?.readingMode === true
      ? [{ id: 'readingMode', label: rowMenuText(language, 'rowMenu.readingMode'), glyph: 'eye', submenu: 'readingMode' } as const]
      : []),
    ...(more === undefined ? [] : moreItems(more, language, actions)),
    ...(flags.archiveLocked === true
      ? []
      : [{ id: 'archive', label: label(flags.isArchived ? 'rowActions.unarchive' : 'rowActions.archive'), glyph: 'archive' } as const]),
    ...(actions?.adminOpen === true ? [{ id: 'adminOpen', label: rowMenuText(language, 'rowMenu.adminOpen'), glyph: 'shieldCheck' } as const] : []),
    ...(more === undefined ? [] : blockItems(more, language)),
    ...(actions?.leave === true && canDelete ? [{ id: 'leave', label: rowMenuText(language, 'rowMenu.leave'), glyph: 'signOut', destructive: true } as const] : []),
    ...(remove ? [{ id: 'delete', label: label('rowActions.delete'), glyph: 'trash', destructive: true } as const] : []),
  ];
}

/** L'ordre d'iOS : Détails, Renommer, Inviter, Gérer les membres, Favori, Déplacer vers… */
function moreItems(more: RowMenuMore, language: InterfaceLanguage, actions: ConversationActions | undefined): readonly RowMenuItem[] {
  const rename = more.organize && more.rename && (actions?.rename ?? true);
  return [
    ...(more.details ? [{ id: 'details', label: rowMenuText(language, 'rowMenu.details'), glyph: 'info' } as const] : []),
    ...(rename ? [{ id: 'rename', label: rowMenuText(language, 'rowMenu.rename'), glyph: 'pencilSimple' } as const] : []),
    ...(more.details && actions?.invite === true ? [{ id: 'invite', label: rowMenuText(language, 'rowMenu.invite'), glyph: 'userPlus' } as const] : []),
    ...(more.details && actions?.manageMembers === true
      ? [{ id: 'manageMembers', label: rowMenuText(language, 'rowMenu.manageMembers'), glyph: 'users' } as const]
      : []),
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
  | { readonly kind: 'moveTo'; readonly categoryId: string | null }
  | { readonly kind: 'readingMode'; readonly mode: ConversationReadingMode | null };

/**
 * CE QUE LA LIGNE DEMANDE À L'ÉCRAN (#10593) — renommer (une fenêtre),
 * bloquer ou débloquer (une confirmation pour bloquer), ou un choix de
 * sous-menu à écrire. L'écran possède les fenêtres et le store ; la ligne,
 * mémoïsée, ne fait que nommer le geste.
 *
 * « Inviter » et « Gérer les membres » (revue #11211) ouvrent la fiche, mais
 * pas sur sa tête comme « Détails » : sur l'ajout de membres, ou sur la liste
 * des membres. Trois entrées au même effet, sous trois noms, n'en font qu'une.
 */
export type RowDetailsFocus = 'invite' | 'members';

export type RowIntent =
  | { readonly kind: 'rename' }
  | { readonly kind: 'details'; readonly focus: RowDetailsFocus }
  | { readonly kind: 'block'; readonly intent: 'block' | 'unblock' }
  | Exclude<RowSubmenuChoice, { readonly kind: 'readingMode' }>;

export type RowSubmenuItem = {
  readonly key: string;
  readonly label: string;
  readonly checked: boolean;
  readonly choice: RowSubmenuChoice;
  readonly destructive?: true;
  /** Listée mais sans effet — un mode que cette conversation n'ouvre pas encore. */
  readonly disabled?: true;
  /** Pourquoi elle est désactivée, dans la langue du lecteur — jamais un placeholder. */
  readonly detail?: string;
};

/**
 * CE QUE LE SOUS-MENU « MODE DE LECTURE » MONTRE (#11226) — les cinq lignes
 * du chip du fil (`menuRows`, la MÊME loi de dégrisage et de raison) et la
 * préférence posée pour cette conversation (`null` : Automatique).
 */
export type RowReadingModeMenu = {
  readonly rows: readonly MenuRow[];
  readonly sticky: ConversationReadingMode | null;
};

/** « Automatique » en tête, puis les cinq modes — l'ordre d'iOS (`LentilleModeMenuModel`). */
function readingModeItems(menu: RowReadingModeMenu | undefined, language: InterfaceLanguage): readonly RowSubmenuItem[] {
  if (menu === undefined) return [];
  return [
    { key: 'auto', label: translate(language, 'readingMode.auto'), checked: menu.sticky === null, choice: { kind: 'readingMode', mode: null } },
    ...menu.rows.map((row) => ({
      key: row.mode,
      label: row.title,
      checked: menu.sticky === row.mode,
      choice: { kind: 'readingMode', mode: row.mode } as const,
      ...(row.isAvailable ? {} : { disabled: true as const, detail: row.reason ?? '' }),
    })),
  ];
}

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
  readonly readingMode?: RowReadingModeMenu;
}): readonly RowSubmenuItem[] {
  const { submenu, favorite, categoryId, categories, language } = params;
  if (submenu === 'readingMode') return readingModeItems(params.readingMode, language);
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
