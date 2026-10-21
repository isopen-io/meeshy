import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';
import {
  MAX_PRIMARY_ACTIONS,
  type MessageActionGroupName,
  type MessageActionId as PolicyActionId,
  type MessageActions,
} from '@meeshy/shared/utils/message-action-policy';

import { contentExitOf, exitOffers, messageExitOffers, pieceIsOpen, type ExitMessage } from '@/lib/view/content-exit';
import type { Message, MessageTranslation } from '@/lib/api/types';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { PlainMessagePiecesKey } from '@/lib/i18n-message-pieces-catalog';
import { kindOf, translationsOf } from '@/lib/view/message';
import { protectionOf } from '@/lib/reading-mode/protection';

import { messageActionsOf, type ActionMessage, type ActionScope } from './message-action-scope';
import { placeOf, type SharedPlace } from './message-body';

export { menuConversationOf, menuViewerOf, type ActionScope, type MenuViewer } from './message-action-scope';

/**
 * LE MENU DU MESSAGE — UNE PROJECTION DE `messageActionsFor` (#5814, #11210).
 *
 * CE QU'UN LECTEUR PEUT FAIRE d'un message n'est plus décidé ici : c'est la
 * loi partagée (`packages/shared/utils/message-action-policy.ts`), qui reprend
 * les admissions de la passerelle (rôle de plateforme, rôle dans la
 * conversation, auteur, compte, droit d'écrire, bout en bout). Ce fichier ne
 * dit que ce que l'écran SAIT SERVIR de ces verdicts — un contrôle existe s'il
 * a un effet (loi 4) — et les range en GROUPES :
 *
 * - `primary` : au plus six gestes, Répondre en tête, Réessayer devant tout
 *   sur un envoi en échec, puis les gestes du TYPE (lien, lieu, contact) ;
 * - `organize` : Sélectionner, l'épingle, Imager ;
 * - `more` : ce qui déborde, « Plus… » et la mention discrète du bout en bout ;
 * - `moderation` : Retirer le message d'un autre ;
 * - `destructive` : Supprimer, séparé et dit dans la couleur de l'erreur.
 *
 * Sans la loi (aucun lecteur remis), rien de ce qu'un rôle ou un auteur
 * décide ne s'offre : seuls restent les gestes que la loi de sortie gouverne.
 *
 * Ce fichier ne rend RIEN et ne porte AUCUN libellé : il nomme des CLÉS, dans
 * le catalogue qui les porte (`catalog`), et `message-menu.tsx` les dit.
 */

/**
 * `reply` ARME UNE RÉPONSE (#7555) — « composer » garde le sens iOS (ouvrir
 * l'atelier sur le média d'un message). Son glyphe est la flèche de réponse
 * depuis #11210 (dette #7564 soldée). `forward` reste GARDÉ par `canForward` :
 * la règle du serveur est dite ICI, avant l'aller-retour.
 */
export type MessageActionId =
  | 'retry'
  | 'reply'
  | 'openLink'
  | 'copyLink'
  | 'openInMaps'
  | 'copyAddress'
  | 'saveContact'
  | 'edit'
  | 'copy'
  | 'forward'
  | 'translate'
  | 'translateOnDevice'
  | 'save'
  | 'select'
  | 'pin'
  | 'unpin'
  | 'export'
  | 'exportQuick'
  | 'exportDiscussion'
  | 'addSticker'
  | 'more'
  | 'e2eeNotice'
  | 'remove'
  | 'delete';

export type MessageMenuGlyph =
  | 'pencilSimple'
  | 'downloadSimple'
  | 'checkCircle'
  | 'globe'
  | 'copy'
  | 'arrowBendUpRight'
  | 'arrowUUpLeft'
  | 'imageSquare'
  | 'lightning'
  | 'dotsThree'
  | 'arrowClockwise'
  | 'arrowSquareOut'
  | 'mapPin'
  | 'pushPin'
  | 'prohibit'
  | 'lockSimple'
  | 'trash';

export type MessageMenuGroupName = MessageActionGroupName;

/** Le plafond du groupe principal — celui de la loi partagée. */
export const MAX_PRIMARY_MENU_ACTIONS = MAX_PRIMARY_ACTIONS;

