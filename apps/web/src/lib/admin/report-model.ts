import type { AdminEntityRef } from '@/components/admin/entity-chip';
import type { AdminReport, AdminReportPerson, AdminReportedEntity } from '@/lib/api/admin-reports';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import type { AdminEntityKind, AdminTarget } from './admin-routes';
import { interpretReportedEntity } from './interpret/enums';
import { conversationLabel, excerptOf, personLabel, personSecondary, postLabel } from './interpret/labels';

/**
 * **LE MODÈLE D'AFFICHAGE D'UN SIGNALEMENT** (#8876, #6726) — ce que les écrans
 * disent d'une ligne servie, sans jamais peindre un identifiant : l'élément
 * signalé NOMMÉ, le signalant, le modérateur, les gestes offerts dans chaque
 * état, la chronologie et les liens qui agissent.
 *
 * Module PUR — langue explicite, horloge injectée : chaque règle se mesure sans
 * DOM.
 */

/** Les cinq actions que la passerelle accepte (`updateReportSchema.actionTaken`), de la moins à la plus grave. */
export const REPORT_ACTIONS = ['none', 'warning_sent', 'content_removed', 'user_suspended', 'user_banned'] as const;

export const REPORT_CLOSED_STATUSES = ['resolved', 'rejected', 'dismissed'] as const;

export type ReportClosedStatus = (typeof REPORT_CLOSED_STATUSES)[number];

const isClosedStatus = (status: string): status is ReportClosedStatus => REPORT_CLOSED_STATUSES.some((closed) => closed === status);
const isOpenStatus = (status: string): boolean => status === 'pending' || status === 'under_review';

const EXCERPT_IN_LIST = 60;

export type ReportedTarget = {
  readonly ref: AdminEntityRef;
  /** Vrai quand l'élément a une fiche d'administration à ouvrir (et n'a pas été supprimé). */
  readonly linkable: boolean;
};

const CONTENT_KINDS: ReadonlySet<string> = new Set(['message', 'post', 'story', 'comment']);

const kindLabel = (type: string, language: AdminLanguage): string => interpretReportedEntity(type, language).label;

/** Un compte, pas un invité : seul un compte a un `@pseudo`, et seul son identifiant ouvre une fiche membre. */
const isAccount = (person: AdminReportPerson | null): person is AdminReportPerson => person !== null && person.username !== '';

const personRef = (person: AdminReportPerson, language: AdminLanguage): AdminEntityRef => ({
  kind: 'user',
  id: person.id,
  label: personLabel(person, language),
  secondary: personSecondary(person.username),
  avatarUrl: person.avatar,
});

function entityLabel(type: string, entity: AdminReportedEntity, language: AdminLanguage): string {
  const author = personLabel(entity.owner, language);
  switch (type) {
    case 'message':
      return translateAdmin(language, 'admin.moderation.entity.messageBy', { author });
    case 'comment':
      return translateAdmin(language, 'admin.moderation.entity.commentBy', { author });
    case 'post':
    case 'story':
      return postLabel({ type, author: entity.owner }, language);
    case 'conversation':
      return conversationLabel({ title: entity.label }, language);
    default:
      return entity.label ?? kindLabel(type, language);
  }
}

function entitySecondary(type: string, entity: AdminReportedEntity, language: AdminLanguage): string | null {
  if (CONTENT_KINDS.has(type)) {
    const excerpt = excerptOf(entity.excerpt, EXCERPT_IN_LIST);
    if (excerpt !== null) return excerpt;
    if (entity.isProtected) return translateAdmin(language, 'admin.moderation.entity.protected');
    const conversation = entity.conversation?.title ?? null;
    return type === 'message' && conversation !== null
      ? translateAdmin(language, 'admin.moderation.entity.inConversation', { conversation })
      : null;
  }
  if (type === 'community' && entity.owner !== null) return `${kindLabel(type, language)} · ${personLabel(entity.owner, language)}`;
  return kindLabel(type, language);
}

/** Le genre d'entité d'administration dont un élément signalé ouvre la fiche — `null` quand il n'en a pas (commentaire, son). */
function ficheKindOf(type: string, entity: AdminReportedEntity | null): AdminEntityKind | null {
  switch (type) {
    case 'user':
      return 'user';
    case 'conversation':
      return 'conversation';
    case 'community':
      return 'community';
    case 'post':
    case 'story':
      return 'post';
    case 'message':
      return entity?.conversation == null ? null : 'conversation';
    default:
      return null;
  }
}

/** Sans fiche, le genre ne sert qu'au glyphe de la puce : un message vit dans une conversation, un commentaire dans une publication. */
const GLYPH_KIND: Readonly<Record<string, AdminEntityKind>> = { message: 'conversation', comment: 'post', sound: 'post' };

