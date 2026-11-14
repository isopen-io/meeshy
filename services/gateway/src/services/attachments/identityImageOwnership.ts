import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { profileImageStorageKey } from '@meeshy/shared/utils/profile-image-reference';

/**
 * UNE IMAGE D'IDENTITÉ NE DÉSIGNE QU'UN FICHIER DE CELUI QUI LA POSE (#16811).
 *
 * `/attachments/file/*` sert par chemin. Sans cette garde, un chemin relatif
 * posé en avatar ou en bannière — d'un profil ou d'une communauté — pouvait
 * désigner n'importe quelle pièce jointe du volume : une photo reçue en privé
 * devenait l'image publique de qui la recopiait.
 *
 * La référence est acceptée quand :
 * - elle ne désigne aucun fichier du volume (hôte tiers : l'affaire de #16809) ;
 * - elle est la valeur DÉJÀ posée (`current`) — rien ne change, et une valeur
 *   stockée avant cette garde n'est jamais refusée à son propriétaire ;
 * - une ligne `MessageAttachment` de type image, TÉLÉVERSÉE par l'appelant,
 *   porte ce fichier (colonne disque `filePath` ou colonne d'adresse
 *   `fileUrl`, qui portait la route de flux avant le 2026-09-16).
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
};

type AttachmentReader = Pick<PrismaClient, 'messageAttachment'>;

export async function identityImageIsCallers(
  prisma: AttachmentReader,
  query: IdentityImageOwnershipQuery,
): Promise<boolean> {
  if (query.current !== undefined && query.current !== null && query.reference === query.current) return true;
  const key = profileImageStorageKey(query.reference);
  if (key === null) return true;
  const upload = await prisma.messageAttachment.findFirst({
    where: {
      uploadedBy: query.userId,
      mimeType: { startsWith: 'image/' },
      OR: [{ filePath: key }, { fileUrl: key }, { fileUrl: query.reference }],
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
