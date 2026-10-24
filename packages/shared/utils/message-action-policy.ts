/**
 * CE QU'UN LECTEUR PEUT FAIRE D'UN MESSAGE (#11205) — loi PURE des clients,
 * `now` injecté. Elle reprend `admitMessageEdit`, `admitMessageDelete` et
 * `admitConversationWriteFor`, qui font foi : elle n'offre jamais ce qu'ils
 * refusent, et peut offrir MOINS (E2EE, vue unique, message système) — tenu
 * par `action-policy-parity.test.ts` (passerelle) sur `fixtures/action-policy/`.
 * Rôle de plateforme comparé EXACTEMENT, comme la passerelle (AUDIT, ANALYST,
 * inconnu et minuscules ne modèrent pas) ; rang de conversation exact, inconnu
 * ⇒ 0. Réagir n'est pas écrire : `ReactionService.addReaction` ne lit ni rang
 * d'écriture, ni canal d'annonces, ni règle des mineurs. E2EE au sens de
 * `sharedTranslationServerReadsMessage` (régime inconnu ⇒ chiffré) : ni édition
 * ni transfert, traduction sur l'appareil, services qui lisent le clair ABSENTS.
 * Transférer, copier, enregistrer : `contentExitLaw`.
 */

import { MEMBER_ROLE_HIERARCHY, WRITE_PERMISSION_HIERARCHY, isGlobalAdmin } from '../types/role-types.js';
import { contentExitLaw, type ContentExitLaw } from './content-exit-law.js';
import { GLOBAL_CONVERSATION_TYPE } from './global-minor-restriction.js';
import { messageContentKind, type MessageContentKind, type MessageContentShape, type MessageContentSubject } from './message-content-kind.js';
import { sharedTranslationServerReadsMessage } from './shared-translation-eligibility.js';

/** 24 heures, bornes incluses — la fenêtre d'édition de l'AUTEUR (`messageEditAdmission.ts`). */
export const MESSAGE_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Au-delà, les actions passent dans « Plus… ». */
export const MAX_PRIMARY_ACTIONS = 6;

type Instant = Date | string | number;

export type ActionConversation = {
  /** direct | group | public | global | broadcast ; un type inconnu n'ouvre rien qui dépende du type. */
  readonly type: string;
  readonly encryptionMode?: string | null;
  readonly isActive?: boolean | null;
  readonly closedAt?: Instant | null;
  readonly isAnnouncementChannel?: boolean | null;
  readonly defaultWriteRole?: string | null;
};

export type ActionViewer = {
  /** `User.id` pour un inscrit ; `Participant.id` pour un invité. */
  readonly id: string;
  readonly participantId?: string | null;
  /** Un lecteur qui porte `isAnonymous` est un invité, quel que soit `hasAccount` (fermé par défaut). */
  readonly hasAccount: boolean;
  readonly isAnonymous: boolean;
  /** `User.role`, en majuscules. */
  readonly platformRole: string | null;
  /** `Participant.role` DANS cette conversation. */
  readonly conversationRole: string | null;
  readonly isActiveMember: boolean;
  /** Permission d'envoi de l'invité (`Participant.permissions`) ; vraie pour un inscrit. */
  readonly canSendMessages: boolean;
  readonly isDeclaredMinor: boolean;
};

export type MessageActionSubject = MessageContentSubject & {
  /** `Participant.id` de l'auteur. */
  readonly senderId?: string | null;
  /** `User.id` de l'auteur ; absent pour un invité. */
  readonly authorUserId?: string | null;
  readonly createdAt?: Instant | null;
  /** Épinglé : le geste devient « Désépingler ». */
  readonly pinnedAt?: Instant | null;
  /** Avis de capture : le lecteur a écrit le message qu'il nomme — l'hôte le sait, la loi ne lit rien. */
  readonly capturedMessageIsMine?: boolean | null;
};

export type MessageActionInput = { readonly message: MessageActionSubject; readonly conversation: ActionConversation; readonly viewer: ActionViewer; readonly now: number };