export function reportedTargetOf(report: AdminReport, language: AdminLanguage): ReportedTarget {
  const type = report.reportedType;
  const entity = report.reportedEntity;
  const ficheKind = ficheKindOf(type, entity);
  const kind = ficheKind ?? GLYPH_KIND[type] ?? 'post';
  /* Un message n'a pas de fiche : la puce ouvre celle de SA conversation. */
  const id = type === 'message' && entity?.conversation != null ? entity.conversation.id : report.reportedEntityId;

  if (entity === null) return { ref: { kind, id, label: kindLabel(type, language) }, linkable: ficheKind !== null };

  const gone = entity.deleted && entity.owner === null && entity.label === null;
  const secondary = gone ? null : entitySecondary(type, entity, language);
  const ref: AdminEntityRef = {
    kind,
    id,
    label: gone ? kindLabel(type, language) : entityLabel(type, entity, language),
    ...(secondary === null ? {} : { secondary }),
    ...(entity.deleted ? { deleted: true } : {}),
  };
  return { ref, linkable: ficheKind !== null && !entity.deleted };
}

export type ReportPersonView =
  | { readonly kind: 'person'; readonly ref: AdminEntityRef }
  | { readonly kind: 'named'; readonly name: string }
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'none' }
  | { readonly kind: 'gone' };

/**
 * Le signalant : une personne nommée (compte), un nom donné par un expéditeur
 * anonyme, ou « Anonyme ». Un compte qui n'existe plus se DIT supprimé — le
 * confondre avec un anonyme ferait croire que le signalement a été déposé sans
 * compte.
 */
export function reportReporterOf(
  report: Pick<AdminReport, 'reporter' | 'reporterId' | 'reporterName'>,
  language: AdminLanguage,
): ReportPersonView {
  if (report.reporter !== null) return { kind: 'person', ref: personRef(report.reporter, language) };
  if (report.reporterName !== null) return { kind: 'named', name: report.reporterName };
  return report.reporterId === null ? { kind: 'anonymous' } : { kind: 'gone' };
}

export function reportModeratorOf(report: Pick<AdminReport, 'moderator' | 'moderatorId'>, language: AdminLanguage): ReportPersonView {
  if (report.moderator !== null) return { kind: 'person', ref: personRef(report.moderator, language) };
  return report.moderatorId === null ? { kind: 'none' } : { kind: 'gone' };
}

/** Le mot qui désigne une personne d'un signalement quand on n'a pas la place d'une puce (phrase, annonce). */
export function reportPersonName(view: ReportPersonView, language: AdminLanguage): string {
  switch (view.kind) {
    case 'person':
      return view.ref.label;
    case 'named':
      return view.name;
    case 'anonymous':
      return translateAdmin(language, 'admin.moderation.reporter.anonymous');
    case 'gone':
      return translateAdmin(language, 'admin.moderation.person.gone');
    case 'none':
      return translateAdmin(language, 'admin.moderation.moderator.none');
  }
}

/**
 * Le propriétaire de l'élément signalé : un compte (puce vers sa fiche) ou un
 * invité (son nom, sans lien — son identifiant n'est pas celui d'un compte) ;
 * `null` quand le serveur n'en sert pas.
 */
export function reportedOwnerOf(report: AdminReport, language: AdminLanguage): ReportPersonView | null {
  const owner = report.reportedEntity?.owner ?? null;
  if (owner === null) return null;
  return isAccount(owner) ? { kind: 'person', ref: personRef(owner, language) } : { kind: 'named', name: personLabel(owner, language) };
}

/** La conversation d'un message signalé, nommée — la fiche où se fait la lecture souveraine. */
export function reportedConversationOf(report: AdminReport, language: AdminLanguage): AdminEntityRef | null {
  const conversation = report.reportedEntity?.conversation ?? null;
  if (report.reportedType !== 'message' || conversation === null) return null;
  return { kind: 'conversation', id: conversation.id, label: conversationLabel({ title: conversation.title }, language) };
}

export type ReportGesture = 'assign' | 'resolve' | 'reject' | 'dismiss' | 'reopen' | 'delete';

/**
 * Les gestes offerts dans l'état du dossier — un geste sans effet n'est pas
 * dessiné. « Prendre en charge » disparaît quand le lecteur est déjà le
 * modérateur ; un dossier clos se rouvre (il ne se résout pas une seconde fois) ;
 * un statut que l'on ne connaît pas n'offre que la suppression (fail-closed).
 */
export function reportGestures(report: Pick<AdminReport, 'status' | 'moderatorId'>, viewerId: string | null): readonly ReportGesture[] {
  const open = isOpenStatus(report.status);
  const mine = viewerId !== null && report.moderatorId === viewerId;
  const gestures: readonly (ReportGesture | null)[] = [
    open && !mine ? 'assign' : null,
    open ? 'resolve' : null,
    open ? 'reject' : null,
    open ? 'dismiss' : null,
    isClosedStatus(report.status) ? 'reopen' : null,
    'delete',
  ];
  return gestures.flatMap((gesture) => (gesture === null ? [] : [gesture]));
}

