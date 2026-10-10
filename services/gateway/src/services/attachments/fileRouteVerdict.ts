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
 * Le lecteur, lui, est jugé par l'adresse SIGNÉE (#9600,
 * `readerFileSignature.ts`) : ce module dit seulement si un fichier se lit par
 * lecteur (`readerBound`), et son adresse nue est mesurée puis refusée
 * (`readerFileGate.ts`, #9647).
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
 * d'avant : ce module ne décide que pour ce qui lui appartient. Exception :
 * une clé à la FORME d'une piste traduite appartient à ce module même sans
 * ligne, et se refuse (#9588).
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
import { attachmentIsReaderBound } from './signedAttachmentUrls';

/**
 * `readerBound` (#9600) : TOUS les porteurs vivants de ce fichier sont des
 * contenus qui disparaissent (vue unique, flamme — la nature de la loi de
 * sortie, sur le message et sur sa pièce). Ses octets se lisent alors par
 * lecteur, et leur adresse servie est signée (`signedAttachmentUrls.ts`) ;
 * l'adresse NUE de ce fichier est celle que la transition mesure, puis refuse.
 * Un seul porteur ordinaire vivant suffit à le délier : ses lecteurs ont
 * légitimement l'adresse nue des mêmes octets.
 */
export type FileRouteVerdict =
  | { readonly kind: 'not-an-attachment' }
  | { readonly kind: 'gone' }
  | { readonly kind: 'serve'; readonly cacheControl: string; readonly readerBound: boolean };

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
/**
 * Un média ordinaire servi PAR IDENTIFIANT : l'identifiant ne désigne jamais
 * d'autres octets, d'où `immutable` en plus du cache long (#9478).
 */
export const ORDINARY_ATTACHMENT_BY_ID_CACHE = 'private, max-age=31536000, immutable';

const TRANSLATED_TRACK = /^translated\/([0-9a-f]{24})_[^/]+$/;
const RESPONSIVE_VARIANT = /^(.+)_\d+w\.webp$/;

type OwnerRow = {
  readonly messageId: string | null;
  readonly isViewOnce: boolean;
  readonly isBlurred?: boolean | null;
  readonly effectFlags?: number | null;
};

const OWNER_SELECT = { messageId: true, isViewOnce: true, isBlurred: true, effectFlags: true } as const;

const CARRIER_SELECT = {
  id: true,
  deletedAt: true,
  expiresAt: true,
  viewOnceBurnAt: true,
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  ephemeralDuration: true,
} as const;

export async function resolveFileRouteVerdict(
  storageKey: string,
  prisma: FileRouteVerdictPrisma,
  now: Date
): Promise<FileRouteVerdict> {
  const owners = await ownerRowsOf(storageKey, prisma);
  if (owners.length > 0) return verdictFor(owners, prisma, now);
  return TRANSLATED_TRACK.test(storageKey) ? { kind: 'gone' } : { kind: 'not-an-attachment' };
}

/**
 * Le cache d'un fichier servi PAR IDENTIFIANT (`/attachments/:id` et sa
 * miniature, #9478). Le droit de lecture est déjà jugé ; reste à dire combien
 * de temps un client peut garder ces octets — et c'est la MÊME loi que la route
 * par chemin, sur les mêmes porteurs : toutes les lignes qui partagent le
 * fichier de cette pièce jointe. Une ligne introuvable, ou un verdict qui a
 * basculé entre les deux lectures, ne promet aucun cache.
 */
export async function resolveAttachmentByIdCacheControl(
  attachmentId: string,
  prisma: FileRouteVerdictPrisma,
  now: Date
): Promise<string> {
  const owners = await ownerRowsSharingBytesOf(attachmentId, prisma);
  if (owners.length === 0) return VIEW_ONCE_ATTACHMENT_CACHE;
  const verdict = await verdictFor(owners, prisma, now);
  if (verdict.kind !== 'serve') return VIEW_ONCE_ATTACHMENT_CACHE;
  return verdict.cacheControl === ORDINARY_ATTACHMENT_CACHE ? ORDINARY_ATTACHMENT_BY_ID_CACHE : verdict.cacheControl;
}

async function ownerRowsOf(storageKey: string, prisma: FileRouteVerdictPrisma): Promise<readonly OwnerRow[]> {
  const track = TRANSLATED_TRACK.exec(storageKey);
  if (track) return ownerRowsSharingBytesOf(track[1], prisma);

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
 * que `filePath`. Une ligne disparue REFUSE la piste (#9588) : `translated/`
 * n'accueille que des pistes de pièces jointes de message, donc une clé de
 * cette forme sans ligne n'a plus de porteur dont lire le cycle de vie — la
 * servir comme un fichier ordinaire donnait un cache d'un an à la piste d'une
 * flamme. Ses copies éventuelles ne se retrouvent pas sans balayer la
 * collection (`forwardedFromAttachmentId` n'a pas d'index) : la copie encore
 * vivante d'un vocal ordinaire dont la source est supprimée retombe sur
 * l'audio d'origine.
 */
async function ownerRowsSharingBytesOf(attachmentId: string, prisma: FileRouteVerdictPrisma): Promise<readonly OwnerRow[]> {
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
    select: CARRIER_SELECT,
  });
  const living = carriers.filter((carrier) => carrierMessageStillServesBytes(carrier, now));
  if (living.length === 0 && !pending) return { kind: 'gone' };

  const readerBound =
    !pending &&
    living.every((carrier) =>
      owners
        .filter((row) => row.messageId === carrier.id)
        .every((row) => attachmentIsReaderBound(carrier, row)),
    );

  const livingIds = new Set(living.map((carrier) => carrier.id));
  const viewOnce =
    living.some((carrier) => carrier.isViewOnce || carrier.viewOnceBurnAt) ||
    owners.some((row) => row.isViewOnce && (row.messageId === null || livingIds.has(row.messageId)));
  if (viewOnce) return { kind: 'serve', cacheControl: VIEW_ONCE_ATTACHMENT_CACHE, readerBound };

  const ephemeral = living.some((carrier) => carrier.expiresAt);
  return { kind: 'serve', cacheControl: ephemeral ? EPHEMERAL_ATTACHMENT_CACHE : ORDINARY_ATTACHMENT_CACHE, readerBound };
}