export type MessageActionId =
  | 'retry' | 'reply' | 'openLink' | 'copyLink' | 'openInMaps' | 'copyAddress' | 'saveContact' | 'viewResults'
  | 'edit' | 'copy' | 'forward' | 'translate' | 'save' | 'transcribe' | 'sentiment' | 'report' | 'pin' | 'unpin'
  | 'remove' | 'deleteForEveryone' | 'deleteForMe' | 'discard';

export type MessageActionGroupName = 'primary' | 'organize' | 'more' | 'moderation' | 'destructive';

export type MessageActionGroups = { readonly [group in MessageActionGroupName]: readonly MessageActionId[] };

/** `windowEndsAt` (ms) : fin de la fenêtre de l'auteur ; `null` quand un rôle l'ouvre sans fenêtre. */
export type EditVerdict = { readonly asModerator: boolean; readonly windowEndsAt: number | null };

export type TranslateVerdict = 'served-switch' | 'device' | null;

export type PinVerdict = 'pin' | 'unpin' | null;

export type ServerFeatureAbsence = 'e2ee-server-feature-absent';

export type MessageActionVerdicts = {
  readonly edit: EditVerdict | null;
  readonly deleteForEveryone: boolean;
  /** `DELETE /messages/:id/delete-for-me` : un inscrit, participant ACTIF (#11415) — l'appartenance inconnue se dit fermée. */
  readonly deleteForMe: boolean;
  /** Retrait par un tiers modérateur : un motif est exigé, l'auteur en est prévenu. */
  readonly remove: { readonly reasonRequired: true } | null;
  readonly pin: PinVerdict;
  /** `verifierCible` (`routes/reports/target.ts`) : un membre actif, jamais sur son propre message (#11220). */
  readonly report: boolean;
  /** Un message vivant, non système, un membre actif d'une conversation ouverte — sans le droit d'écrire. */
  readonly canReact: boolean;
  /** Le droit d'écrire en plus (`admitConversationWriteFor`). */
  readonly canReply: boolean;
  readonly translate: TranslateVerdict;
  /** `null` : le service n'existe pas dans ce mode (voir `serverFeatureAbsence`). */
  readonly transcribe: boolean | null;
  readonly sentiment: boolean | null;
  /** Les trois sorties de `contentExitLaw`. */
  readonly forward: boolean;
  readonly copy: boolean;
  readonly save: boolean;
  readonly serverFeatureAbsence: ServerFeatureAbsence | null;
};

export type MessageActions = { readonly content: MessageContentShape; readonly groups: MessageActionGroups; readonly verdicts: MessageActionVerdicts };

const MODERATED_TYPES: ReadonlySet<string> = new Set(['group', 'public', 'global', 'broadcast']);
const WRITE_HIERARCHY_FREE_TYPES: ReadonlySet<string> = new Set(['global', 'direct']);
const PRIVILEGED_CONVERSATION_RANK = MEMBER_ROLE_HIERARCHY.moderator;
const MEMBER_RANKS: ReadonlyMap<string, number> = new Map(Object.entries(MEMBER_ROLE_HIERARCHY));
const SAVEABLE_KINDS: ReadonlySet<MessageContentKind> = new Set(['image', 'video', 'audio', 'file', 'multi']);
const WRITE_RANKS: ReadonlyMap<string, number> = new Map(Object.entries(WRITE_PERMISSION_HIERARCHY));
const NOTICE_KINDS: ReadonlySet<MessageContentKind> = new Set(['system', 'call']);
/** Un lieu, un sondage, un sticker : leur texte n'en porte pas la structure (`metadata`). */
const EDITABLE_KINDS: ReadonlySet<MessageContentKind> = new Set(['text', 'link', 'image', 'video', 'audio', 'file', 'contact', 'multi']);
/** `PRIVILEGED_GLOBAL_ROLES` et `PLATFORM_STAFF_ROLES` de la passerelle, comparés EXACTEMENT. */
const PLATFORM_MODERATOR_ROLES: ReadonlySet<string> = new Set(['MODERATOR', 'ADMIN', 'BIGBOSS']);

