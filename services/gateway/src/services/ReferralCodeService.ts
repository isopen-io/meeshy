/**
 * Code de parrainage INTRINSÈQUE au compte (#3690) — distinct d'un
 * `AffiliateToken`, qui nomme une campagne créée EXPLICITEMENT par un
 * utilisateur. Ici, chaque compte a le sien, généré PARESSEUSEMENT au premier
 * accès plutôt que par une migration de rétro-remplissage : un seul chemin de
 * génération sert les comptes anciens et les comptes neufs.
 *
 * Réutilise la loi de génération d'identifiant public partagée
 * (`utils/public-identifier.ts` — CSPRNG, escalade anti-collision) plutôt que
 * d'en réécrire une : c'est le même besoin que le jeton d'affiliation et le
 * lien de partage.
 */
import { generateUniquePublicIdentifier } from '../utils/public-identifier';

/** Préfixe de famille — distingue un code de parrainage d'un jeton d'affiliation (`aff_`) à l'œil. */
export const REFERRAL_CODE_PREFIX = 'ref_';

type ReferralCodePrisma = {
  user: {
    findUnique: (args: {
      where: { id?: string; referralCode?: string };
      select?: { referralCode?: boolean; id?: boolean };
    }) => Promise<{ id?: string; referralCode?: string | null } | null>;
    update: (args: {
      where: { id: string };
      data: { referralCode: string };
      select: { referralCode: boolean };
    }) => Promise<{ referralCode: string | null }>;
  };
};

/**
 * Rend le code de parrainage du compte, le générant s'il n'en a pas encore.
 * Idempotent : un appel répété sur le même compte rend toujours le MÊME code.
 */
export async function ensureReferralCode(prisma: ReferralCodePrisma, userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (!user) {
    throw new Error(`ensureReferralCode: unknown user (${userId})`);
  }
  if (user.referralCode) return user.referralCode;

  const code = await generateUniquePublicIdentifier({
    prefix: REFERRAL_CODE_PREFIX,
    label: 'code de parrainage',
    isTaken: async (candidate) => {
      const existing = await prisma.user.findUnique({ where: { referralCode: candidate }, select: { id: true } });
      return existing !== null;
    },
  });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { referralCode: code },
    select: { referralCode: true },
  });
  return updated.referralCode ?? code;
}
