/**
 * LES PARTENAIRES DES LENS (#11327, S26) — leur identité vérifiée, le crédit
 * « Lens par X » que portent les médias, et le comptage k-anonyme de l'usage.
 *
 * Décisions du porteur (#11251, 2026-11-01) :
 *  - **gratuit des deux côtés** : ni prix, ni paiement, ni rémunération ;
 *  - **identité** : `PartnerProfile`, VÉRIFIÉ par BIGBOSS/ADMIN — jamais par
 *    soi-même. L'admin vérifie l'état qu'il a VU : la file sert une `version`
 *    opaque de chaque profil (nom, logo, site, horloge d'écriture), `verify`
 *    l'exige et la compare à l'état relu ; écart ⇒ `profile-changed` (409).
 *    L'écriture est conditionnelle sur ce même instantané, et elle part DANS
 *    LA MÊME TRANSACTION que sa ligne `AdminAuditLog` (ce qui a été vérifié :
 *    nom, empreinte du logo) : journal indisponible ⇒ rien ne change ; profil
 *    modifié entre la relecture et l'écriture ⇒ ni vérification, ni VERIFY au
 *    journal ;
 *  - changer son NOM ou son LOGO retire la vérification : une identité vérifiée
 *    ne se remplace pas après coup (le site, lui, peut changer) ;
 *  - **crédit** servi pour toute lens publiée (`lensCreditOf`) ; **filigrane** :
 *    Meeshy toujours, le logo du partenaire vérifié en plus.
 *
 * L'usage se compte par lens × jour × surface. `devices` dédoublonne les
 * comptes du jour par `HMAC(sel du jour, userId)` : le sel est tiré au hasard,
 * tenu en cache 48 h et jamais persisté — passé ce délai, personne, serveur
 * compris, ne relie plus un usage à un compte. Si le dédoublonnage n'est pas
 * joignable, RIEN n'est compté : un compte non dédoublonné ferait passer une
 * seule personne pour vingt, et casserait le seuil de k-anonymat. Le
 * dédoublonnage de production est STRICT (`lensUsageDedupFrom`) : jamais le
 * repli mémoire par processus du `CacheStore`.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { packChoiceKey } from '@meeshy/shared/types/content-pack';
import {
  LENS_USAGE_K_ANONYMITY,
  PARTNER_PROFILE_LIMITS,
  isLensUsageSurface,
  lensCreditOf,
  lensUsageDay,
  servedLensUsage,
  type LensCredit,
  type LensUsageRow,
  type LensUsageSurface,
  type PartnerProfileInput,
} from '@meeshy/shared/types/lens-partner';
import { normalizeStickerImage, type StickerImageOutcome } from '../stickers/stickerImage';
import type { PackViewer } from './PackCatalog';

export type PartnerProfileView = {
  /** L'identifiant OPAQUE du profil — celui que portent les crédits et l'adresse du logo. */
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly website: string | null;
  readonly logo: string | null;
  readonly verified: boolean;
  readonly verifiedAt: string | null;
  /** L'empreinte de l'état servi : ce que `verify` exige pour vérifier ce qui a été VU. */
  readonly version: string;
};

export type SavePartnerOutcome =
  | { readonly kind: 'saved'; readonly profile: PartnerProfileView }
  | { readonly kind: 'logo-refused'; readonly reason: string }
  | { readonly kind: 'conflict' };

export type VerifyPartnerOutcome =
  | { readonly kind: 'done'; readonly profile: PartnerProfileView }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'self-verify' }
  | { readonly kind: 'profile-changed' }
  | { readonly kind: 'audit-unavailable' };

/** Ce que l'admin a vu dans la file : la `version` servie par `pending`. */
export type PartnerProfileExpectation = { readonly version: string };

/** Qui lit un logo : un logo non vérifié ne se montre qu'à son propriétaire et à BIGBOSS/ADMIN. */
export type PartnerLogoViewer = { readonly userId: string; readonly isAdminRank: boolean };

