/**
 * **L'ÉTAT DU CLASSEMENT, DANS L'ADRESSE** (#8876, #6730) — le genre d'entité, le
 * critère, la période et le nombre de lignes, lus avec une LISTE BLANCHE : une
 * valeur inconnue retombe sur le défaut, jamais sur la passerelle (qui, pour un
 * critère qu'elle ne connaît pas, répondrait une liste vide que l'écran ne saurait
 * pas nommer).
 *
 * Seuls les critères CANONIQUES sont proposés. La passerelle accepte aussi des
 * alias historiques (`messages`, `reactions`, `members`, `clicks`…) : ils ne sont
 * ni dessinés ni lus dans l'adresse.
 *
 * `period` dit ce que la période FAIT à chaque critère — c'est ce qui décide si le
 * sélecteur de période est dessiné : un critère qui ignore la période n'a pas à
 * offrir un contrôle sans effet (loi 4).
 */
export const RANKING_ENTITY_TYPES = ['users', 'conversations', 'messages', 'links'] as const;
export type RankingEntityType = (typeof RANKING_ENTITY_TYPES)[number];

export const RANKING_PERIODS = ['1d', '7d', '30d', '60d', '90d', '180d', '365d', 'all'] as const;
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

export const RANKING_LIMITS = [10, 25, 50, 100] as const;
export type RankingLimit = (typeof RANKING_LIMITS)[number];

/** `activity` : la période borne l'activité comptée · `creation` : elle borne les liens CRÉÉS · `none` : le critère porte sur tout l'historique. */
export type RankingPeriodScope = 'activity' | 'creation' | 'none';

type Definition = {
  readonly code: string;
  readonly label: `admin.ranking.criterion.${RankingEntityType}.${string}`;
  readonly period: RankingPeriodScope;
  /** Faux quand la passerelle ne sert aucune valeur exploitable (elle ordonne, elle ne compte pas). */
  readonly value?: false;
};

const criterion = <const C extends string, const E extends RankingEntityType>(
  entity: E,
  code: C,
  period: RankingPeriodScope,
  value?: false,
) => ({ code, label: `admin.ranking.criterion.${entity}.${code}` as const, period, ...(value === undefined ? {} : { value }) });

export const RANKING_CRITERIA = {
  users: [
    criterion('users', 'messages_sent', 'activity'),
    criterion('users', 'reactions_given', 'activity'),
    criterion('users', 'reactions_received', 'activity'),
    criterion('users', 'replies_received', 'activity'),
    criterion('users', 'mentions_received', 'activity'),
    criterion('users', 'mentions_sent', 'activity'),
    criterion('users', 'conversations_joined', 'activity'),
    criterion('users', 'communities_created', 'activity'),
    criterion('users', 'share_links_created', 'activity'),
    criterion('users', 'files_shared', 'activity'),
    criterion('users', 'reports_sent', 'activity'),
    criterion('users', 'reports_received', 'activity'),
    criterion('users', 'friend_requests_sent', 'activity'),
    criterion('users', 'friend_requests_received', 'activity'),
    criterion('users', 'calls_initiated', 'activity'),
    criterion('users', 'call_participations', 'activity'),
    criterion('users', 'most_referrals_via_affiliate', 'activity'),
    criterion('users', 'most_referrals_via_sharelinks', 'creation'),
    criterion('users', 'most_contacts', 'none'),
    criterion('users', 'most_tracking_links_created', 'activity'),
    criterion('users', 'most_tracking_link_clicks', 'creation'),
  ],
  conversations: [
    criterion('conversations', 'message_count', 'activity'),
    criterion('conversations', 'member_count', 'none'),
    criterion('conversations', 'reaction_count', 'activity'),
    criterion('conversations', 'files_shared', 'activity'),
    criterion('conversations', 'call_count', 'activity'),
    criterion('conversations', 'recent_activity', 'activity', false),
  ],
  messages: [
    criterion('messages', 'most_reactions', 'activity'),
    criterion('messages', 'most_replies', 'activity'),
    criterion('messages', 'most_mentions', 'activity'),
  ],
  links: [
    criterion('links', 'tracking_links_most_visited', 'creation'),
    criterion('links', 'tracking_links_most_unique', 'creation'),
    criterion('links', 'share_links_most_used', 'none'),
    criterion('links', 'share_links_most_unique_sessions', 'none'),
  ],
} as const satisfies Readonly<Record<RankingEntityType, readonly Definition[]>>;

type Criteria = typeof RANKING_CRITERIA;
export type RankingCriterionCode = Criteria[RankingEntityType][number]['code'];
export type RankingCriterionLabelKey = Criteria[RankingEntityType][number]['label'];
export type RankingCriterionDefinition = Criteria[RankingEntityType][number];

export type RankingState = {
  readonly entityType: RankingEntityType;
  readonly criterion: RankingCriterionCode;
  readonly period: RankingPeriod;
  readonly limit: RankingLimit;
};

