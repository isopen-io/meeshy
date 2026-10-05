/**
 * La route PAR CHEMIN rend-elle encore ces octets, et sous quel cache ? (#9315)
 *
 * `GET /attachments/file/*` est l'adresse que les clients composent pour
 * afficher un média. Elle n'a ni identifiant ni identité : une `<img>`, un
 * `AVPlayer`, l'extension de notification iOS n'envoient aucun jeton. Le
 * verdict ne peut donc porter que sur l'ÉTAT du contenu — jamais sur QUI le
 * demande — et il applique la même loi que les routes par identifiant
 * ({@link carrierMessageStillServesBytes}) : un fichier dont tous les messages
 * porteurs sont rappelés, expirés ou brûlés ne se sert plus.
 *
 * Réserver les fichiers aux membres de leur conversation est le lot suivant
 * (URL signée), qui attend la télémétrie de version des clients (#9231).
 *
 * ─── QUELLE LIGNE PORTE CE FICHIER ? ─────────────────────────────────────────
 *
 * Quatre formes de clé atteignent une pièce jointe, et chacune remonte à ses
 * lignes par un index :
 *  - l'original et la miniature : `filePath` / `thumbnailPath`, égalité ;
 *  - la variante WebP `<base>_<largeur>w.webp` : `filePath` égal à `<base>`
 *    (original sans extension) ou qui commence par `<base>.` (préfixe ancré,
 *    servi par le même index) ;
 *  - la piste traduite `translated/<attachmentId>_<langue>.<ext>` : la ligne
 *    nommée, puis toutes celles qui partagent ses octets.
 *
 * Une clé qu'aucune ligne ne porte n'est PAS une pièce jointe de message —
 * média de post, son, sticker, export filigrané — et garde son régime
 * d'avant : ce module ne décide que pour ce qui lui appartient.
 *
 * ─── PLUSIEURS LIGNES, UN FICHIER ───────────────────────────────────────────
 *
 * Le transfert recopie `filePath` sans dupliquer les octets. Le fichier reste
 * donc servi tant qu'UN porteur vit : rappeler l'original ne doit pas vider la
 * bulle de la conversation où il a été transféré. Une ligne pas encore
 * rattachée (envoi en cours) vit par définition, sans lever pour autant le
 * régime de cache d'une vue unique qui partagerait le fichier.
 *
 * Une clé dont les lignes ont DÉJÀ été effacées (le chemin nominal de
 * `deleteAttachment` efface la ligne avant les fichiers) n'est plus
 * reconnaissable : si ses octets ont survécu — dérivés antérieurs à
 * ef9db52467, `unlink` en échec — elle est servie comme un fichier qui n'est
 * pas une pièce jointe. Ce reste se ferme par la purge des orphelins, pas ici.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { carrierMessageStillServesBytes } from './carrierMessageLifecycle';

export type FileRouteVerdict =
  | { readonly kind: 'not-an-attachment' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'serve'; readonly cacheControl: string };

export type FileRouteVerdictPrisma = {
  readonly messageAttachment: Pick<PrismaClient['messageAttachment'], 'findMany' | 'findUnique'>;
  readonly message: Pick<PrismaClient['message'], 'findMany'>;
};

/** Un média ordinaire : l'URL change à chaque envoi, le cache long est sûr. */
export const ORDINARY_ATTACHMENT_CACHE = 'private, max-age=31536000';
/** Un éphémère : gardé, mais revalidé à chaque usage — l'échéance passée, la revalidation rend 404. */
export const EPHEMERAL_ATTACHMENT_CACHE = 'private, no-cache';
/** Une vue unique : aucun cache ne doit pouvoir la rejouer. */
export const VIEW_ONCE_ATTACHMENT_CACHE = 'private, no-store';

const TRANSLATED_TRACK = /^translated\/([0-9a-f]{24})_[^/]+$/;
const RESPONSIVE_VARIANT = /^(.+)_\d+w\.webp$/;

type OwnerRow = { readonly messageId: string | null; readonly isViewOnce: boolean };

const OWNER_SELECT = { messageId: true, isViewOnce: true } as const;

export async function resolveFileRouteVerdict(
  storageKey: string,
  prisma: FileRouteVerdictPrisma,
  now: Date
): Promise<FileRouteVerdict> {
  const owners = await ownerRowsOf(storageKey, prisma);
  return owners.length === 0 ? { kind: 'not-an-attachment' } : verdictFor(owners, prisma, now);
}

async function ownerRowsOf(storageKey: string, prisma: FileRouteVerdictPrisma): Promise<readonly OwnerRow[]> {
  const track = TRANSLATED_TRACK.exec(storageKey);
  if (track) return ownerRowsOfTrack(track[1], prisma);

  const direct = await prisma.messageAttachment.findMany({
    where: { OR: [{ filePath: storageKey }, { thumbnailPath: storageKey }] },
    select: OWNER_SELECT,
  });
  if (direct.length > 0) return direct;

  const variant = RESPONSIVE_VARIANT.exec(storageKey);
  if (!variant) return [];
  return prisma.messageAttachment.findMany({
    where: { OR: [{ filePath: variant[1] }, { filePath: { startsWith: `${variant[1]}.` } }] },
    select: OWNER_SELECT,
  });
}

/**
 * La piste porte l'identifiant de la ligne qui l'a fait naître ; ses copies
 * transférées partagent la carte de traductions, donc la piste, en même temps
 * que `filePath`. Une ligne disparue laisse la piste à son régime d'avant : ses
 * copies éventuelles ne se retrouvent pas sans balayer la collection, et
 * `deleteAttachment` efface la piste avec le dernier porteur.
 */
async function ownerRowsOfTrack(attachmentId: string, prisma: FileRouteVerdictPrisma): Promise<readonly OwnerRow[]> {
  const origin = await prisma.messageAttachment.findUnique({
    where: { id: attachmentId },
    select: { filePath: true },
  });
  if (!origin) return [];
  return prisma.messageAttachment.findMany({ where: { filePath: origin.filePath }, select: OWNER_SELECT });
}

async function verdictFor(
  owners: readonly OwnerRow[],
  prisma: FileRouteVerdictPrisma,
  now: Date
): Promise<FileRouteVerdict> {
  const pending = owners.some((row) => row.messageId === null);
  const messageIds = [...new Set(owners.flatMap((row) => (row.messageId ? [row.messageId] : [])))];
  const carriers = messageIds.length === 0 ? [] : await prisma.message.findMany({
    where: { id: { in: messageIds } },
    select: { id: true, deletedAt: true, expiresAt: true, viewOnceBurnAt: true, isViewOnce: true },
  });
  const living = carriers.filter((carrier) => carrierMessageStillServesBytes(carrier, now));
  if (living.length === 0 && !pending) return { kind: 'gone' };

  const livingIds = new Set(living.map((carrier) => carrier.id));
  const viewOnce =
    living.some((carrier) => carrier.isViewOnce || carrier.viewOnceBurnAt) ||
    owners.some((row) => row.isViewOnce && (row.messageId === null || livingIds.has(row.messageId)));
  if (viewOnce) return { kind: 'serve', cacheControl: VIEW_ONCE_ATTACHMENT_CACHE };

  const ephemeral = living.some((carrier) => carrier.expiresAt);
  return { kind: 'serve', cacheControl: ephemeral ? EPHEMERAL_ATTACHMENT_CACHE : ORDINARY_ATTACHMENT_CACHE };
}