/**
 * UNE CLÉ, JAMAIS UN LIBELLÉ (#7555) — et le CATALOGUE qui la porte : celui
 * d'interface (à son plafond, `budgets.json`) ou celui du fil, chargé avec
 * lui (`i18n-message-pieces-catalog`). `satisfies` vérifie chaque clé contre
 * son catalogue : une clé absente des sept langues ne compile pas.
 */
const INTERFACE_LABELS = {
  select: 'message.menu.select',
  translate: 'message.menu.translate',
  copy: 'message.menu.copy',
  forward: 'message.menu.forward',
  reply: 'message.menu.reply',
  export: 'message.menu.export',
  exportQuick: 'message.menu.exportQuick',
  exportDiscussion: 'message.menu.exportDiscussion',
  more: 'message.menu.more',
  /* « ENREGISTRER » (#10599) — le mot de la visionneuse : même geste, même mot. */
  save: 'media.viewer.save',
  /* « RETIRER » (#11150) — le mot de la feuille du motif. */
  remove: 'moderation.remove.action',
  /* La carte de contact (#11210) — le mot de la carte elle-même. */
  saveContact: 'contactCard.download',
} as const satisfies Readonly<Partial<Record<MessageActionId, InterfaceCatalogKey>>>;

const PIECES_LABELS = {
  edit: 'message.edit.action',
  addSticker: 'message.sticker.add',
  retry: 'message.menu.retry',
  translateOnDevice: 'message.menu.translateOnDevice',
  openLink: 'message.link.open',
  copyLink: 'message.link.copy',
  openInMaps: 'message.location.open',
  copyAddress: 'message.location.copy',
  pin: 'message.pin.action',
  unpin: 'message.unpin.action',
  delete: 'message.delete.action',
  e2eeNotice: 'message.menu.e2eeAbsent',
} as const satisfies Readonly<Partial<Record<MessageActionId, PlainMessagePiecesKey>>>;

export type MessageMenuLabelKey = (typeof INTERFACE_LABELS)[keyof typeof INTERFACE_LABELS];

export type MessageMenuPiecesLabelKey = (typeof PIECES_LABELS)[keyof typeof PIECES_LABELS];

type InterfaceId = keyof typeof INTERFACE_LABELS;
type PiecesId = keyof typeof PIECES_LABELS;

export type MessageMenuItem = { readonly glyph: MessageMenuGlyph; readonly group: MessageMenuGroupName } & (
  | { readonly id: InterfaceId; readonly catalog: 'interface'; readonly labelKey: MessageMenuLabelKey }
  | { readonly id: PiecesId; readonly catalog: 'pieces'; readonly labelKey: MessageMenuPiecesLabelKey }
);

const GLYPHS: Readonly<Record<MessageActionId, MessageMenuGlyph>> = {
  retry: 'arrowClockwise',
  reply: 'arrowUUpLeft',
  openLink: 'arrowSquareOut',
  copyLink: 'copy',
  openInMaps: 'mapPin',
  copyAddress: 'copy',
  saveContact: 'downloadSimple',
  edit: 'pencilSimple',
  copy: 'copy',
  forward: 'arrowBendUpRight',
  translate: 'globe',
  translateOnDevice: 'globe',
  save: 'downloadSimple',
  select: 'checkCircle',
  pin: 'pushPin',
  unpin: 'pushPin',
  export: 'imageSquare',
  exportQuick: 'lightning',
  exportDiscussion: 'imageSquare',
  addSticker: 'downloadSimple',
  more: 'dotsThree',
  e2eeNotice: 'lockSimple',
  remove: 'prohibit',
  delete: 'trash',
};

const isInterfaceId = (id: MessageActionId): id is InterfaceId => id in INTERFACE_LABELS;

function entry(id: InterfaceId | PiecesId, group: MessageMenuGroupName): MessageMenuItem {
  if (isInterfaceId(id)) return { id, catalog: 'interface', labelKey: INTERFACE_LABELS[id], glyph: GLYPHS[id], group };
  return { id, catalog: 'pieces', labelKey: PIECES_LABELS[id], glyph: GLYPHS[id], group };
}