export type ReportTimelineStep =
  | { readonly id: 'received'; readonly at: string }
  | { readonly id: 'taken'; readonly at: string | null }
  | { readonly id: 'closed'; readonly at: string | null; readonly status: ReportClosedStatus };

/**
 * La chronologie : reçu → pris en charge → clôturé. **Aucune date inventée** :
 * la prise en charge n'est datée que tant que le dossier est « en cours
 * d'examen » (la dernière mise à jour EST alors la prise en charge) — ensuite
 * la dernière mise à jour est la clôture, et la date de prise en charge n'est
 * pas conservée. Un dossier rouvert ne montre ni l'une ni l'autre.
 */
export function reportTimeline(report: AdminReport): readonly ReportTimelineStep[] {
  const received: ReportTimelineStep = { id: 'received', at: report.createdAt };
  const status = report.status;

  if (status === 'under_review') {
    return report.moderatorId === null ? [received] : [received, { id: 'taken', at: report.updatedAt }];
  }
  if (!isClosedStatus(status)) return [received];

  const taken: readonly ReportTimelineStep[] = report.moderatorId === null ? [] : [{ id: 'taken', at: null }];
  const closedAt = status === 'dismissed' ? report.updatedAt : (report.resolvedAt ?? report.updatedAt);
  return [received, ...taken, { id: 'closed', at: closedAt, status }];
}

export type ReportTurnaround = { readonly kind: 'closed' | 'open'; readonly milliseconds: number };

/**
 * De la réception à la résolution (dossier résolu ou rejeté), ou à maintenant
 * (dossier ouvert) ; `null` pour un dossier classé sans suite, qui n'a pas de
 * date de résolution.
 */
export function reportTurnaround(report: AdminReport, now: Date): ReportTurnaround | null {
  const received = Date.parse(report.createdAt);
  const between = (kind: ReportTurnaround['kind'], end: number): ReportTurnaround | null =>
    Number.isFinite(received) && Number.isFinite(end) && end >= received ? { kind, milliseconds: end - received } : null;

  if (isOpenStatus(report.status)) return between('open', now.getTime());
  if ((report.status === 'resolved' || report.status === 'rejected') && report.resolvedAt !== null) {
    return between('closed', Date.parse(report.resolvedAt));
  }
  return null;
}

export type ReportActionLinkId = 'memberSecurity' | 'post' | 'conversationReading' | 'conversation' | 'community';

export type ReportActionLink =
  | { readonly id: ReportActionLinkId; readonly target: AdminTarget }
  | { readonly id: 'authorSecurity'; readonly name: string; readonly target: AdminTarget };

const entityTarget = (entity: AdminEntityKind, id: string, search?: Readonly<Record<string, string>>): AdminTarget => ({
  kind: 'entity',
  entity,
  id,
  ...(search === undefined ? {} : { search }),
});

const SECURITY_TAB = { tab: 'security' } as const;

/**
 * **LES GESTES QUI AGISSENT SONT DES LIENS** (#6726) — bannir un membre, retirer
 * une publication, lire une conversation se font depuis LEUR fiche, qui porte la
 * confirmation, le motif et la trace d'audit. Le signalement ne duplique aucun
 * client d'une autre section : il mène à la bonne fiche.
 *
 * Un invité n'a pas de fiche membre (son identifiant n'est pas celui d'un
 * compte) : aucun lien d'auteur pour lui. Un élément supprimé n'a plus de fiche.
 */
export function reportActionLinks(report: AdminReport, language: AdminLanguage): readonly ReportActionLink[] {
  const entity = report.reportedEntity;
  const alive = entity === null || !entity.deleted;
  const owner = entity?.owner ?? null;
  const author: readonly ReportActionLink[] = isAccount(owner)
    ? [{ id: 'authorSecurity', name: personLabel(owner, language), target: entityTarget('user', owner.id, SECURITY_TAB) }]
    : [];
  const conversation = entity?.conversation ?? null;
  const toFiche = (id: ReportActionLinkId, kind: AdminEntityKind, entityId: string, search?: Readonly<Record<string, string>>): ReportActionLink => ({
    id,
    target: entityTarget(kind, entityId, search),
  });
  const onlyIfAlive = (link: ReportActionLink): readonly ReportActionLink[] => (alive ? [link] : []);

  switch (report.reportedType) {
    case 'user':
      return [toFiche('memberSecurity', 'user', report.reportedEntityId, SECURITY_TAB)];
    case 'message':
      return [...author, ...(conversation === null ? [] : [toFiche('conversationReading', 'conversation', conversation.id)])];
    case 'post':
    case 'story':
      return [...onlyIfAlive(toFiche('post', 'post', report.reportedEntityId)), ...author];
    case 'comment':
      return author;
    case 'conversation':
      return onlyIfAlive(toFiche('conversation', 'conversation', report.reportedEntityId));
    case 'community':
      return onlyIfAlive(toFiche('community', 'community', report.reportedEntityId));
    default:
      return [];
  }
}
