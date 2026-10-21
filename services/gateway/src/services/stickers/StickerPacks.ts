/**
 * LES PACKS DE STICKERS (#9141) — la FAÇADE du moteur des packs sur le
 * domaine `sticker` (#10148, LP0). Ses points d'entrée et ses types exportés
 * ne changent pas : `new StickerPacks(deps)` et `stickerPacksRoutes(fastify,
 * { packs })` restent la façon d'injecter le service.
 *
 * - boutique, packs installés, détail, installation : `services/packs/PackCatalog.ts`,
 *   paramétré par `stickerPackSpec` (Mee, Meo et Mee & Meo installés par
 *   défaut, packs publiés par des tiers) ;
 * - propositions et modération : `services/packs/PackSubmissions.ts`.
 *
 * Un pack non publié n'existe que pour son auteur et les modérateurs : pour
 * tout autre, il rend le même « absent » qu'un slug inconnu.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { validateStickerPackManifest, type StickerPackDetail, type StickerPackSummary } from '@meeshy/shared/types/sticker-pack';
import { PackCatalog, type PackInstallationBroadcast, type PackViewer } from '../packs/PackCatalog';
import { PackSubmissions, type ReviewDecision, type SubmitStickerPackOutcome } from '../packs/PackSubmissions';
import { stickerPackSpec } from '../packs/stickerPackSpec';
import { normalizeStickerImage, type StickerImageOutcome } from './stickerImage';
import type { StickerFileStore } from './StickerLibrary';

export type { StickerAssetRefusal, SubmitStickerPackOutcome, ReviewDecision } from '../packs/PackSubmissions';

export type StickerPackViewer = PackViewer;

export type StickerPacksDeps = {
  readonly prisma: PrismaClient;
  readonly files: StickerFileStore;
  readonly normalize?: (bytes: Buffer) => Promise<StickerImageOutcome>;
  readonly now?: () => Date;
  readonly newFileId?: () => string;
  /** `pack:installation-updated` vers les autres appareils du compte ; absent ⇒ rien n'est diffusé. */
  readonly broadcast?: PackInstallationBroadcast;
};

export class StickerPacks {
  /** Le moteur sur le domaine `sticker` — ce que la fabrique de routes sert. */
  readonly catalog: PackCatalog<StickerPackSummary, StickerPackDetail>;
  private readonly proposals: PackSubmissions;

  constructor(deps: StickerPacksDeps) {
    this.catalog = new PackCatalog({ prisma: deps.prisma, spec: stickerPackSpec(deps.prisma), now: deps.now, broadcast: deps.broadcast });
    this.proposals = new PackSubmissions({
      prisma: deps.prisma,
      spec: { validateManifest: validateStickerPackManifest, normalizeAsset: deps.normalize ?? normalizeStickerImage, files: deps.files },
      now: deps.now,
      newFileId: deps.newFileId,
    });
  }

  /** La boutique : les packs intégrés, puis les packs publiés, du plus installé au moins installé. */
  catalogue(userId: string): Promise<readonly StickerPackSummary[]> {
    return this.catalog.catalogue(userId);
  }

  /** Les packs installés, avec leurs stickers : ce que la feuille de stickers montre, un onglet par pack. */
  installed(userId: string): Promise<readonly StickerPackDetail[]> {
    return this.catalog.installed(userId);
  }

  /** Un pack et ses stickers — publié pour tous ; en attente ou refusé pour son auteur et les modérateurs seulement. */
  detail(slug: string, viewer: StickerPackViewer): Promise<StickerPackDetail | null> {
    return this.catalog.detail(slug, viewer);
  }

  /** Installe ou retire — `null` pour un pack que l'utilisateur ne peut pas installer (inconnu, non publié). */
  async setInstalled(userId: string, slug: string, installed: boolean): Promise<StickerPackSummary | null> {
    const outcome = await this.catalog.setInstalled(userId, slug, installed);
    return outcome.kind === 'done' ? outcome.pack : null;
  }

  submit(userId: string, input: unknown, assets: ReadonlyMap<string, Buffer>): Promise<SubmitStickerPackOutcome> {
    return this.proposals.submit(userId, input, assets);
  }

  /** Les propositions d'un auteur, les plus récentes d'abord — avec le mot du modérateur. */
  submissions(userId: string): Promise<readonly StickerPackDetail[]> {
    return this.proposals.submissions(userId);
  }

  /** La file de modération, la plus ancienne proposition d'abord. */
  pending(moderatorId: string): Promise<readonly StickerPackDetail[]> {
    return this.proposals.pending(moderatorId);
  }

  /** Publie ou refuse un pack EN ATTENTE — `null` s'il n'y en a pas sous ce slug. */
  review(moderatorId: string, slug: string, decision: ReviewDecision, note: string | null): Promise<StickerPackDetail | null> {
    return this.proposals.review(moderatorId, slug, decision, note);
  }
}
