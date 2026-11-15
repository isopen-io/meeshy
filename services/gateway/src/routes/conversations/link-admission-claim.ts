import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { LinkAdmissionRefusal } from '../../services/conversations/linkAdmission';

/**
 * La CONSOMMATION d'une place de lien partagé, et le refus qui va avec.
 *
 * Tiré de `link-admission.ts` au lot #16837, pour une raison de STRUCTURE et
 * non de taille : les deux admissions — l'invité (`link-admission-guest.ts`) et
 * l'inscrit (`link-admission.ts`) — consomment la même place. Les laisser dans
 * le fichier de l'inscrit faisait de l'import du module invité un CYCLE de
 * valeur ; ici, les deux importent d'un troisième, et il n'y a plus de cycle.
 */
/** Exporté pour `link-admission-guest.ts` (#16837) : les deux admissions consomment la même place. */
export async function claimLinkUse(
  prisma: PrismaClient,
  linkId: string,
  maxUses: number | null,
  extraIncrements: Record<string, { increment: number }> = {}
): Promise<boolean> {
  // #10470 (R2) — l'état du lien se revérifie AU MOMENT de la réservation : une
  // fermeture ou une échéance tombée depuis la lecture d'admission refuse, sans
  // quoi l'invité entrerait après la fermeture et échapperait à la révocation.
  const now = new Date();
  const claim = await prisma.conversationShareLink.updateMany({
    where: {
      id: linkId,
      isActive: true,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { isSet: false } }, { expiresAt: { gt: now } }] },
        ...(maxUses === null ? [] : [{ OR: [{ maxUses: null }, { currentUses: { lt: maxUses } }] }]),
      ],
    },
    data: { currentUses: { increment: 1 }, ...extraIncrements },
  });
  return claim.count > 0;
}

export const LINK_EXHAUSTED_RACE: LinkAdmissionRefusal = {
  granted: false,
  status: 409,
  code: 'LINK_EXHAUSTED',
  message: "Ce lien a atteint sa limite d'utilisation",
};