export type MessageMenuContext = {
  readonly hasText: boolean;
  /** `kind !== 'standard'` (D-23) — un message voilé, brûlé ou supprimé n'offre ni Copier ni Traduire. */
  readonly isProtected: boolean;
  /** `1 + traductions.length` — Traduire n'apparaît qu'à partir de 2 (loi 4). */
  readonly languageCount: number;
  /** #5866, #9573 — la loi de sortie autorise le transfert, dit AVANT l'aller-retour. */
  readonly canForward: boolean;
  /** LE CONTENU PEUT QUITTER MEESHY (#9573) — absent ⇒ rien ne le retient. */
  readonly leaves?: boolean;
  /** LE MESSAGE PEUT S'IMAGER, CITATION COMPRISE (#9573) — absent ⇒ rien ne le retient. */
  readonly imageLeaves?: boolean;
  /** LA DISCUSSION QUI MÈNE AU MESSAGE PEUT S'IMAGER (#9039, #9573) — posé par l'hôte. */
  readonly discussionImageable?: boolean;
  /** UNE VUE UNIQUE N'OFFRE RIEN QUI TOUCHE À SON CONTENU (#7580). */
  readonly isViewOnce?: boolean;
  /** Supprimé, ou éphémère échu : il n'est plus là pour personne (#11210). */
  readonly gone?: boolean;
  readonly hasDefaultExportFormat?: boolean;
  /** UNE PHOTO, UNE VIDÉO OU UN VOCAL NON MASQUÉS (#8693). */
  readonly hasImageableMedia?: boolean;
  readonly composableIndex?: number | null;
  /** L'HÔTE A UN MODE ÉDITION ET LE VERDICT L'ADMET (#10581) ; absent ⇒ rien n'est offert. */
  readonly canEdit?: boolean;
  /** LE MESSAGE PORTE EXACTEMENT UNE PIÈCE ENREGISTRABLE (#10599). */
  readonly canSave?: boolean;
  /** LE MESSAGE EST UN STICKER (#10630). */
  readonly sticker?: { readonly inLibrary: boolean; readonly hasPicture: boolean };
  /**
   * LES VERDICTS DE LA LOI PARTAGÉE (#11210, `messageActionsFor`) — absents,
   * rien de ce qu'un rôle ou un auteur décide ne s'offre (fermé par défaut).
   */
  readonly actions?: MessageActions;
  /** Le premier lien `http(s)` du texte, nettoyé de sa ponctuation finale (#11210). */
  readonly link?: string | null;
  /** Le lieu partagé (#11210, `placeOf`). */
  readonly place?: SharedPlace | null;
  /** L'HÔTE SAIT RÉESSAYER CET ENVOI (`useSend.retry`, #11210). */
  readonly canRetry?: boolean;
  /** LE CATALOGUE DU FIL EST CHARGÉ : les libellés qui y vivent peuvent se dire. */
  readonly piecesLabels?: boolean;
};

type MenuPiece = {
  readonly mimeType: string;
  readonly originalName?: string | null;
  readonly fileName?: string | null;
  readonly isBlurred?: boolean;
  readonly isViewOnce?: boolean;
  readonly isEncrypted?: boolean;
  readonly effectFlags?: number | null;
};

const WEB_LINK = /(?<![@\w])https?:\/\/[^\s<>"]+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)\]'’»]+$/;

/** Le premier lien `http(s)` du texte — jamais un autre schéma, jamais une adresse que `URL` refuse. */
export function firstLinkOf(text: string): string | null {
  const match = WEB_LINK.exec(text);
  if (match === null) return null;
  const candidate = match[0].replace(TRAILING_PUNCTUATION, '');
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? candidate : null;
  } catch {
    return null;
  }
}

type MenuMessage = Omit<ExitMessage, 'attachments'> &
  Pick<Message, 'content'> &
  Partial<Omit<ActionMessage, 'attachments' | 'content'>> & {
    readonly translations?: readonly MessageTranslation[];
    readonly attachments?: readonly MenuPiece[];
    readonly replyTo?: ExitMessage | null;
  };

const actionMessageOf = (message: MenuMessage): ActionMessage | null =>
  message.id === undefined || message.senderId === undefined || message.createdAt === undefined
    ? null
    : { ...message, id: message.id, senderId: message.senderId, createdAt: message.createdAt, isViewOnce: message.isViewOnce === true, isBlurred: message.isBlurred === true };