const msOf = (instant: Instant | null | undefined): number =>
  instant == null ? Number.NaN : (instant instanceof Date ? instant.getTime() : new Date(instant).getTime());

export const platformModerates = (viewer: ActionViewer): boolean => PLATFORM_MODERATOR_ROLES.has(viewer.platformRole ?? '');

/** `isGlobalAdmin`, comme `actsWithCreatorRights` de la passerelle. */
export const platformAdministers = (viewer: ActionViewer): boolean => isGlobalAdmin(viewer.platformRole ?? '');

export const viewerIsRegistered = (viewer: ActionViewer): boolean => viewer.hasAccount && !viewer.isAnonymous;

/** Le régime de la CONVERSATION retire-t-il au serveur le clair ? Même loi que la traduction partagée. */
export const conversationIsEndToEnd = (conversation: ActionConversation): boolean =>
  !sharedTranslationServerReadsMessage({ conversationEncryptionMode: conversation.encryptionMode, messageIsEncrypted: false, messageEncryptionMode: null });

export const conversationIsClosed = (conversation: ActionConversation): boolean =>
  conversation.isActive === false || conversation.closedAt != null;

/**
 * Le rang de la LIGNE de participation — 0 hors membre actif ou illisible. Lu
 * EXACT, en minuscules comme `Participant.role` : la passerelle compare ainsi
 * (`admitMessageDelete`, `admitConversationWriteFor`), et plier la casse
 * offrirait ce qu'elle refuse.
 */
export const memberRankOf = (viewer: ActionViewer): number =>
  viewer.isActiveMember ? MEMBER_RANKS.get(viewer.conversationRole ?? '') ?? 0 : 0;

/** `admitConversationWriteFor`, plus la permission d'envoi de l'invité ; un rang requis inconnu échoue fermé. */
export function viewerCanWrite(conversation: ActionConversation, viewer: ActionViewer): boolean {
  if (conversationIsClosed(conversation) || !viewer.isActiveMember || !viewer.canSendMessages) return false;
  if (conversation.type === GLOBAL_CONVERSATION_TYPE) return !viewer.isDeclaredMinor;
  if (WRITE_HIERARCHY_FREE_TYPES.has(conversation.type)) return true;
  const announcement = conversation.isAnnouncementChannel === true || conversation.type === 'broadcast';
  const requiredRole = announcement ? 'admin' : conversation.defaultWriteRole ?? 'everyone';
  const required = WRITE_RANKS.get(requiredRole) ?? WRITE_PERMISSION_HIERARCHY.creator;
  return memberRankOf(viewer) >= required || platformModerates(viewer);
}

type Context = MessageActionInput & {
  readonly content: MessageContentShape;
  readonly registered: boolean;
  readonly notice: boolean;
  readonly exit: ContentExitLaw;
  readonly e2ee: boolean;
  readonly gone: boolean;
  readonly live: boolean;
  readonly isAuthor: boolean;
  readonly isMine: boolean;
  readonly hasText: boolean;
  readonly readable: boolean;
  /** `sourceIsEncrypted` de `forwardAdmission` : des pièces sous régime `server`/`hybrid` ne se recopient pas côté serveur. */
  readonly piecesNotServerCopyable: boolean;
};

const hasRegime = (mode: string | null | undefined): boolean => (mode ?? '').trim() !== '';

const carriesPieces = (message: MessageActionSubject): boolean => (message.attachments ?? []).some((piece) => piece != null);

/** Conversation ou message sous un régime de chiffrement quelconque : la passerelle n'y recopie aucune pièce. */
const carriesEncryptionRegime = (message: MessageActionSubject, conversation: ActionConversation): boolean =>
  hasRegime(conversation.encryptionMode) || hasRegime(message.encryptionMode) || message.isEncrypted === true;

