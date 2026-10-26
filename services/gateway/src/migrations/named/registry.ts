import { anonymousPostOpenReaderKey } from './anonymous-post-open-reader-key';
import { communityIsActiveBackfill } from './community-is-active-backfill';
import { socialEventsV2Retention } from './social-events-v2-retention';
import { serverAtRestAttachmentFiles } from './server-at-rest-attachment-files';
import type { NamedMigration } from './types';

export type { NamedMigration, NamedMigrationContext } from './types';

/**
 * Les migrations nommées de la passerelle, compilées dans son image
 * (`dist/src/migrations/named/`). Une migration neuve s'ajoute ICI : c'est ce
 * qui la rend exécutable en production sans portage mongosh (#10865).
 */
export const NAMED_MIGRATIONS: readonly NamedMigration[] = [
  anonymousPostOpenReaderKey,
  socialEventsV2Retention,
  communityIsActiveBackfill,
  serverAtRestAttachmentFiles,
];