export type PartnerLogo = { readonly bytes: Buffer; readonly contentType: string; readonly sha256: string; readonly verified: boolean };

export type RecordUsageOutcome = { readonly kind: 'not-found' } | { readonly kind: 'recorded'; readonly counted: boolean };

export type LensUsageReport = { readonly k: number; readonly rows: readonly LensUsageRow[] };

/** Le dédoublonnage du jour : `SET NX EX` et sa relecture. Doit LEVER plutôt que répondre depuis une mémoire par processus (`lensUsageDedupFrom`). */
export type LensUsageDedup = {
  readonly setnx: (key: string, value: string, ttlSeconds?: number) => Promise<boolean>;
  readonly get: (key: string) => Promise<string | null>;
};

export type LensPartnersDeps = {
  readonly prisma: Pick<PrismaClient, 'partnerProfile' | 'lensPack' | 'lensUsageDaily' | 'userStickerPack' | 'adminAuditLog' | '$transaction'>;
  readonly dedup: LensUsageDedup;
  readonly now?: () => Date;
  readonly normalizeLogo?: (bytes: Buffer) => Promise<StickerImageOutcome>;
};

const PROFILE_SELECT = {
  id: true, userId: true, displayName: true, website: true, logoSrc: true, logoSha256: true, verifiedAt: true, updatedAt: true,
} as const;

type ProfileRow = {
  readonly id: string;
  readonly userId: string;
  readonly displayName: string;
  readonly website: string | null;
  readonly logoSrc: string | null;
  readonly logoSha256: string | null;
  readonly verifiedAt: Date | null;
  readonly updatedAt: Date;
};

const LOGO_EXTENSION = { 'image/png': 'png', 'image/webp': 'webp' } as const;
const isLogoMime = (mime: string): mime is keyof typeof LOGO_EXTENSION => mime in LOGO_EXTENSION;

/** 48 h : le jour en cours, plus la marge d'un fuseau — jamais davantage. */
const DEDUP_TTL_SECONDS = 172_800;
/** L'agrégat lu couvre les 90 derniers jours. */
const USAGE_WINDOW_DAYS = 90;

/** Nom, logo, site et horloge d'écriture : tout ce que l'admin voit, et ce qui change à chaque écriture. */
const profileVersion = (row: ProfileRow): string =>
  createHash('sha256').update(JSON.stringify([row.displayName, row.logoSha256, row.website, row.updatedAt.toISOString()])).digest('hex').slice(0, 32);

/** La ligne telle qu'elle a été relue : la condition de toute écriture qui en dépend. */
const snapshotWhere = (row: ProfileRow) => ({
  userId: row.userId,
  displayName: row.displayName,
  logoSha256: row.logoSha256,
  website: row.website,
  updatedAt: row.updatedAt,
});

class AuditUnavailableError extends Error {}

const viewOf = (row: ProfileRow): PartnerProfileView => ({
  id: row.id,
  userId: row.userId,
  displayName: row.displayName,
  website: row.website,
  logo: row.logoSrc,
  verified: row.verifiedAt !== null,
  verifiedAt: row.verifiedAt?.toISOString() ?? null,
  version: profileVersion(row),
});

type LogoColumns = { readonly logoSrc: string | null; readonly logoSha256: string | null; readonly logoMime: string | null; readonly logoBytes: Uint8Array<ArrayBuffer> | null; readonly logoSize: number | null };

const NO_LOGO: LogoColumns = { logoSrc: null, logoSha256: null, logoMime: null, logoBytes: null, logoSize: null };

export class LensPartners {
  private readonly prisma: LensPartnersDeps['prisma'];
  private readonly dedup: LensUsageDedup;
  private readonly now: () => Date;
  private readonly normalizeLogo: (bytes: Buffer) => Promise<StickerImageOutcome>;

  constructor(deps: LensPartnersDeps) {
    this.prisma = deps.prisma;
    this.dedup = deps.dedup;
    this.now = deps.now ?? (() => new Date());
    this.normalizeLogo = deps.normalizeLogo ?? normalizeStickerImage;
  }

