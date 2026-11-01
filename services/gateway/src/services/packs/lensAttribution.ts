/**
 * L'ATTRIBUTION D'UN MÉDIA À UNE LENS (#11327, S26) — la seule porte par
 * laquelle `lensSlug` entre dans `MessageAttachment` ou `PostMedia`.
 *
 * Le client DÉCLARE la lens qui a produit son média (métadonnée d'envoi
 * `lensSlug`, multipart et TUS). La passerelle ne la retient que si elle nomme
 * une lens PUBLIÉE que l'expéditeur a INSTALLÉE : sans cette garde, n'importe
 * qui accrocherait « Lens par <marque> » à n'importe quel média.
 *
 * Fail-closed sur le CRÉDIT, jamais sur l'ENVOI : une valeur douteuse ou une
 * lecture qui tombe rend `null`, et le média part sans crédit. Le slug retenu
 * voyage EN CLAIR, conversations E2EE comprises (décision #11251).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { packChoiceKey } from '@meeshy/shared/types/content-pack';
import { declaredLensSlug } from '@meeshy/shared/types/lens-partner';

export type LensAttributionDb = Pick<PrismaClient, 'lensPack' | 'userStickerPack'>;

export async function attributableLensSlug(prisma: LensAttributionDb, userId: string, raw: unknown): Promise<string | null> {
  const slug = declaredLensSlug(raw);
  if (slug === null) return null;
  try {
    const lens = await prisma.lensPack.findUnique({ where: { slug }, select: { status: true } });
    if (lens?.status !== 'approved') return null;
    const installed = await prisma.userStickerPack.findFirst({
      where: { userId, packSlug: packChoiceKey('lens', slug), installedAt: { not: null } },
      select: { id: true },
    });
    return installed === null ? null : slug;
  } catch {
    return null;
  }
}

/** Le champ à poser sur la ligne créée : rien quand aucune lens n'est retenue (la colonne reste absente). */
export async function lensAttributionFields(prisma: LensAttributionDb, userId: string | null | undefined, raw: unknown): Promise<{ readonly lensSlug: string } | Record<string, never>> {
  if (!userId || raw === undefined || raw === null) return {};
  const slug = await attributableLensSlug(prisma, userId, raw);
  return slug === null ? {} : { lensSlug: slug };
}