function contextOf(input: MessageActionInput): Context {
  const content = messageContentKind(input.message);
  const { flags, kind } = content;
  const { message, viewer } = input;
  const gone = kind === 'deleted' || msOf(message.expiresAt) <= input.now;
  const registered = viewerIsRegistered(viewer);
  const isAuthor = registered && message.authorUserId != null && message.authorUserId === viewer.id;
  const participantId = viewer.participantId ?? (registered ? null : viewer.id);
  return {
    ...input,
    content,
    registered,
    notice: NOTICE_KINDS.has(kind),
    exit: contentExitLaw(message),
    e2ee: flags.encrypted || conversationIsEndToEnd(input.conversation),
    gone,
    live: !gone && !flags.optimistic && !flags.failed,
    isAuthor,
    isMine: isAuthor || (participantId !== null && message.senderId === participantId),
    hasText: !NOTICE_KINDS.has(kind) && (message.content ?? '').trim().length > 0,
    readable: !gone && !flags.viewOnce && !flags.blurred,
    piecesNotServerCopyable: carriesPieces(message) && carriesEncryptionRegime(message, input.conversation),
  };
}

/** `admitMessageEdit` — auteur 24 h, rôle global au-delà ou sur autrui — plus les refus propres au client. */
function editVerdict(ctx: Context): EditVerdict | null {
  const { flags } = ctx.content;
  const offered = ctx.live && ctx.registered && ctx.hasText && EDITABLE_KINDS.has(ctx.content.kind) && !ctx.e2ee && !flags.viewOnce;
  if (!offered || conversationIsClosed(ctx.conversation)) return null;
  if (ctx.conversation.type === GLOBAL_CONVERSATION_TYPE && ctx.viewer.isDeclaredMinor) return null;
  if (!ctx.isAuthor) return ctx.viewer.isActiveMember && platformModerates(ctx.viewer) ? { asModerator: true, windowEndsAt: null } : null;
  const createdAt = msOf(ctx.message.createdAt);
  if (Number.isNaN(createdAt)) return { asModerator: false, windowEndsAt: null };
  if (!(ctx.now - createdAt > MESSAGE_EDIT_WINDOW_MS)) return { asModerator: false, windowEndsAt: createdAt + MESSAGE_EDIT_WINDOW_MS };
  return platformModerates(ctx.viewer) ? { asModerator: false, windowEndsAt: null } : null;
}

type DeleteVerdict = { readonly forEveryone: boolean; readonly remove: boolean };

/**
 * `admitMessageDelete` : l'auteur sans fenêtre ; un tiers privilégié retire, jamais en direct ; l'auteur du capturé
 * retire l'avis. Plus strict : un avis système ou un résumé d'appel ne s'efface pas pour tous (`deleteOfferOf` du web).
 */
function deleteVerdict(ctx: Context): DeleteVerdict {
  const { viewer } = ctx;
  const { captureNotice } = ctx.content.flags;
  if (!ctx.live || !ctx.registered || (ctx.notice && !captureNotice)) return { forEveryone: false, remove: false };
  if (ctx.isAuthor) return { forEveryone: !captureNotice, remove: false };
  const privileged = memberRankOf(viewer) >= PRIVILEGED_CONVERSATION_RANK || platformModerates(viewer);
  if (privileged) return { forEveryone: false, remove: MODERATED_TYPES.has(ctx.conversation.type) };
  return { forEveryone: captureNotice && ctx.message.capturedMessageIsMine === true && viewer.isActiveMember, remove: false };
}

/**
 * `admitMessagePin` de `messages-pin.ts` (#11219) : une épingle se voit de TOUS, donc épingler et désépingler
 * exigent le droit d'écrire (`viewerCanWrite` : conversation ouverte, canal d'annonces, rang, mineur de Global).
 * Plus strict que la passerelle sur les avis, la vue unique et les invités.
 */
function pinVerdict(ctx: Context): PinVerdict {
  const pinnable = ctx.live && ctx.registered && !ctx.notice && !ctx.content.flags.viewOnce && viewerCanWrite(ctx.conversation, ctx.viewer);
  if (!pinnable) return null;
  return ctx.message.pinnedAt != null ? 'unpin' : 'pin';
}