  async ownProfile(userId: string): Promise<PartnerProfileView | null> {
    const row = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    return row === null ? null : viewOf(row);
  }

  /**
   * Le partenaire écrit son profil. `logo` : `undefined` garde l'actuel, `null`
   * le retire, des octets le remplacent (ré-encodés, renommés par l'empreinte).
   * Un nom ou un logo qui change retire la vérification.
   *
   * L'écriture est conditionnelle sur l'état relu (`updatedAt`) : une écriture
   * concurrente — un autre appareil, ou une vérification — rend `conflict`
   * plutôt que d'être écrasée. La création est un `upsert` : deux créations
   * simultanées ne lèvent pas, et la seconde naît non vérifiée.
   */
  async saveOwnProfile(userId: string, input: { readonly profile: PartnerProfileInput; readonly logo: Buffer | null | undefined }): Promise<SavePartnerOutcome> {
    const logo = await this.logoColumns(input.logo);
    if ('reason' in logo) return { kind: 'logo-refused', reason: logo.reason };
    const current = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    const now = this.now();
    if (current === null) {
      const data = { displayName: input.profile.displayName, website: input.profile.website, ...(logo.columns ?? NO_LOGO), verifiedAt: null, verifiedBy: null, updatedAt: now };
      await this.prisma.partnerProfile.upsert({ where: { userId }, create: { userId, createdAt: now, ...data }, update: data });
    } else {
      const nextLogoSha = logo.columns === undefined ? current.logoSha256 : logo.columns.logoSha256;
      const identityChanged = current.displayName !== input.profile.displayName || current.logoSha256 !== nextLogoSha;
      const written = await this.prisma.partnerProfile.updateMany({
        where: { userId, updatedAt: current.updatedAt },
        data: {
          displayName: input.profile.displayName,
          website: input.profile.website,
          ...(logo.columns ?? {}),
          ...(identityChanged ? { verifiedAt: null, verifiedBy: null } : {}),
          updatedAt: now,
        },
      });
      if (written.count === 0) return { kind: 'conflict' };
    }
    const saved = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    if (saved === null) throw new Error('partner profile vanished after write');
    return { kind: 'saved', profile: viewOf(saved) };
  }

  /** La file de vérification : les profils non vérifiés, le plus ancien d'abord. */
  async pending(): Promise<readonly PartnerProfileView[]> {
    const rows = await this.prisma.partnerProfile.findMany({ where: { verifiedAt: null }, orderBy: { createdAt: 'asc' }, select: PROFILE_SELECT });
    return rows.map(viewOf);
  }

  /**
   * Vérifier ce que l'admin a VU : `expected.version` est celle que `pending`
   * a servie. L'état relu doit la porter, puis l'écriture est conditionnelle
   * sur ce même état et part dans la même transaction que sa ligne de journal.
   */
  async verify(adminId: string, userId: string, expected: PartnerProfileExpectation): Promise<VerifyPartnerOutcome> {
    if (adminId === userId) return { kind: 'self-verify' };
    const current = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    if (current === null) return { kind: 'not-found' };
    if (profileVersion(current) !== expected.version) return { kind: 'profile-changed' };
    const now = this.now();
    const outcome = await this.journaled(
      { adminId, userId, verified: true, metadata: { displayName: current.displayName, logoSha256: current.logoSha256, website: current.website } },
      (tx) => tx.partnerProfile.updateMany({ where: snapshotWhere(current), data: { verifiedAt: now, verifiedBy: adminId, updatedAt: now } }),
    );
    if (outcome === 'unchanged') return { kind: 'profile-changed' };
    return outcome === 'audit-unavailable' ? { kind: 'audit-unavailable' } : this.done(userId);
  }

