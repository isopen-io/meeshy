/**
 * LE PARTENAIRE D'UNE LENS (#11327, S26) — son identité, son crédit, et le
 * comptage de l'usage de ses lens.
 *
 * Décisions du porteur (#11251, 2026-11-01), appliquées telles quelles :
 *  - **gratuit des deux côtés** en v1 : aucun prix, aucun flux d'argent ;
 *  - **identité** : un `PartnerProfile` que BIGBOSS ou ADMIN VÉRIFIE. Un nom
 *    déclaré et non vérifié ne crédite personne — le crédit est une identité,
 *    pas un texte libre qu'un tiers pourrait usurper ;
 *  - **crédit « Lens par X »** affiché sur le média reçu ; l'identifiant de la
 *    lens voyage EN CLAIR partout, conversations E2EE comprises (métadonnée
 *    assumée) ;
 *  - **filigrane** : celui de Meeshy ET le logo du partenaire.
 *
 * L'usage se compte par lens × jour × surface, en APPAREILS distincts, et
 * aucune ligne ne se sert sous `LENS_USAGE_K_ANONYMITY` appareils : une lens
 * à fenêtre géographique étroite ré-identifierait une petite cohorte.
 *
 * @see packages/shared/prisma/schema.prisma — `PartnerProfile`, `LensUsageDaily`,
 *      `MessageAttachment.lensSlug`, `PostMedia.lensSlug`
 */
import { LENS_LIMITS, LENS_PATTERNS } from './lens-format.js';

export const PARTNER_PROFILE_LIMITS = {
  maxDisplayNameLength: 60,
  maxWebsiteLength: 200,
  maxLogoBytes: 262_144,
} as const;

/** Aucune ligne d'usage sous ce nombre d'appareils distincts. */
export const LENS_USAGE_K_ANONYMITY = 20;

/** Où une lens se joue : la caméra, la story, le média envoyé en conversation, l'appel. */
export const LENS_USAGE_SURFACES = ['camera', 'story', 'message', 'call'] as const;
export type LensUsageSurface = (typeof LENS_USAGE_SURFACES)[number];

export const isLensUsageSurface = (value: unknown): value is LensUsageSurface =>
  typeof value === 'string' && (LENS_USAGE_SURFACES as readonly string[]).includes(value);

/**
 * L'identifiant de lens qu'un média DÉCLARE à son envoi. Strict : une valeur
 * qui n'a pas la forme d'un identifiant de lens ne se garde pas — un crédit
 * ne s'accroche jamais à une valeur douteuse.
 */
export function declaredLensSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  return raw.length <= LENS_LIMITS.maxIdLength && LENS_PATTERNS.id.test(raw) ? raw : null;
}

export type PartnerProfileInput = { readonly displayName: string; readonly website: string | null };

export type PartnerProfileParse = { readonly ok: true; readonly profile: PartnerProfileInput } | { readonly ok: false; readonly reason: 'display-name' | 'website' };

/**
 * Contrôle (Cc), format (Cf : invisibles, jointures, marques bidi, BOM) et
 * séparateurs de ligne ou de paragraphe : aucun n'a sa place dans un nom qui
 * s'affiche comme une identité vérifiée — chacun sert à fabriquer un nom qui
 * se LIT comme un autre.
 */
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

const cleanDisplayName = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const name = raw.normalize('NFKC').trim();
  if (name.length === 0 || name.length > PARTNER_PROFILE_LIMITS.maxDisplayNameLength) return null;
  return INVISIBLE_OR_CONTROL.test(name) ? null : name;
};

const cleanWebsite = (raw: unknown): string | null | undefined => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.length > PARTNER_PROFILE_LIMITS.maxWebsiteLength) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname.length > 0 ? raw : undefined;
  } catch {
    return undefined;
  }
};

/** Ce qu'un partenaire déclare de lui : un nom affichable et, au choix, un site https. */
export function parsePartnerProfileInput(raw: unknown): PartnerProfileParse {
  const input = raw !== null && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const displayName = cleanDisplayName(input.displayName);
  if (displayName === null) return { ok: false, reason: 'display-name' };
  const website = cleanWebsite(input.website);
  if (website === undefined) return { ok: false, reason: 'website' };
  return { ok: true, profile: { displayName, website } };
}

/** Le crédit qu'un média porte : « Lens par X », et ce que le filigrane compose. */
export type LensCredit = {
  readonly slug: string;
  readonly name: string;
  /**
   * `null` : aucun partenaire VÉRIFIÉ — le client écrit le nom de la lens, sans « par ».
   * `id` est l'identifiant OPAQUE du profil partenaire, jamais le compte qui le porte.
   */
  readonly partner: { readonly id: string; readonly name: string; readonly logo: string | null } | null;
  /** Le filigrane Meeshy est toujours là ; le logo du partenaire s'y ajoute quand il est vérifié. */
  readonly watermark: { readonly meeshy: true; readonly partnerLogo: string | null };
};

export type LensCreditLens = { readonly slug: string; readonly name: string; readonly status: string };
export type LensCreditPartner = { readonly id: string; readonly displayName: string; readonly verifiedAt: Date | null; readonly logoSrc: string | null };

/** Le crédit d'une lens PUBLIÉE ; `null` pour toute autre (en attente, refusée, retirée). */
export function lensCreditOf(lens: LensCreditLens, partner: LensCreditPartner | null): LensCredit | null {
  if (lens.status !== 'approved') return null;
  const verified = partner !== null && partner.verifiedAt !== null ? partner : null;
  return {
    slug: lens.slug,
    name: lens.name,
    partner: verified === null ? null : { id: verified.id, name: verified.displayName, logo: verified.logoSrc },
    watermark: { meeshy: true, partnerLogo: verified?.logoSrc ?? null },
  };
}

export type LensUsageRow = { readonly day: string; readonly surface: LensUsageSurface; readonly devices: number; readonly uses: number };

/** Les lignes servables : jamais une sous le seuil — ni ses usages, ni même sa présence. */
export const servedLensUsage = (rows: readonly LensUsageRow[], k: number = LENS_USAGE_K_ANONYMITY): readonly LensUsageRow[] =>
  rows.filter((row) => row.devices >= k);

/** Le jour UTC d'un usage, `AAAA-MM-JJ`. */
export const lensUsageDay = (at: Date): string => at.toISOString().slice(0, 10);
