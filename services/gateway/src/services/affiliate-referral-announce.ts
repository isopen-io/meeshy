/**
 * Le FILLEUL d'un jeton de parrainage, annoncé à son parrain (#19446) : le
 * nombre exact de filleuls du jeton (`_count.affiliations` que la liste des
 * jetons sert déjà), jamais qui est arrivé. Ne fait jamais échouer l'inscription.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { LinkActivityRelay } from '../socketio/linkActivityEvents';

export type AffiliateReferralJoined = { readonly tokenId: string; readonly sponsorId: string };

export async function announceAffiliateReferral(params: {
  readonly prisma: { readonly affiliateRelation: Pick<PrismaClient['affiliateRelation'], 'count'> };
  readonly relay: LinkActivityRelay;
} & AffiliateReferralJoined): Promise<void> {
  try {
    const referralCount = await params.prisma.affiliateRelation.count({ where: { affiliateTokenId: params.tokenId } });
    params.relay.affiliateReferralJoined({ sponsorId: params.sponsorId, tokenId: params.tokenId, referralCount });
  } catch {
    /* l'inscription est faite ; l'annonce n'est qu'un écho */
  }
}

/** Le branchement des deux portes de conversion : l'annonce part sans être attendue. */
export function affiliateReferralAnnouncer(host: {
  readonly prisma: PrismaClient;
  readonly relay: LinkActivityRelay;
}): (joined: AffiliateReferralJoined) => void {
  return (joined) => {
    void announceAffiliateReferral({ prisma: host.prisma, relay: host.relay, ...joined }).catch(() => undefined);
  };
}