  async revoke(adminId: string, userId: string, note: string | null): Promise<VerifyPartnerOutcome> {
    const current = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    if (current === null) return { kind: 'not-found' };
    const now = this.now();
    const outcome = await this.journaled(
      { adminId, userId, verified: false, metadata: { note, displayName: current.displayName } },
      (tx) => tx.partnerProfile.updateMany({ where: { userId }, data: { verifiedAt: null, verifiedBy: null, updatedAt: now } }),
    );
    if (outcome === 'unchanged') return { kind: 'not-found' };
    return outcome === 'audit-unavailable' ? { kind: 'audit-unavailable' } : this.done(userId);
  }

  /**
   * Le logo d'un partenaire, par l'identifiant OPAQUE de son profil. Vérifié :
   * à tous, pour le filigrane. Non vérifié : à son propriétaire et à
   * BIGBOSS/ADMIN seulement — sans quoi la vérification se ferait à l'aveugle.
   */
  async logo(viewer: PartnerLogoViewer, partnerId: string): Promise<PartnerLogo | null> {
    const row = await this.prisma.partnerProfile.findUnique({
      where: { id: partnerId },
      select: { userId: true, verifiedAt: true, logoBytes: true, logoMime: true, logoSha256: true },
    });
    if (row === null || row.logoBytes === null || row.logoMime === null || row.logoSha256 === null) return null;
    const verified = row.verifiedAt !== null;
    if (!verified && row.userId !== viewer.userId && !viewer.isAdminRank) return null;
    return { bytes: Buffer.from(row.logoBytes), contentType: row.logoMime, sha256: row.logoSha256, verified };
  }

  /** « Lens par X » pour chaque lens PUBLIÉE nommée ; les autres sont absentes. */
  async credits(slugs: readonly string[]): Promise<readonly LensCredit[]> {
    if (slugs.length === 0) return [];
    const lenses = await this.prisma.lensPack.findMany({ where: { slug: { in: [...slugs] }, status: 'approved' }, select: { slug: true, name: true, status: true, submitterId: true } });
    const submitters = [...new Set(lenses.map((lens) => lens.submitterId))];
    const partners = submitters.length === 0 ? [] : await this.prisma.partnerProfile.findMany({ where: { userId: { in: submitters } }, select: PROFILE_SELECT });
    const bySubmitter = new Map(partners.map((partner) => [partner.userId, partner]));
    return lenses.flatMap((lens) => {
      const credit = lensCreditOf(lens, bySubmitter.get(lens.submitterId) ?? null);
      return credit === null ? [] : [credit];
    });
  }

  /** Un usage d'une lens publiée, par qui l'a installée. */
  async recordUsage(userId: string, slug: string, surface: LensUsageSurface): Promise<RecordUsageOutcome> {
    if (!isLensUsageSurface(surface)) return { kind: 'not-found' };
    const lens = await this.prisma.lensPack.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (lens === null || lens.status !== 'approved') return { kind: 'not-found' };
    const installed = await this.prisma.userStickerPack.findFirst({ where: { userId, packSlug: packChoiceKey('lens', slug), installedAt: { not: null } }, select: { id: true } });
    if (installed === null) return { kind: 'not-found' };
    const day = lensUsageDay(this.now());
    const firstToday = await this.firstUseToday(day, `${lens.id}:${surface}`, userId);
    if (firstToday === null) return { kind: 'recorded', counted: false };
    await this.prisma.lensUsageDaily.upsert({
      where: { lensId_day_surface: { lensId: lens.id, day, surface } },
      create: { lensId: lens.id, day, surface, devices: firstToday ? 1 : 0, uses: 1 },
      update: { uses: { increment: 1 }, ...(firstToday ? { devices: { increment: 1 } } : {}) },
    });
    return { kind: 'recorded', counted: true };
  }