/**
 * Dérive le contexte d'UN message, à l'instant `now` — jamais de seconde
 * horloge. `scope` (#11210) : le lecteur et la conversation, remis à
 * `messageActionsFor` ; absent, aucun verdict n'est posé. `failed` : l'envoi
 * de ce message a échoué (l'hôte le sait, `useSend`).
 *
 * GARDE (#7526, #7527) : `message.translations` peut être UNDEFINED dans le
 * cache allégé — `translationsOf` déclare l'optionalité, une fois.
 */
export function messageMenuContextOf(
  message: MenuMessage,
  input: { readonly now: number; readonly scope?: ActionScope; readonly failed?: boolean },
): MessageMenuContext {
  const exit = contentExitOf(message, input.now);
  const leaves = exitOffers(exit, 'image');
  const open = leaves ? (message.attachments ?? []).map((piece) => (pieceIsOpen(piece) ? kindOf(piece) : 'file')) : [];
  const composable = exitOffers(exit, 'compose') ? open.findIndex((form) => form === 'image' || form === 'video') : -1;
  const subject = input.scope === undefined ? null : actionMessageOf(message);
  const gone = message.deletedAt != null || (message.expiresAt != null && new Date(message.expiresAt).getTime() <= input.now);
  return {
    hasText: message.content.trim().length > 0,
    isProtected: !exit.readable,
    languageCount: 1 + translationsOf(message).length,
    canForward: exitOffers(exit, 'forward'),
    leaves: exitOffers(exit, 'copy'),
    imageLeaves: messageExitOffers(message, 'image', input.now),
    isViewOnce: message.isViewOnce === true,
    gone,
    hasImageableMedia: open.some((form) => form !== 'file'),
    composableIndex: composable === -1 ? null : composable,
    link: firstLinkOf(message.content),
    place: placeOf(message),
    ...(subject === null || input.scope === undefined
      ? {}
      : { actions: messageActionsOf(subject, input.scope, { now: input.now, ...(input.failed === undefined ? {} : { failed: input.failed }) }) }),
  };
}

/**
 * CE QUE LA FEUILLE « PLUS… » PEUT MONTRER D'UN MESSAGE (#8008) — ni langues
 * ni pièces pour un message flouté, à vue unique, échu ou supprimé : le nom
 * d'un fichier est un contenu (leçon 275). La loi est `protectionOf`.
 */
export function messageDetailExposureOf(
  message: Pick<Message, 'deletedAt' | 'isViewOnce' | 'viewOnceCount' | 'isBlurred' | 'expiresAt'>,
  input: { readonly now: number },
): boolean {
  return protectionOf(message, input.now) === 'standard';
}

/** « Imager » a quelque chose à peindre ET le contenu peut sortir, citation comprise — la garde du menu, de son sous-menu et de « Plus… ». */
export const imageableOf = (ctx: MessageMenuContext): boolean =>
  (ctx.hasText || ctx.hasImageableMedia === true) && !ctx.isProtected && ctx.leaves !== false && ctx.imageLeaves !== false;

const copyable = (ctx: MessageMenuContext): boolean => ctx.hasText && !ctx.isProtected && ctx.leaves !== false;
const labels = (ctx: MessageMenuContext): boolean => ctx.piecesLabels === true;
const exportsOut = (ctx: MessageMenuContext): boolean => !ctx.isProtected && ctx.leaves !== false;

type Servable = { readonly id: InterfaceId | PiecesId; readonly offered: (ctx: MessageMenuContext) => boolean };