function verdictsOf(ctx: Context): MessageActionVerdicts {
  const { kind, flags } = ctx.content;
  const { exit, notice } = ctx;
  const deletion = deleteVerdict(ctx);
  const reacts = ctx.live && !notice && ctx.viewer.isActiveMember && ctx.viewer.canSendMessages && !conversationIsClosed(ctx.conversation);
  const serverFeature = (applies: boolean): boolean | null => (ctx.e2ee ? null : applies && ctx.live && ctx.readable);
  return {
    edit: editVerdict(ctx),
    deleteForEveryone: deletion.forEveryone,
    deleteForMe: ctx.registered && ctx.viewer.isActiveMember && !flags.optimistic,
    remove: deletion.remove ? { reasonRequired: true } : null,
    pin: pinVerdict(ctx),
    report: ctx.live && ctx.registered && ctx.viewer.isActiveMember && !notice && !ctx.isMine,
    canReact: reacts,
    canReply: reacts && !flags.viewOnce && viewerCanWrite(ctx.conversation, ctx.viewer),
    translate: ctx.hasText && ctx.readable && ctx.live ? (ctx.e2ee ? 'device' : 'served-switch') : null,
    transcribe: serverFeature(kind === 'audio'),
    sentiment: serverFeature(ctx.hasText),
    forward: ctx.live && !notice && !ctx.e2ee && !ctx.piecesNotServerCopyable && exit.forward.allowed,
    copy: ctx.hasText && !ctx.gone && exit.exportable,
    save: ctx.live && exit.exportable && SAVEABLE_KINDS.has(kind),
    serverFeatureAbsence: ctx.e2ee ? 'e2ee-server-feature-absent' : null,
  };
}

const KIND_ACTIONS: Readonly<Partial<Record<MessageContentKind, readonly { readonly id: MessageActionId; readonly exports: boolean }[]>>> = {
  link: [{ id: 'openLink', exports: false }, { id: 'copyLink', exports: true }],
  location: [{ id: 'openInMaps', exports: false }, { id: 'copyAddress', exports: true }],
  contact: [{ id: 'saveContact', exports: true }],
  poll: [{ id: 'viewResults', exports: false }],
};

function kindActions(ctx: Context): readonly MessageActionId[] {
  if (!ctx.readable) return [];
  return (KIND_ACTIONS[ctx.content.kind] ?? []).filter((action) => !action.exports || ctx.exit.exportable).map((action) => action.id);
}

const when = (condition: boolean, id: MessageActionId): readonly MessageActionId[] => (condition ? [id] : []);

function groupsOf(ctx: Context, verdicts: MessageActionVerdicts): MessageActionGroups {
  const { kind, flags } = ctx.content;
  const destructive = [...when(verdicts.deleteForEveryone, 'deleteForEveryone'), ...when(verdicts.deleteForMe, 'deleteForMe'), ...when(flags.failed, 'discard')];
  if (ctx.gone) return { primary: [], organize: [], more: [], moderation: [], destructive };
  const candidates: readonly MessageActionId[] = [
    ...when(flags.failed, 'retry'),
    ...when(verdicts.canReply, 'reply'),
    ...kindActions(ctx),
    ...when(verdicts.edit !== null, 'edit'),
    ...when(verdicts.copy && kind !== 'location', 'copy'),
    ...when(verdicts.forward, 'forward'),
    ...when(verdicts.translate !== null, 'translate'),
    ...when(verdicts.save, 'save'),
    ...when(verdicts.transcribe === true, 'transcribe'),
  ];
  return {
    primary: candidates.slice(0, MAX_PRIMARY_ACTIONS),
    organize: verdicts.pin === null ? [] : [verdicts.pin],
    more: [...candidates.slice(MAX_PRIMARY_ACTIONS), ...when(verdicts.sentiment === true, 'sentiment'), ...when(verdicts.report, 'report')],
    moderation: when(verdicts.remove !== null, 'remove'),
    destructive,
  };
}

export function messageActionsFor(input: MessageActionInput): MessageActions {
  const ctx = contextOf(input);
  const verdicts = verdictsOf(ctx);
  return { content: ctx.content, groups: groupsOf(ctx, verdicts), verdicts };
}
