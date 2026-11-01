/**
 * LES PARTENAIRES DES LENS (#11327, S26) — leur identité vérifiée, le crédit
 * « Lens par X » que portent les médias, et le comptage k-anonyme de l'usage.
 *
 * Décisions du porteur (#11251, 2026-11-01) :
 *  - **gratuit des deux côtés** : ni prix, ni paiement, ni rémunération ;
 *  - **identité** : `PartnerProfile`, VÉRIFIÉ par BIGBOSS/ADMIN — jamais par
 *    soi-même. Chaque vérification et chaque retrait s'écrivent au journal
 *    (`AdminAuditLog`) AVANT d'agir, avec ce qui a été vérifié (nom, empreinte
 *    du logo) ; l'écriture est conditionnelle sur cet instantané : un profil
 *    modifié entre la lecture et l'écriture n'est pas vérifié à son insu ;
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
 * seule personne pour vingt, et casserait le seuil de k-anonymat.
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
  readonly userId: string;
  readonly displayName: string;
  readonly website: string | null;
  readonly logo: string | null;
  readonly verified: boolean;
  readonly verifiedAt: string | null;
};

export type SavePartnerOutcome =
  | { readonly kind: 'saved'; readonly profile: PartnerProfileView }
  | { readonly kind: 'logo-refused'; readonly reason: string };

export type VerifyPartnerOutcome =
  | { readonly kind: 'done'; readonly profile: PartnerProfileView }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'self-verify' }
  | { readonly kind: 'audit-unavailable' };

export type RecordUsageOutcome = { readonly kind: 'not-found' } | { readonly kind: 'recorded'; readonly counted: boolean };

export type LensUsageReport = { readonly k: number; readonly rows: readonly LensUsageRow[] };

/** Le dédoublonnage du jour : `SET NX EX` et sa relecture (Redis, ou la `Map` de repli du `CacheStore`). */
export type LensUsageDedup = {
  readonly setnx: (key: string, value: string, ttlSeconds?: number) => Promise<boolean>;
  readonly get: (key: string) => Promise<string | null>;
};

export type LensPartnersDeps = {
  readonly prisma: Pick<PrismaClient, 'partnerProfile' | 'lensPack' | 'lensUsageDaily' | 'userStickerPack' | 'adminAuditLog'>;
  readonly dedup: LensUsageDedup;
  readonly now?: () => Date;
  readonly normalizeLogo?: (bytes: Buffer) => Promise<StickerImageOutcome>;
};

const PROFILE_SELECT = {
  userId: true, displayName: true, website: true, logoSrc: true, logoSha256: true, verifiedAt: true,
} as const;

type ProfileRow = {
  readonly userId: string;
  readonly displayName: string;
  readonly website: string | null;
  readonly logoSrc: string | null;
  readonly logoSha256: string | null;
  readonly verifiedAt: Date | null;
};

const LOGO_EXTENSION = { 'image/png': 'png', 'image/webp': 'webp' } as const;
const isLogoMime = (mime: string): mime is keyof typeof LOGO_EXTENSION => mime in LOGO_EXTENSION;

/** 48 h : le jour en cours, plus la marge d'un fuseau — jamais davantage. */
const DEDUP_TTL_SECONDS = 172_800;
/** L'agrégat lu couvre les 90 derniers jours. */
const USAGE_WINDOW_DAYS = 90;

const viewOf = (row: ProfileRow): PartnerProfileView => ({
  userId: row.userId,
  displayName: row.displayName,
  website: row.website,
  logo: row.logoSrc,
  verified: row.verifiedAt !== null,
  verifiedAt: row.verifiedAt?.toISOString() ?? null,
});

