/**
 * LE LECTEUR D'UN CIBLAGE DE PACK (#11274) — ce que le SERVEUR sait de lui :
 * ses communautés actives, son pays (celui de l'appareil, sinon celui de
 * l'inscription, sinon celui de son numéro) et le prisme de ses langues.
 * Jamais un fait déclaré par le client au moment de l'achat.
 *
 * Une lecture qui échoue rend le lecteur INCONNU : aucune dimension déclarée
 * n'est satisfaite, et seuls les packs sans ciblage restent offerts.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { UNKNOWN_PACK_AUDIENCE, type PackAudience } from '@meeshy/shared/types/pack-availability';
import { RECIPIENT_LANG_SELECT, recipientLanguages } from '../../utils/recipient-language';

type AudiencePrisma = {
  readonly user: Pick<PrismaClient['user'], 'findUnique'>;
  readonly communityMember: Pick<PrismaClient['communityMember'], 'findMany'>;
};

const COUNTRY_PATTERN = /^[A-Za-z]{2}$/;

const countryOf = (...candidates: readonly (string | null | undefined)[]): string | null =>
  candidates.find((value): value is string => typeof value === 'string' && COUNTRY_PATTERN.test(value))?.toUpperCase() ?? null;

export async function readPackAudience(prisma: AudiencePrisma, userId: string): Promise<PackAudience> {
  try {
    const [user, memberships] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { ...RECIPIENT_LANG_SELECT, deviceCountry: true, registrationCountry: true, phoneCountryCode: true },
      }),
      prisma.communityMember.findMany({ where: { userId, isActive: true }, select: { communityId: true } }),
    ]);
    if (user === null) return UNKNOWN_PACK_AUDIENCE;
    return {
      communityIds: new Set(memberships.map((membership) => membership.communityId)),
      country: countryOf(user.deviceCountry, user.registrationCountry, user.phoneCountryCode),
      languages: recipientLanguages(user),
    };
  } catch {
    return UNKNOWN_PACK_AUDIENCE;
  }
}
