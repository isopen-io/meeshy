import { enhancedLogger } from '../../utils/logger-enhanced';
import { truncateByCodePoints } from '../../utils/truncate-text';
import type {
  ReproducedNotification,
  ReproducedNotificationAnnouncer,
} from '../notifications/reproducedNotifications';

const log = enhancedLogger.child({ module: 'reproduceEditedSubjectNotifications' });

/**
 * ANNULER puis REPRODUIRE les notifications d'un POST ou d'un COMMENTAIRE qu'on
 * vient d'éditer — le jumeau social de `reproduceEditedMessageNotifications`,
 * et le pendant des retraits `retractPostNotifications` /
 * `retractCommentNotifications`.
 *
 * Même cause que toute la famille : la ligne `Notification` garde une copie
 * DÉNORMALISÉE du texte, qu'aucune lecture ne rafraîchit — elle ne relit jamais
 * le post ni le commentaire. Le retrait la rendait mensongère et l'emportait ;
 * l'ÉDITION la rend tout aussi mensongère, et rien ne passait la corriger.
 *
 * Même arbitrage que le jumeau message : réécriture EN PLACE (donc `isRead`
 * survit — une correction de faute de frappe ne doit pas ressusciter une
 * notification consommée), annonce en COUPLE `notification:deleted` +
 * `notification:new` (les deux seuls verbes que les clients savent recevoir).
 *
 * UNE différence de forme, et elle décide toute l'implémentation. Le jumeau
 * message réécrit le corps par substitution de PRÉFIXE, parce que le
 * constructeur de corps met l'extrait en tête et n'ajoute qu'après. Ici, non :
 * l'extrait est SERTI au milieu d'une phrase composée et localisée
 * (`buildOwnerSubtitleWithDetail` → « Votre story : « … » · 📷 Photo »), dont
 * ni la tête ni la queue ne sont déductibles.
 *
 * La substitution porte donc sur l'ANCIEN EXTRAIT LUI-MÊME, lu dans
 * `metadata.postPreview` / `metadata.commentPreview`. C'est exactement la
 * chaîne que le compositeur a sertie — pas une approximation reconstruite —
 * donc la remplacer là où elle apparaît rend la phrase d'après sans avoir à
 * re-résoudre la langue du destinataire ni à rejouer la composition. Une ligne
 * qui ne porte pas l'extrait en métadonnée n'est pas réécrite : on ne devine
 * pas ce qu'il faudrait remplacer.
 *
 * Le filtre de lecture est celui, éprouvé, des retraits jumeaux — mêmes chemins
 * JSON, même `$runCommandRaw` (Prisma ne filtre pas les chemins JSON sur
 * MongoDB), y compris les DEUX chemins de `commentId` : `context.commentId`
 * pour `comment_reaction`, `metadata.commentId` pour `post_comment` et
 * `comment_like`.
 */

/** Le contenu social édité. */
export type EditedSubject =
  | { readonly kind: 'post'; readonly id: string }
  | { readonly kind: 'comment'; readonly id: string };

/**
 * La clé sous laquelle chaque famille range sa copie du texte. C'est elle qui
 * porte l'ancien extrait, donc elle qui rend la substitution possible.
 */
const PREVIEW_KEY: Readonly<Record<EditedSubject['kind'], string>> = {
  post: 'postPreview',
  comment: 'commentPreview',
};

/** Les chemins JSON sous lesquels chaque famille nomme sa cible. */
const SUBJECT_PATHS: Readonly<Record<EditedSubject['kind'], readonly string[]>> = {
  post: ['context.postId'],
  comment: ['context.commentId', 'metadata.commentId'],
};

/**
 * Longueur d'extrait — celle de `truncateMessage`, le troncateur commun des
 * producteurs sociaux. Réécrire un extrait plus long que ne l'était l'original
 * gonflerait la ligne à chaque édition.
 */
const PREVIEW_MAX_LENGTH = 100;

/** Taille d'un lot : même raison et même valeur que les retraits jumeaux. */
export const SUBJECT_NOTIFICATION_REPRODUCTION_BATCH_SIZE = 200;

/** Plafond de drainage — anti-boucle, pas une borne d'audience réaliste. */
const MAX_REPRODUCTION_BATCHES = 200;

type RawObjectId = string | { $oid?: string };

interface RawNotificationRow {
  _id?: RawObjectId;
  userId?: RawObjectId;
  content?: unknown;
  subtitle?: unknown;
  metadata?: unknown;
}

type RawNotificationBatch = {
  cursor?: { firstBatch?: ReadonlyArray<RawNotificationRow> };
};