type LogoColumns = { readonly logoSrc: string | null; readonly logoSha256: string | null; readonly logoMime: string | null; readonly logoBytes: Uint8Array | null; readonly logoSize: number | null };

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
   */
  async saveOwnProfile(userId: string, input: { readonly profile: PartnerProfileInput; readonly logo: Buffer | null | undefined }): Promise<SavePartnerOutcome> {
    const logo = await this.logoColumns(input.logo);
    if ('reason' in logo) return { kind: 'logo-refused', reason: logo.reason };
    const current = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    const nextLogoSha = logo.columns === undefined ? (current?.logoSha256 ?? null) : logo.columns.logoSha256;
    const identityChanged = current === null || current.displayName !== input.profile.displayName || current.logoSha256 !== nextLogoSha;
    const data = {
      displayName: input.profile.displayName,
      website: input.profile.website,
      ...(logo.columns ?? {}),
      ...(identityChanged ? { verifiedAt: null, verifiedBy: null } : {}),
    };
    if (current === null) {
      await this.prisma.partnerProfile.create({ data: { userId, ...NO_LOGO, ...data, verifiedAt: null, verifiedBy: null, createdAt: this.now(), updatedAt: this.now() } });
    } else {
      await this.prisma.partnerProfile.updateMany({ where: { userId }, data: { ...data, updatedAt: this.now() } });
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

  async verify(adminId: string, userId: string): Promise<VerifyPartnerOutcome> {
    if (adminId === userId) return { kind: 'self-verify' };
    const current = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    if (current === null) return { kind: 'not-found' };
    const snapshot = { displayName: current.displayName, logoSha256: current.logoSha256 };
    if (!(await this.journal(adminId, userId, 'PARTNER_PROFILE_VERIFY', snapshot))) return { kind: 'audit-unavailable' };
    const written = await this.prisma.partnerProfile.updateMany({ where: { userId, ...snapshot }, data: { verifiedAt: this.now(), verifiedBy: adminId } });
    if (written.count === 0) return { kind: 'not-found' };
    return this.done(userId);
  }

  async revoke(adminId: string, userId: string, note: string | null): Promise<VerifyPartnerOutcome> {
    const current = await this.prisma.partnerProfile.findUnique({ where: { userId }, select: PROFILE_SELECT });
    if (current === null) return { kind: 'not-found' };
    if (!(await this.journal(adminId, userId, 'PARTNER_PROFILE_REVOKE', { note, displayName: current.displayName }))) return { kind: 'audit-unavailable' };
    await this.prisma.partnerProfile.updateMany({ where: { userId }, data: { verifiedAt: null, verifiedBy: null } });
    return this.done(userId);
  }

  /** Le logo d'un partenaire VÉRIFIÉ, pour le filigrane ; rien sinon. */
  async logo(userId: string): Promise<{ readonly bytes: Buffer; readonly contentType: string; readonly sha256: string } | null> {
    const row = await this.prisma.partnerProfile.findFirst({
      where: { userId, verifiedAt: { not: null } },
      select: { logoBytes: true, logoMime: true, logoSha256: true },
    });
    if (row?.logoBytes === null || row?.logoBytes === undefined || row.logoMime === null || row.logoSha256 === null) return null;
    return { bytes: Buffer.from(row.logoBytes), contentType: row.logoMime, sha256: row.logoSha256 };
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

  private async journal(adminId: string, userId: string, action: 'PARTNER_PROFILE_VERIFY' | 'PARTNER_PROFILE_REVOKE', metadata: Readonly<Record<string, unknown>>): Promise<boolean> {
    try {
      await this.prisma.adminAuditLog.create({ data: { adminId, userId, action, entity: 'PartnerProfile', entityId: userId, metadata: JSON.stringify(metadata) } });
      return true;
    } catch {
      return false;
    }
  }

  private async logoColumns(logo: Buffer | null | undefined): Promise<{ readonly columns: LogoColumns | undefined } | { readonly reason: string }> {
    if (logo === undefined) return { columns: undefined };
    if (logo === null) return { columns: NO_LOGO };
    if (logo.length === 0 || logo.length > PARTNER_PROFILE_LIMITS.maxLogoBytes) return { reason: 'too-large' };
    const outcome = await this.normalizeLogo(logo);
    if (!outcome.ok) return { reason: outcome.reason };
    const { bytes, mimeType } = outcome.image;
    if (!isLogoMime(mimeType)) return { reason: 'not-an-image' };
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    return { columns: { logoSrc: `${sha256.slice(0, 16)}.${LOGO_EXTENSION[mimeType]}`, logoSha256: sha256, logoMime: mimeType, logoBytes: Uint8Array.from(bytes), logoSize: bytes.length } };
  }
}
