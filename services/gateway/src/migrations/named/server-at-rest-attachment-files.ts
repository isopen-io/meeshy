import Redis from 'ioredis';
import { backfillAtRestAttachments } from '../../services/attachments/atRest/atRestBackfill';
import { atRestFileSealingEnabled } from '../../services/attachments/atRest/atRestFiles';
import { readerFileUrlSignerFromEnv } from '../../services/attachments/readerFileSignature';
import { redisSealLock } from '../../services/attachments/atRest/sealLock';
import { eraseMirroredCopy } from '../../services/storage/objects/mirroredErasure';
import { designatedKeyring, ensureAtRestIndexes, mongoAtRestStore, mongoPrisma } from './atRestMongo';
import type { NamedMigration } from './types';

/**
 * #13100 — scelle au repos les pièces jointes des conversations `server` /
 * `hybrid` déposées en clair avant le scellement. La logique et ses témoins
 * vivent dans `services/attachments/atRest/atRestBackfill.ts` ; le scellement
 * est celui de l'envoi (`sealAttachmentFiles`), sous la clé que chaque
 * conversation DÉSIGNE (`serverEncryptionKeyId`) — la migration n'en crée
 * aucune : une conversation sans clé lisible est comptée en échec.
 *
 * Elle lit et écrit par la base `db` que l'exécuteur lui remet, donc À BLANC
 * sous `readOnlyDb` : à blanc, elle compte (pièces, fichiers à sceller, déjà
 * scellées) sans écrire ni la base ni le disque. Avec `--apply`, elle pose
 * d'abord les index de `AttachmentFileAtRest` (unique sur `storageKey`), puis
 * scelle, chaque pièce sous le verrou Redis que la passerelle vivante prend
 * aussi (`REDIS_URL`) : la migration et l'envoi ne se croisent jamais.
 * Idempotente : rejouée, elle ne rescelle rien.
 *
 * Elle s'exécute DANS le conteneur passerelle, qui porte `ENCRYPTION_MASTER_KEY`,
 * `REDIS_URL` et le volume des dépôts (`UPLOAD_PATH`). En production : feu vert
 * du porteur et sauvegarde vérifiée (volume des dépôts ET collection
 * `MessageAttachment`) AVANT --apply. Retour arrière :
 * `2026-10-26-server-at-rest-attachment-files-unseal`.
 */
export const serverAtRestAttachmentFiles: NamedMigration = {
  name: '2026-10-26-server-at-rest-attachment-files',
  issue: '#13100',
  summary: 'scelle au repos les fichiers des pièces jointes server/hybrid encore en clair (original, vignette, variantes, rendus, pistes TTS)',
  async run({ db, dryRun, env, log }) {
    // Scellé sans clé de signature des adresses, un fichier ne se lirait plus ;
    // scellement suspendu, c'est un retour arrière en cours.
    if (readerFileUrlSignerFromEnv(new Date(), env) === null) throw new Error('ATTACHMENT_URL_SIGNING_KEY absente : aucun fichier scellé ne serait lisible');
    if (!atRestFileSealingEnabled(env)) throw new Error('AT_REST_FILE_SEALING=off : le scellement est suspendu');
    const uploadRoot = env.UPLOAD_PATH || '/app/uploads';
    await ensureAtRestIndexes(db, dryRun, log);
    const redis = !dryRun && env.REDIS_URL ? new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
    if (!dryRun && !redis) log('  ATTENTION : REDIS_URL absente, scellement sans verrou partagé — arrêter la passerelle d’abord');
    try {
      await backfillAtRestAttachments(
        {
          prisma: mongoPrisma(db),
          uploadRoot,
          access: { store: mongoAtRestStore(db), keyring: designatedKeyring(db, env) },
          eraseMirrored: (absolute) => eraseMirroredCopy(absolute, uploadRoot),
          ...(redis ? { lock: redisSealLock(redis as never) } : {}),
        },
        { dryRun, log }
      );
    } finally {
      redis?.disconnect();
    }
  },
};
