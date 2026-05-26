import type { AgentTopicCatalog } from '@meeshy/shared/prisma/client';

/**
 * Forme persistée + utilisée par le strategist. Champ scalaire =
 * `AgentTopicCatalog`. On ne réexpose pas le model Prisma directement pour
 * éviter les imports transitifs côté consumers.
 */
export type TopicCatalogEntry = Pick<
  AgentTopicCatalog,
  | 'id'
  | 'slug'
  | 'label'
  | 'description'
  | 'keywordPatterns'
  | 'instructionTemplate'
  | 'searchHintTemplate'
  | 'examples'
  | 'cooldownMinutes'
  | 'isActive'
>;

export type TopicInput = Omit<TopicCatalogEntry, 'id'>;