/** Les gestes PRINCIPAUX que la loi range (`groups.primary` puis `groups.more`) et ce que l'écran sait en servir. */
const SERVABLE: Readonly<Partial<Record<PolicyActionId, Servable>>> = {
  retry: { id: 'retry', offered: (ctx) => ctx.canRetry === true && labels(ctx) },
  reply: { id: 'reply', offered: (ctx) => ctx.isViewOnce !== true },
  openLink: { id: 'openLink', offered: (ctx) => ctx.link != null && labels(ctx) },
  copyLink: { id: 'copyLink', offered: (ctx) => ctx.link != null && labels(ctx) && exportsOut(ctx) },
  openInMaps: { id: 'openInMaps', offered: (ctx) => ctx.place != null && labels(ctx) },
  copyAddress: { id: 'copyAddress', offered: (ctx) => ctx.place != null && labels(ctx) && exportsOut(ctx) },
  saveContact: { id: 'saveContact', offered: exportsOut },
  edit: { id: 'edit', offered: (ctx) => ctx.canEdit === true && ctx.hasText },
  copy: { id: 'copy', offered: copyable },
  forward: { id: 'forward', offered: (ctx) => ctx.canForward },
  translate: { id: 'translate', offered: (ctx) => ctx.hasText && !ctx.isProtected && ctx.languageCount > 1 },
  save: { id: 'save', offered: (ctx) => ctx.canSave === true && ctx.sticker === undefined && exportsOut(ctx) },
};

/** Sans la loi, seuls les gestes que la loi de SORTIE gouverne — aucun rôle, aucun auteur. */
const EXIT_ONLY: readonly PolicyActionId[] = ['copy', 'forward', 'translate', 'save'];

/** En bout en bout, « Traduire » ne demande rien au serveur : il bascule entre les traductions de l'appareil. */
const translateEntry = (ctx: MessageMenuContext): readonly MessageMenuItem[] => {
  if (ctx.actions?.verdicts.translate !== 'device') return [entry('translate', 'primary')];
  return labels(ctx) ? [entry('translateOnDevice', 'primary')] : [];
};

function primaryCandidates(ctx: MessageMenuContext): readonly MessageMenuItem[] {
  const order = ctx.actions === undefined ? EXIT_ONLY : [...ctx.actions.groups.primary, ...ctx.actions.groups.more];
  return order.flatMap((id): readonly MessageMenuItem[] => {
    const servable = SERVABLE[id];
    if (servable === undefined || !servable.offered(ctx)) return [];
    return servable.id === 'translate' ? translateEntry(ctx) : [entry(servable.id, 'primary')];
  });
}

function organizeGroup(ctx: MessageMenuContext): readonly MessageMenuItem[] {
  const pin = ctx.actions?.verdicts.pin ?? null;
  const sticker = ctx.sticker?.inLibrary === false && ctx.sticker.hasPicture && exportsOut(ctx);
  return [
    entry('select', 'organize'),
    ...(pin !== null && labels(ctx) ? [entry(pin, 'organize')] : []),
    ...(imageableOf(ctx) ? [entry('export', 'organize'), ...(ctx.hasDefaultExportFormat === true ? [entry('exportQuick', 'organize')] : [])] : []),
    ...(sticker ? [entry('addSticker', 'organize')] : []),
  ];
}

export type MessageMenuGroups = { readonly [group in MessageMenuGroupName]: readonly MessageMenuItem[] };

/**
 * LES GROUPES DU MENU RAPIDE (#11210). Un message SUPPRIMÉ ou échu n'offre
 * que de le masquer chez soi ; une VUE UNIQUE ne touche pas à son contenu
 * (#7580) : « Plus… », et ce que la loi admet de retirer ou de supprimer.
 */
export function messageMenuGroups(ctx: MessageMenuContext): MessageMenuGroups {
  const verdicts = ctx.actions?.verdicts;
  const deletes = verdicts !== undefined && (verdicts.deleteForEveryone || verdicts.deleteForMe) && labels(ctx);
  const destructive = deletes ? [entry('delete', 'destructive')] : [];
  if (ctx.gone === true) return { primary: [], organize: [], more: [], moderation: [], destructive };
  const moderation = verdicts?.remove != null && labels(ctx) ? [entry('remove', 'moderation')] : [];
  const notice = verdicts?.serverFeatureAbsence != null && labels(ctx) ? [entry('e2eeNotice', 'more')] : [];
  if (ctx.isViewOnce === true) return { primary: [], organize: [], more: [entry('more', 'more'), ...notice], moderation, destructive };
  const candidates = primaryCandidates(ctx);
  const overflow = candidates.slice(MAX_PRIMARY_MENU_ACTIONS).map((item) => ({ ...item, group: 'more' as const }));
  return {
    primary: candidates.slice(0, MAX_PRIMARY_MENU_ACTIONS),
    organize: organizeGroup(ctx),
    more: [...overflow, entry('more', 'more'), ...notice],
    moderation,
    destructive,
  };
}

