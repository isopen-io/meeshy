import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { profileImageStorageKey } from '@meeshy/shared/utils/profile-image-reference';
import { isAbsoluteHttpReference, isMeeshyMediaUrl, meeshyMediaHostsFromEnv } from './meeshyMediaHosts';
import { unsetOrNull } from '../../utils/prisma-unset';

/**
 * UNE IMAGE D'IDENTITÉ NE DÉSIGNE QU'UN FICHIER DE CELUI QUI LA POSE (#16811).
 *
 * `/attachments/file/*` sert par chemin. Sans cette garde, un chemin relatif
 * posé en avatar ou en bannière — d'un profil ou d'une communauté — pouvait
 * désigner n'importe quelle pièce jointe du volume : une photo reçue en privé
 * devenait l'image publique de qui la recopiait.
 *
 * La référence est acceptée quand :
 * - elle est la valeur DÉJÀ posée (`current`) — rien ne change, et une valeur
 *   stockée avant cette garde n'est jamais refusée à son propriétaire, même
 *   vers un hôte tiers (lecture tolérante, écriture stricte) ;
 * - sinon, quand elle désigne un fichier du volume — une adresse absolue
 *   seulement sur un hôte Meeshy (`meeshyMediaHosts.ts`, #16809 : un hôte
 *   tiers recevrait l'IP de chaque lecteur) — et qu'une ligne
 *   `MessageAttachment` de type image, TÉLÉVERSÉE par l'appelant, porte ce
 *   fichier (colonne disque `filePath` ou colonne d'adresse `fileUrl`, qui
 *   portait la route de flux avant le 2026-09-16).
 *
 * ─── « TÉLÉVERSÉE » EST DÉSORMAIS TENU PAR UNE COLONNE (#20113, F1) ─────────
 *
 * Ce mot n'était tenu par RIEN. Il l'était par accident : une copie transférée
 * portait un `Participant.id` dans `uploadedBy`, la garde compare un `User.id`,
 * et les deux ne s'appariaient jamais. #20113 a unifié cet espace de clés pour
 * de bonnes raisons — et aurait emporté la garde avec l'accident.
 *
 * `copiedAttachmentFields` reprend `filePath`, `fileUrl` et `mimeType` À
 * L'IDENTIQUE (« le MÊME blob »), donc une copie transférée désigne le fichier
 * de QUELQU'UN D'AUTRE. D'où le refus explicite de toute ligne qui porte une
 * marque de transfert — `unsetOrNull` parce que, sur MongoDB, la colonne d'un
 * téléversement n'est pas nulle : elle est ABSENTE.
 *
 * La copie d'une DIFFUSION n'en porte aucune, et c'est juste : `copyAttachments`
 * exige que le demandeur soit l'expéditeur de la source (`copy-attachments:not-owner`),
 * donc elle ne recopie que ses propres octets — pour lesquels sa ligne de
 * téléversement existe de toute façon.
 *
 * Ce que ce refus évite, précisément : `/attachments/file/*` sert par CHEMIN et
 * sans authentification ; et `unlinkIfUnreferenced` compte les lignes
 * `MessageAttachment` qui citent un `filePath`, **jamais les avatars**. Une
 * photo reçue en privé et posée en image publique y resterait donc après que
 * son auteur a supprimé son message, puis son compte.
 *
 * C'est la règle que `PUT /admin/users/:userId/profile-images/:kind` applique
 * déjà à sa source `upload` (#8217). Une lecture qui échoue lève : la route
 * répond 500, jamais une acceptation par défaut.
 */
export const IDENTITY_IMAGE_NOT_OWNED = 'IDENTITY_IMAGE_NOT_OWNED';

export type IdentityImageOwnershipQuery = {
  readonly userId: string;
  readonly reference: string;
  readonly current?: string | null;
  readonly mediaHosts?: ReadonlySet<string>;
};

type AttachmentReader = Pick<PrismaClient, 'messageAttachment'>;

export async function identityImageIsCallers(
  prisma: AttachmentReader,
  query: IdentityImageOwnershipQuery,
): Promise<boolean> {
  if (query.current !== undefined && query.current !== null && query.reference === query.current) return true;
  if (isAbsoluteHttpReference(query.reference) && !isMeeshyMediaUrl(query.reference, query.mediaHosts ?? meeshyMediaHostsFromEnv())) {
    return false;
  }
  const key = profileImageStorageKey(query.reference);
  if (key === null) return false;
  const upload = await prisma.messageAttachment.findFirst({
    where: {
      uploadedBy: query.userId,
      mimeType: { startsWith: 'image/' },
      // Deux `OR` indépendants, donc un `AND` : le fichier visé, ET la preuve
      // que la ligne est un TÉLÉVERSEMENT.
      AND: [
        { OR: [{ filePath: key }, { fileUrl: key }, { fileUrl: query.reference }] },
        unsetOrNull('forwardedFromAttachmentId'),
      ],
    },
    select: { id: true },
  });
  return upload !== null;
}

export async function identityImagesAreCallers(
  prisma: AttachmentReader,
  params: {
    readonly userId: string;
    readonly images: ReadonlyArray<{ readonly reference: string | null | undefined; readonly current?: string | null }>;
  },
): Promise<boolean> {
  const verdicts = await Promise.all(
    params.images
      .filter((image): image is { reference: string; current?: string | null } => typeof image.reference === 'string')
      .map((image) => identityImageIsCallers(prisma, { userId: params.userId, reference: image.reference, current: image.current })),
  );
  return verdicts.every(Boolean);
}