/**
 * La seule surface Prisma que la reproduction touche, énumérée pour qu'un
 * appelant sache exactement ce qu'il autorise.
 */
export interface EditedSubjectNotificationPrisma {
  $runCommandRaw(command: Record<string, unknown>): Promise<unknown>;
  notification: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
}

function objectId(raw: RawObjectId | undefined): string | undefined {
  if (typeof raw === 'string') return raw;
  return raw?.$oid;
}

function asBlob(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

/**
 * Remplace TOUTES les occurrences de l'ancien extrait — `split`/`join` plutôt
 * qu'une expression régulière, parce que l'extrait est du texte UTILISATEUR :
 * il contient couramment des caractères qui seraient interprétés comme des
 * métacaractères, et l'échapper serait une seconde règle à tenir juste.
 */
function substitute(text: string, previous: string, next: string): string {
  return text.split(previous).join(next);
}

export async function reproduceEditedSubjectNotifications(
  prisma: EditedSubjectNotificationPrisma,
  edited: { readonly subject: EditedSubject; readonly content: string | null },
  announcer: ReproducedNotificationAnnouncer | undefined
): Promise<number> {
  if (!edited.subject.id) return 0;

  const previewKey = PREVIEW_KEY[edited.subject.kind];
  const nextPreview = truncateByCodePoints((edited.content ?? '').trim(), PREVIEW_MAX_LENGTH, '…');
  const reproduced: ReproducedNotification[] = [];
  // Le drainage relit APRÈS écriture, or la réécriture ne retire pas les lignes
  // du prédicat : il faut donc paginer par `_id` croissant, sinon le premier
  // lot reviendrait indéfiniment. C'est la différence avec les retraits
  // jumeaux, dont la suppression fait progresser la lecture d'elle-même.
  let after: string | undefined;

  for (let batch = 0; batch < MAX_REPRODUCTION_BATCHES; batch += 1) {
    const targetClauses = SUBJECT_PATHS[edited.subject.kind].map((path) => ({
      [path]: edited.subject.id,
    }));

    const raw = (await prisma.$runCommandRaw({
      find: 'Notification',
      filter: {
        $or: targetClauses,
        ...(after ? { _id: { $gt: { $oid: after } } } : {}),
      },
      projection: { _id: 1, userId: 1, content: 1, subtitle: 1, metadata: 1 },
      sort: { _id: 1 },
      singleBatch: true,
      batchSize: SUBJECT_NOTIFICATION_REPRODUCTION_BATCH_SIZE,
    })) as RawNotificationBatch;

    const rows = raw?.cursor?.firstBatch ?? [];
    if (rows.length === 0) return reproduced.length;

    for (const row of rows) {
      const id = objectId(row._id);
      const userId = objectId(row.userId);
      if (id) after = id;
      if (!id || !userId) continue;

      const metadata = asBlob(row.metadata);
      const previousPreview = typeof metadata[previewKey] === 'string'
        ? (metadata[previewKey] as string)
        : '';

      // Sans ancien extrait, rien ne dit QUELLE portion des phrases composées
      // décrivait le texte édité. On ne devine pas : la ligne est laissée
      // intacte plutôt que réécrite au jugé.
      if (previousPreview === '' || previousPreview === nextPreview) continue;

      metadata[previewKey] = nextPreview;
      const data: Record<string, unknown> = { metadata };

      if (typeof row.content === 'string' && row.content.includes(previousPreview)) {
        data['content'] = substitute(row.content, previousPreview, nextPreview);
      }
      if (typeof row.subtitle === 'string' && row.subtitle.includes(previousPreview)) {
        data['subtitle'] = substitute(row.subtitle, previousPreview, nextPreview);
      }

      try {
        await prisma.notification.update({ where: { id }, data });
        reproduced.push({ id, userId });
      } catch (err) {
        // Une ligne récalcitrante ne prive pas les AUTRES destinataires de leur
        // rafraîchissement, et n'est pas annoncée : annoncer une réécriture qui
        // n'a pas eu lieu ferait ré-afficher un texte que la base ne porte pas.
        log.warn('subject edit: notification reproduction failed for one row', {
          subject: edited.subject.kind,
          subjectId: edited.subject.id,
          notificationId: id,
          err,
        });
      }
    }

    if (rows.length < SUBJECT_NOTIFICATION_REPRODUCTION_BATCH_SIZE) break;
  }

  // L'annonce APRÈS l'écriture durable, et jamais l'inverse : ce que les
  // clients ré-affichent doit être ce que la base porte.
  if (reproduced.length > 0) {
    await announcer?.announceNotificationsReproduced(reproduced);
  }

  return reproduced.length;
}