const GROUP_ORDER: readonly MessageMenuGroupName[] = ['primary', 'organize', 'more', 'moderation', 'destructive'];

/** Le menu À PLAT, dans l'ordre des groupes — chaque entrée dit le sien (`group`), le rendu y pose ses séparateurs. */
export function messageMenuItems(ctx: MessageMenuContext): readonly MessageMenuItem[] {
  const groups = messageMenuGroups(ctx);
  return GROUP_ORDER.flatMap((group) => groups[group]);
}

/**
 * **LE SOUS-MENU DE « TRANSFÉRER »** (#9039) — « Transférer » y garde son
 * effet et propose « Imager la discussion », sous la garde d'« Imager ». Une
 * seule entrée ⇒ le menu n'ouvre pas de sous-menu (loi 4).
 */
export function forwardMenuItems(ctx: MessageMenuContext): readonly MessageMenuItem[] {
  const forward = entry('forward', 'primary');
  if (!imageableOf(ctx) || ctx.discussionImageable === false) return [forward];
  return [forward, entry('exportDiscussion', 'primary')];
}

/**
 * **LE FAVORI, DANS « PLUS… »** (#7378) — miroir de
 * `MessageActionResolver.moreSections` (`apps/ios/Meeshy/Features/Main/
 * Components/MessageActionResolver.swift`, `ctx.isStarred ? .unstar : .star`) :
 * iOS range l'étoile dans la feuille « Plus… », section « Faire », juste après
 * l'épingle. Le web n'a pas d'épingle — l'étoile ouvre la section.
 *
 * DEUX ÉCARTS avec iOS, assumés parce qu'ils vont dans le sens de la vérité :
 * - `null` quand l'état est INCONNU (l'ensemble des favoris n'est pas chargé,
 *   `starred-messages-cache.ts`) : proposer « Ajouter » sur un message déjà en
 *   favori ferait mentir le geste ;
 * - `null` pour AJOUTER sur un message que le serveur refuserait (vue unique :
 *   409 `MESSAGE_NOT_STARRABLE`) : iOS la propose sans condition parce que son
 *   magasin est local ; l'entrée disparaît ici plutôt que d'échouer au tap.
 *   Une étoile déjà posée se RETIRE toujours (le retrait serveur est sans
 *   condition).
 *
 * Le LIBELLÉ n'est pas ici : il vit dans les sept catalogues d'interface
 * (`action.star` / `action.unstar`, les clés d'iOS), lus par la feuille.
 */
export type MessageStarAction = 'star' | 'unstar';

export function messageStarAction(ctx: {
  readonly starred: boolean | undefined;
  readonly starrable: boolean;
}): MessageStarAction | null {
  if (ctx.starred === undefined) return null;
  if (ctx.starred) return 'unstar';
  return ctx.starrable ? 'star' : null;
}

/**
 * CE QUE LE SERVEUR ACCEPTERAIT D'ÉTOILER — la règle 2 de #7377
 * (`starredMessageVerdict.ts`) lue côté client : ni supprimé, ni expiré, ni à
 * vue unique (par le booléen ET par le bit `VIEW_ONCE` d'`effectFlags`, comme
 * le verdict serveur). Un message encore OPTIMISTE (`cid_…`,
 * `api/client-message-id.ts`) n'existe pas côté serveur : `PUT` rendrait 404.
 *
 * Flouté, chiffré ou éphémère encore vivant se mettent en favori : ils seront
 * servis en PLACEHOLDER (règle 3), jamais refusés.
 */
export function starrableOf(
  message: Pick<Message, 'id' | 'deletedAt' | 'expiresAt' | 'isViewOnce' | 'effectFlags'>,
  input: { readonly now: number },
): boolean {
  if (message.id.startsWith('cid_')) return false;
  if (message.deletedAt != null) return false;
  if (message.expiresAt != null && new Date(message.expiresAt).getTime() <= input.now) return false;
  return !message.isViewOnce && ((message.effectFlags ?? 0) & MESSAGE_EFFECT_FLAGS.VIEW_ONCE) === 0;
}