/** Le premier critère de chaque genre est son défaut : la liste s'ouvre sur ce qui se compare le plus naturellement. */
const DEFAULT_DEFINITION: Readonly<Record<RankingEntityType, RankingCriterionDefinition>> = {
  users: RANKING_CRITERIA.users[0],
  conversations: RANKING_CRITERIA.conversations[0],
  messages: RANKING_CRITERIA.messages[0],
  links: RANKING_CRITERIA.links[0],
};

const DEFAULT_CRITERION: Readonly<Record<RankingEntityType, RankingCriterionCode>> = {
  users: DEFAULT_DEFINITION.users.code,
  conversations: DEFAULT_DEFINITION.conversations.code,
  messages: DEFAULT_DEFINITION.messages.code,
  links: DEFAULT_DEFINITION.links.code,
};

export const DEFAULT_RANKING_PERIOD: RankingPeriod = '30d';
export const DEFAULT_RANKING_LIMIT: RankingLimit = 25;

export const DEFAULT_RANKING_STATE: RankingState = {
  entityType: 'users',
  criterion: DEFAULT_CRITERION.users,
  period: DEFAULT_RANKING_PERIOD,
  limit: DEFAULT_RANKING_LIMIT,
};

export const criteriaOf = (entityType: RankingEntityType): readonly RankingCriterionDefinition[] => RANKING_CRITERIA[entityType];

export const criterionDefinition = (entityType: RankingEntityType, code: string): RankingCriterionDefinition =>
  criteriaOf(entityType).find((definition) => definition.code === code) ?? DEFAULT_DEFINITION[entityType];

const entityOf = (value: string | null): RankingEntityType => RANKING_ENTITY_TYPES.find((entity) => entity === value) ?? DEFAULT_RANKING_STATE.entityType;
const periodOf = (value: string | null): RankingPeriod => RANKING_PERIODS.find((period) => period === value) ?? DEFAULT_RANKING_PERIOD;
const limitOf = (value: string | null): RankingLimit => RANKING_LIMITS.find((limit) => String(limit) === value) ?? DEFAULT_RANKING_LIMIT;

export function parseRankingState(search: URLSearchParams): RankingState {
  const entityType = entityOf(search.get('entity'));
  return {
    entityType,
    criterion: criterionDefinition(entityType, search.get('criterion') ?? '').code,
    period: periodOf(search.get('period')),
    limit: limitOf(search.get('limit')),
  };
}

/** L'adresse ne porte que ce qui s'écarte du défaut : un lien propre, et « Réinitialiser » le rend à `/ranking`. */
export function serializeRankingState(state: RankingState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.entityType !== DEFAULT_RANKING_STATE.entityType) params.set('entity', state.entityType);
  if (state.criterion !== DEFAULT_CRITERION[state.entityType]) params.set('criterion', state.criterion);
  if (state.period !== DEFAULT_RANKING_PERIOD) params.set('period', state.period);
  if (state.limit !== DEFAULT_RANKING_LIMIT) params.set('limit', String(state.limit));
  return params;
}

export const isDefaultRankingState = (state: RankingState): boolean => serializeRankingState(state).toString() === '';

/** Changer de genre remet le critère à son défaut : un critère de membre ne classe pas des conversations. */
export const withEntityType = (state: RankingState, entityType: RankingEntityType): RankingState =>
  entityType === state.entityType ? state : { ...state, entityType, criterion: DEFAULT_CRITERION[entityType] };

export const withCriterion = (state: RankingState, code: string): RankingState => ({
  ...state,
  criterion: criterionDefinition(state.entityType, code).code,
});

export const withPeriod = (state: RankingState, period: string): RankingState => ({ ...state, period: periodOf(period) });

export const withLimit = (state: RankingState, limit: string): RankingState => ({ ...state, limit: limitOf(limit) });

/** La chaîne de requête de la passerelle — les noms exacts de `RankingsQuerySchema`. */
export function rankingRequestQuery(state: RankingState): URLSearchParams {
  return new URLSearchParams({
    entityType: state.entityType,
    criterion: state.criterion,
    period: state.period,
    limit: String(state.limit),
  });
}

export type RankingBranch = 'users' | 'conversations' | 'messages' | 'trackingLinks' | 'shareLinks';

/** Le genre de LIGNE que la passerelle sert : `links` porte deux genres, le critère décide. */
export function rankingBranchOf(entityType: RankingEntityType, code: string): RankingBranch {
  if (entityType !== 'links') return entityType;
  return code.startsWith('tracking_links') ? 'trackingLinks' : 'shareLinks';
}

export const periodScopeOf = (entityType: RankingEntityType, code: string): RankingPeriodScope =>
  criterionDefinition(entityType, code).period;

export const criterionShowsValue = (entityType: RankingEntityType, code: string): boolean =>
  !('value' in criterionDefinition(entityType, code));
