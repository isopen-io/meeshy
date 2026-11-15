import { ensureAtRestIndexes } from './atRestMongo';
import type { NamedMigration } from './types';

/**
 * #13100 — les index de `AttachmentFileAtRest` (unique sur `storageKey`,
 * `attachmentId`, `createdAt`), à poser AVANT le déploiement de la passerelle
 * qui scelle : chaque lecture de média daté demande « ce fichier est-il
 * scellé ? » par sa clé, et l'unicité empêche deux scellements d'une même clé.
 * Jamais par `prisma db push` (#9035). Additive et idempotente.
 */
export const attachmentFileAtRestIndexes: NamedMigration = {
  name: '2026-10-26-attachment-file-at-rest-indexes',
  issue: '#13100',
  summary: 'index de AttachmentFileAtRest (storageKey unique, attachmentId, createdAt), avant le déploiement du scellement',
  async run({ db, dryRun, log }) {
    await ensureAtRestIndexes(db, dryRun, log);
    if (!dryRun) await db.collection('AttachmentFileAtRest').createIndex({ storageKey: 1 }, { name: 'AttachmentFileAtRest_storageKey_key', unique: true });
    log('  index de AttachmentFileAtRest vérifiés');
  },
};
