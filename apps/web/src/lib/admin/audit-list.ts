import { AUDIT_FILTER_FAMILIES, auditActionsOfFamily, isAuditFilterFamily, type AuditActionCode, type AuditFilterFamily } from './audit-vocabulary';
import { defineListSpec, type ListState } from './list-state';
import { ADMIN_PERIODS, isAdminPeriod, periodStart } from './period';

/**
 * **LA LISTE DU JOURNAL D'AUDIT** (#8876, #6727) — ce que la passerelle sait trier
 * et filtrer, donc ce que l'adresse peut porter.
 *
 * - Tri : la date SEULE (`order=asc|desc`) — la passerelle ne trie rien d'autre ;
 *   d'abord la plus récente.
 * - Filtres : la famille d'actions (→ `action=a,b,c`), le genre d'élément
 *   (`entity`) et la période (→ `createdAfter`).
 * - `admin` (→ `adminId`) et `subject` (→ `userId`) : « tout ce que CET administrateur
 *   a fait », « tout ce qui concerne CE membre » — des filtres par IDENTIFIANT, qui
 *   n'entrent que s'ils ont la forme d'un ObjectId. La fiche membre y mène par
 *   `/admin/audit?subject=<id>`.
 * - Aucune recherche : la passerelle n'en sert pas, donc l'écran n'en dessine pas.
 */
export const AUDIT_ENTITIES = [
  'User',
  'Conversation',
  'ConversationShareLink',
  'Community',
  'Report',
  'Post',
  'Broadcast',
  'TrackingLink',
  'FriendRequest',
  'AgentLlmConfig',
  'Agent',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITIES)[number];

export const AUDIT_LIST_SPEC = defineListSpec({
  sortKeys: ['createdAt'],
  defaultSort: 'createdAt',
  ascendingFirst: [],
  filters: { family: AUDIT_FILTER_FAMILIES, entity: AUDIT_ENTITIES, period: ADMIN_PERIODS },
  idFilters: ['admin', 'subject'],
  pageSizes: [30, 50, 100],
});

export type AuditSortKey = (typeof AUDIT_LIST_SPEC.sortKeys)[number];
export type AuditFilterKey = keyof typeof AUDIT_LIST_SPEC.filters;
export type AuditIdFilterKey = 'admin' | 'subject';
export type AuditListState = ListState<AuditSortKey, AuditFilterKey, AuditIdFilterKey>;

/**
 * **CE QUE LA PASSERELLE ACCEPTE DANS `action`** — des codes `[A-Z_]{2,64}`, vingt
 * au plus, séparés par des virgules (le motif AJV de `routes/admin/audit-logs.ts`,
 * que `audit-list.test.ts` relit à chaque passage : si la passerelle l'élargit, le
 * témoin rougit et ce fichier se relit).
 *
 * Deux codes du vocabulaire portent un CHIFFRE (`ENABLE_2FA`, `DISABLE_2FA`) : les
 * envoyer ferait refuser toute la requête (400). Le filtre ne les envoie donc pas, et
 * sa famille le DIT (`gaps`) — un filtre qui omettrait des lignes en silence mentirait.
 */
export const GATEWAY_ACTION_PATTERN = /^[A-Z_]{2,64}$/;
export const MAX_ACTION_CODES = 20;

export type AuditFamilyFilter = {
  readonly send: readonly AuditActionCode[];
  readonly gaps: readonly AuditActionCode[];
};

export function auditFamilyFilter(family: AuditFilterFamily): AuditFamilyFilter {
  const codes = auditActionsOfFamily(family);
  const sendable = codes.filter((code) => GATEWAY_ACTION_PATTERN.test(code));
  return {
    send: sendable.slice(0, MAX_ACTION_CODES),
    gaps: [...codes.filter((code) => !GATEWAY_ACTION_PATTERN.test(code)), ...sendable.slice(MAX_ACTION_CODES)],
  };
}

/**
 * La requête envoyée à la passerelle : la page, l'ordre, puis chaque filtre posé sous
 * le nom qu'elle attend. `now` est injecté — la période ne lit jamais l'horloge.
 */
export function auditListQuery(state: AuditListState, now: Date): URLSearchParams {
  const query = new URLSearchParams({ offset: String(state.offset), limit: String(state.limit), order: state.order });

  const family = state.filters.family;
  if (family !== undefined && isAuditFilterFamily(family)) query.set('action', auditFamilyFilter(family).send.join(','));

  const entity = state.filters.entity;
  if (entity !== undefined) query.set('entity', entity);

  const period = state.filters.period;
  if (period !== undefined && isAdminPeriod(period)) query.set('createdAfter', periodStart(period, now));

  const admin = state.ids.admin;
  if (admin !== undefined) query.set('adminId', admin);

  const subject = state.ids.subject;
  if (subject !== undefined) query.set('userId', subject);

  return query;
}