  /** L'agrégat d'une lens pour son auteur et la modération : jamais une ligne sous le seuil. */
  async usage(viewer: PackViewer, slug: string): Promise<LensUsageReport | null> {
    const lens = await this.prisma.lensPack.findUnique({ where: { slug }, select: { id: true, submitterId: true } });
    if (lens === null || (lens.submitterId !== viewer.userId && !viewer.canModerate)) return null;
    const since = lensUsageDay(new Date(this.now().getTime() - USAGE_WINDOW_DAYS * 86_400_000));
    const rows = await this.prisma.lensUsageDaily.findMany({
      where: { lensId: lens.id, day: { gte: since } },
      orderBy: { day: 'asc' },
      select: { day: true, surface: true, devices: true, uses: true },
    });
    const typed = rows.flatMap((row) => (isLensUsageSurface(row.surface) ? [{ day: row.day, surface: row.surface, devices: row.devices, uses: row.uses }] : []));
    return { k: LENS_USAGE_K_ANONYMITY, rows: servedLensUsage(typed) };
  }

  /**
   * `true` : premier usage de ce compte aujourd'hui sur cette lens et cette
   * surface ; `false` : déjà compté ; `null` : le dédoublonnage n'a pas répondu.
   */
  private async firstUseToday(day: string, scope: string, userId: string): Promise<boolean | null> {
    try {
      const saltKey = `lens-usage:salt:${day}`;
      await this.dedup.setnx(saltKey, randomBytes(32).toString('hex'), DEDUP_TTL_SECONDS);
      const salt = await this.dedup.get(saltKey);
      if (salt === null) return null;
      const device = createHmac('sha256', salt).update(userId).digest('hex');
      return await this.dedup.setnx(`lens-usage:seen:${day}:${scope}:${device}`, '1', DEDUP_TTL_SECONDS);
    } catch {
      return null;
    }
  }

  private async done(userId: string): Promise<VerifyPartnerOutcome> {
    const row = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    return row === null ? { kind: 'not-found' } : { kind: 'done', profile: viewOf(row) };
  }

  /**
   * Le geste et sa ligne de journal, dans UNE transaction : le journal n'écrit
   * jamais un geste qui n'a pas eu lieu, et un journal indisponible défait le
   * geste. `unchanged` : l'écriture conditionnelle n'a rien touché.
   */
  private async journaled(
    params: { readonly adminId: string; readonly userId: string; readonly verified: boolean; readonly metadata: Readonly<Record<string, unknown>> },
    write: (tx: Pick<PrismaClient, 'partnerProfile'>) => Promise<{ readonly count: number }>,
  ): Promise<'done' | 'unchanged' | 'audit-unavailable'> {
    const { adminId, userId, verified, metadata } = params;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const written = await write(tx);
        if (written.count === 0) return 'unchanged' as const;
        try {
          await tx.adminAuditLog.create({ data: { adminId, userId, action: verified ? 'PARTNER_PROFILE_VERIFY' : 'PARTNER_PROFILE_REVOKE', entity: 'PartnerProfile', entityId: userId, metadata: JSON.stringify(metadata) } });
        } catch {
          throw new AuditUnavailableError();
        }
        return 'done' as const;
      });
    } catch (error) {
      if (error instanceof AuditUnavailableError) return 'audit-unavailable';
      throw error;
    }
  }

  private async logoColumns(logo: Buffer | null | undefined): Promise<{ readonly columns: LogoColumns | undefined } | { readonly reason: string }> {
    if (logo === undefined) return { columns: undefined };
    if (logo === null) return { columns: NO_LOGO };
    if (logo.length === 0 || logo.length > PARTNER_PROFILE_LIMITS.maxLogoBytes) return { reason: 'too-large' };
    const outcome = await this.normalizeLogo(logo);
    if ('reason' in outcome) return { reason: outcome.reason };
    const { bytes, mimeType } = outcome.image;
    if (!isLogoMime(mimeType)) return { reason: 'not-an-image' };
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { columns: { logoSrc: `${sha256.slice(0, 16)}.${LOGO_EXTENSION[mimeType]}`, logoSha256: sha256, logoMime: mimeType, logoBytes: Uint8Array.from(bytes), logoSize: bytes.length } };
  }
}