/**
 * **ÉPINGLER / DÉTACHER** (#7558, #11210) — le verdict `pin` de
 * `messageActionsFor` : un compte, un membre actif, un message vivant, ni
 * système ni à vue unique, jamais un mineur dans Meeshy Global (que le web ne
 * connaît pas : le refus 403 revient et se dit, `use-message-pin.ts`). Tout
 * membre l'épingle, auteur ou non.
 */
export type MessagePinAction = 'pin' | 'unpin';

export function messagePinAction(message: ActionMessage, scope: ActionScope, input: { readonly now: number }): MessagePinAction | null {
  return messageActionsOf(message, scope, input).verdicts.pin;
}

/**
 * **SIGNALER UN MESSAGE** (#7558, #11210) — le verdict `report` : un compte,
 * un message vivant et non système, jamais le sien. Une VUE UNIQUE ne l'offre
 * pas, comme iOS (`viewOnceSections` : Supprimer et Infos seulement).
 */
export function reportOffered(message: ActionMessage, scope: ActionScope, input: { readonly now: number } = { now: Date.now() }): boolean {
  const actions = messageActionsOf(message, scope, input);
  return actions.verdicts.report && !actions.content.flags.viewOnce;
}

/** Les 6 réactions rapides par DÉFAUT — miroir `MessageOverlayMenu.swift:99-101`.
 * Le rail et le composeur les classent par usage (`lib/emoji-usage.ts`, #7983). */
export const QUICK_REACTIONS = ['😂', '❤️', '👍', '😮', '😢', '🔥'] as const;

/** Les 20 emojis étendus — miroir `MessageOverlayMenu.swift:99-104`
 * (`defaultEmojis`), servis par la feuille « Ajouter une réaction ». */
export const EXTENDED_REACTIONS = [
  '😂', '❤️', '👍', '😮', '😢', '🔥',
  '🎉', '💯', '🥰', '😎', '🙏', '💀',
  '🤣', '✨', '👏', '🤔', '🥺', '😍',
  '🫶', '💪',
] as const;

export type TranslationChoice = {
  readonly code: string;
  readonly isOriginal: boolean;
  readonly isServed: boolean;
};

/**
 * Les langues offertes par le sous-menu « Traduire » — l'ORIGINAL d'abord,
 * puis les rangs du PRISME du lecteur (dans SON ordre, jamais celui du
 * tableau de traductions), puis le reste des traductions disponibles.
 *
 * Témoin de RANG (leçon 261) : un lecteur `['es','en']` sur un message `fr`
 * traduit en `en` sert l'anglais au RANG 2 (« es » n'a pas de traduction) —
 * la servie n'est donc jamais celle du rang 1, et le verdict distingue une
 * loi juste d'une loi qui s'arrêterait au premier rang.
 *
 * GARDE (#7526, rendue EFFECTIVE #7527) : `translations` est OPTIONNEL ici,
 * hors du `Pick` — voir `messageMenuContextOf` ci-dessus.
 */
export function translationChoices(params: {
  readonly message: Pick<Message, 'originalLanguage'> & { readonly translations?: readonly MessageTranslation[] };
  readonly preferredLanguages: readonly string[];
  readonly servedLanguage: string;
}): readonly TranslationChoice[] {
  const { message, preferredLanguages, servedLanguage } = params;
  const translations = translationsOf(message);
  const available = new Set(translations.map((t) => t.language));
  const seen = new Set<string>();
  const choices: TranslationChoice[] = [];

  const original = message.originalLanguage;
  if (original !== null && original !== undefined) {
    choices.push({ code: original, isOriginal: true, isServed: servedLanguage === original });
    seen.add(original);
  }

  for (const lang of preferredLanguages) {
    if (seen.has(lang) || !available.has(lang)) continue;
    choices.push({ code: lang, isOriginal: false, isServed: servedLanguage === lang });
    seen.add(lang);
  }

  for (const t of translations) {
    if (seen.has(t.language)) continue;
    choices.push({ code: t.language, isOriginal: false, isServed: servedLanguage === t.language });
    seen.add(t.language);
  }

  return choices;
}
