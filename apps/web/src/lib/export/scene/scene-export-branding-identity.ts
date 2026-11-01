import { relationExportBadge } from '@meeshy/shared/utils/relation-export-badge';
import { getUserPresenceStatus, presenceDotHex, type UserPresenceSource } from '@meeshy/shared/utils/user-presence';

/**
 * **L'IDENTITÉ PEINTE SUR L'INTRO ET SUR LA FIN D'UNE STORY EXPORTÉE** (#13997)
 * — ce que `StoryExportIntroContent` (iOS) porte, réduit à ce que le web
 * détient de l'auteur.
 *
 * Deux projections, et aucune ne DÉCIDE :
 *  - la PRÉSENCE est celle que le serveur a SERVIE pour l'auteur (déjà
 *    filtrée par `resolvePresenceVisibility` : pas ami ⇒ rien n'est servi) ;
 *    absente ⇒ aucun point. Le calcul est le miroir de la plateforme
 *    (`getUserPresenceStatus`), l'état « hors ligne » ne dessine rien. Sa
 *    PROPRE story : soi est toujours visible, donc en ligne ;
 *  - le LOGO de cercle est `relationExportBadge` du niveau EFFECTIF servi
 *    (Proche 🔥, Sang 🩸 ; Ami et en dessous, ou le doute, rien). Sa propre
 *    story ne porte jamais de logo.
 */

export type BrandingAuthor = {
  readonly authorId: string;
  readonly displayName: string;
  readonly username: string;
  readonly avatarSrc: string | null;
  /** La bannière de l'auteur ; absente, l'intro se peint en dégradé d'accent assombri. */
  readonly bannerSrc: string | null;
  /** « RRGGBB », la teinte de repli de l'avatar et du dégradé. */
  readonly accentHex: string;
  readonly moodEmoji: string | null;
  readonly moodMessage: string | null;
  /** La présence SERVIE pour l'auteur ; `null` : rien n'a été servi. */
  readonly presence: UserPresenceSource | null;
  /** C'est SA story : en ligne, sans logo. */
  readonly self: boolean;
};

export type BrandingIdentity = {
  readonly displayName: string;
  readonly username: string;
  readonly avatarSrc: string | null;
  readonly bannerSrc: string | null;
  readonly accentHex: string;
  readonly moodEmoji: string | null;
  readonly moodMessage: string | null;
  /** La couleur du point de présence, `null` : aucun point. */
  readonly presenceDotHex: string | null;
  /** Le logo du cercle, `null` : rien n'est peint. */
  readonly circleBadge: string | null;
};

const filled = (value: string | null): string | null => (value === null || value.trim() === '' ? null : value.trim());

function presenceDotOf(author: BrandingAuthor, now: number): string | null {
  if (author.self) return presenceDotHex('online', { here: false });
  if (author.presence === null) return null;
  return presenceDotHex(getUserPresenceStatus(author.presence, now), { here: false });
}

export function brandingIdentityOf(params: { readonly author: BrandingAuthor; readonly level: unknown; readonly now: number }): BrandingIdentity {
  const { author } = params;
  const moodEmoji = filled(author.moodEmoji);
  return {
    displayName: filled(author.displayName) ?? author.username,
    username: author.username,
    avatarSrc: author.avatarSrc,
    bannerSrc: author.bannerSrc,
    accentHex: author.accentHex,
    moodEmoji,
    moodMessage: moodEmoji === null ? null : filled(author.moodMessage),
    presenceDotHex: presenceDotOf(author, params.now),
    circleBadge: author.self ? null : relationExportBadge(params.level),
  };
}
