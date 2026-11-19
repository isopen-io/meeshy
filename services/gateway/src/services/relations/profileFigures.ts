/**
 * « En chiffres » d'une autre personne (#19371) : la passerelle APPORTE la fiche
 * par cercle du lecteur et le réglage stocké du sujet à la loi partagée
 * (`profileFiguresServed`), sans la réécrire. Deux routes la lisent : `?expand=stats`
 * de la fiche (`routes/directory/person`) et `GET /users/:userId/stats`
 * (`routes/users/preferences`).
 *
 * Une lecture qui échoue FERME : les compteurs ne partent pas, la fiche reste servie.
 *
 * `privacy.showProfileFigures` n'a pas de défaut stocké (comme `autoAcquaintance`) :
 * il se lit dans le document JSON, l'absence de choix étant résolue par la loi.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ProfileCircleView } from '@meeshy/shared/utils/profile-circle-view';
import { profileFiguresServed } from '@meeshy/shared/utils/profile-figures';
import { readProfileCircleView } from './profileCircleView';

async function storedChoice(prisma: PrismaClient, subjectId: string): Promise<unknown> {
  const documents = await prisma.userPreferences.findMany({
    where: { userId: { in: [subjectId] } },
    select: { userId: true, privacy: true },
  });
  const privacy = documents.find((row) => row.userId === subjectId)?.privacy;
  return privacy && typeof privacy === 'object' && !Array.isArray(privacy)
    ? (privacy as Record<string, unknown>).showProfileFigures
    : undefined;
}

/**
 * Le lecteur reçoit-il « En chiffres » de ce sujet ? `view` est la fiche déjà
 * résolue (« Voir comme », ou la fiche par cercle quand la route l'a lue) ; sinon
 * elle se lit ici pour `viewerId`. Sans lecteur inscrit ni fiche, rien ne part.
 */
export async function profileFiguresOpen(
  prisma: PrismaClient,
  params: { readonly subjectId: string; readonly viewerId?: string; readonly view?: ProfileCircleView },
): Promise<boolean> {
  const { view: known, viewerId, subjectId } = params;
  if (!known && !viewerId) return false;
  try {
    const [view, showProfileFigures] = await Promise.all([
      known ?? readProfileCircleView(prisma, { viewerId: viewerId ?? '', targetId: subjectId }),
      storedChoice(prisma, subjectId),
    ]);
    return profileFiguresServed({ view, showProfileFigures });
  } catch {
    return false;
  }
}
