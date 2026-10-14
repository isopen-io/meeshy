/**
 * LE MOTEUR DES PACKS, À DOMAINES (#10148, LP0) — boutique, packs installés,
 * détail et installation, pour les stickers (#9141), les cadres de gloire et
 * les cadres de capture, par le MÊME code (`docs/product/cadres-de-gloire/PROMPT-developpement.md`
 * § 5.10.3–5.10.4, décisions D-P1 et D-P6).
 *
 * Un domaine se décrit par une `PackDomainSpec` : son REGISTRE (les packs
 * intégrés ou officiels, sans ligne de pack en base, dans l'ordre éditorial),
 * son magasin COMMUNAUTAIRE (les packs proposés par des tiers — stickers seuls
 * en v1), sa garde de retrait et sa projection.
 *
 * Installer est une préférence de COMPTE : une ligne `UserStickerPack` sous la
 * clé `packChoiceKey(domaine, slug)` — le slug NU pour un sticker,
 * `<domaine>.<slug>` sinon (D-P1, aucun changement de schéma). Seul ce
 * répertoire lit ou écrit `userStickerPack`.
 *
 * Trois propriétés que l'ancien `StickerPacks.setInstalled` n'avait pas :
 *
 * - **le compteur est ATOMIQUE** — le delta d'`installCount` est le nombre de
 *   lignes réellement BASCULÉES par un `updateMany` conditionnel sur l'état
 *   inverse, ou la création d'une ligne qui n'existait pas ; jamais une lecture
 *   préalable, qui comptait double sous deux `PUT` concurrents. Un `P2002`
 *   (l'index unique `(userId, packSlug)`) mène à un nouvel essai ;
 * - **les domaines sont ISOLÉS** — un domaine ne lit, parmi les choix d'un
 *   utilisateur, que les clés du sien (`parsePackChoiceKey`) : la boutique des
 *   stickers ne voit jamais une clé `glory-frame.*`, et ce n'est plus un
 *   accident de requête ;
 * - **l'installation se DIFFUSE** — `pack:installation-updated` part sur la
 *   room personnelle après chaque écriture : les autres appareils du compte
 *   suivent sans relire.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  isPackInstalled,
  isPackOwned,
  packChoiceKey,
  parsePackChoiceKey,
  type PackDomain,
  type PackRegistries,
} from '@meeshy/shared/types/content-pack';
import type { PackInstallationUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { MeeshSpend, type SpendTx } from '../game/MeeshSpend';

export type PackViewer = { readonly userId: string; readonly canModerate: boolean };

/** Un pack du registre d'un domaine : intégré ou officiel, servi sans ligne de pack en base. */
export type RegistryPack<D> = {
  readonly slug: string;
  readonly installedByDefault: boolean;
  readonly removable: boolean;
  /** Masqué : absent de la boutique, ni installable s'il ne l'est pas déjà ; servi en LECTURE (une photo gardée se reprend). */
  readonly hidden: boolean;
  /** Le prix en Meeshes (#10632) ; absent = gratuit, possédé par tout compte inscrit. */
  readonly price?: number;
  /** La version du pack au registre, consignée sur la ligne de dépense. */
  readonly version?: number;
  /** `owned` : la loi de possession (`isPackOwned`) pour ce lecteur ; les domaines sans prix l'ignorent. */
  readonly project: (installed: boolean, owned: boolean) => D;
};

/** Un pack communautaire qu'un utilisateur peut installer : son identité en base, et sa projection selon l'état et le compteur. */
export type CommunityInstallTarget<D> = {
  readonly id: string;
  readonly installCount: number;
  readonly project: (installed: boolean, installCount: number) => D;
};

/** Les packs proposés par des tiers et publiés — aujourd'hui la seule table `StickerPack`. */
export interface CommunityPackStore<D> {
  /** Les packs publiés, dans l'ordre de la boutique. */
  catalogue(installedOf: (slug: string) => boolean): Promise<readonly D[]>;
  /** Les packs publiés parmi `slugs`, installés, dans l'ordre de `slugs`. */
  installed(slugs: readonly string[]): Promise<readonly D[]>;
  /** Un pack, publié pour tous ; en attente ou refusé pour son auteur et les modérateurs seulement. */
  detail(slug: string, viewer: PackViewer, installedOf: (slug: string) => boolean): Promise<D | null>;
  /** `null` pour un pack qu'on ne peut pas installer (inconnu, non publié). */
  installable(slug: string): Promise<CommunityInstallTarget<D> | null>;
  /** Ajoute `delta` au compteur, atomiquement (`{ increment }`), et rend la nouvelle valeur. */
  addInstalls(id: string, delta: number): Promise<number>;
}

export type PackDomainSpec<S, D extends S> = {
  readonly domain: PackDomain;
  readonly registry: readonly RegistryPack<D>[];
  readonly community: CommunityPackStore<D> | null;
  /**
   * Rend `true` quand le retrait est PERMIS ; `null` pour un domaine sans garde.
   * Les cadres de gloire y refuseront le pack de l'atmosphère choisie (PP7,
   * L10a) : la règle s'applique côté serveur, sans quoi un autre appareil ou
   * un ancien client la contournerait.
   */
  readonly removalGuard: ((userId: string, slug: string) => Promise<boolean>) | null;
  readonly toSummary: (detail: D) => S;
};

export type SetInstalledOutcome<S> =
  | { readonly kind: 'done'; readonly pack: S }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'not-removable' }
  | { readonly kind: 'not-owned' };

export type PurchaseOutcome<S> =
  | { readonly kind: 'done'; readonly pack: S; readonly balance: number }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'free' }
  | { readonly kind: 'already-owned' }
  | { readonly kind: 'insufficient'; readonly balance: number };

class PurchaseRefusal extends Error {
  constructor(readonly reason: 'already-owned') {
    super(reason);
  }
}

type SettleClient = Pick<PrismaClient, 'userStickerPack'>;

export type PackInstallationBroadcast = (userId: string, event: PackInstallationUpdatedEventData) => void;

export type PackCatalogDeps<S, D extends S> = {
  readonly prisma: PrismaClient;
  readonly spec: PackDomainSpec<S, D>;
  readonly now?: () => Date;
  readonly broadcast?: PackInstallationBroadcast;
  readonly spend?: MeeshSpend;
};

type Choices = ReadonlyMap<string, { readonly installed: boolean }>;

const UNIQUE_VIOLATION = 'P2002';
const MAX_SETTLE_ATTEMPTS = 3;

export const isUniqueViolation = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === UNIQUE_VIOLATION;

/** L'état « installé » / « retiré » d'une ligne, écrit avec l'idiome Mongo d'un champ nullable qui peut être ABSENT. */
const stateFilter = (installed: boolean) =>
  installed ? { installedAt: { not: null } } : { OR: [{ installedAt: null }, { installedAt: { isSet: false } }] };

export class PackCatalog<S, D extends S> {
  readonly domain: PackDomain;
  private readonly prisma: PrismaClient;
  private readonly spec: PackDomainSpec<S, D>;
  private readonly now: () => Date;
  private readonly broadcast: PackInstallationBroadcast | undefined;
  private readonly registries: PackRegistries;
  private readonly spend: MeeshSpend;

  constructor(deps: PackCatalogDeps<S, D>) {
    this.prisma = deps.prisma;
    this.spec = deps.spec;
    this.domain = deps.spec.domain;
    this.now = deps.now ?? (() => new Date());
    this.broadcast = deps.broadcast;
    this.spend = deps.spend ?? new MeeshSpend(deps.prisma);
    this.registries = { [deps.spec.domain]: deps.spec.registry.map(({ slug, installedByDefault }) => ({ slug, installedByDefault })) };
  }

  /** La boutique : le registre dans l'ordre éditorial (masqués exclus), puis les packs communautaires publiés. */
  async catalogue(userId: string): Promise<readonly S[]> {
    const choices = await this.choices(userId);
    const installedOf = this.installedOf(choices);
    const ownedOf = await this.ownedOf(userId);
    const official = this.spec.registry.filter((pack) => !pack.hidden).map((pack) => this.spec.toSummary(pack.project(installedOf(pack.slug), ownedOf(pack))));
    const community = this.spec.community === null ? [] : await this.spec.community.catalogue(installedOf);
    return [...official, ...community.map(this.spec.toSummary)];
  }

  /** Les packs installés, avec leur contenu : le registre d'abord (masqués compris), puis les communautaires dans l'ordre des choix. */
  async installed(userId: string): Promise<readonly D[]> {
    const choices = await this.choices(userId);
    const installedOf = this.installedOf(choices);
    const ownedOf = await this.ownedOf(userId);
    const official = this.spec.registry.filter((pack) => installedOf(pack.slug)).map((pack) => pack.project(true, ownedOf(pack)));
    const chosen = [...choices.entries()].filter(([slug, choice]) => choice.installed && this.registryPack(slug) === undefined).map(([slug]) => slug);
    if (chosen.length === 0 || this.spec.community === null) return official;
    return [...official, ...(await this.spec.community.installed(chosen))];
  }

  /** Un pack — du registre (masqué compris, en lecture), sinon communautaire et visible de ce lecteur. */
  async detail(slug: string, viewer: PackViewer): Promise<D | null> {
    const choices = await this.choices(viewer.userId);
    const installedOf = this.installedOf(choices);
    const pack = this.registryPack(slug);
    if (pack !== undefined) return pack.project(installedOf(slug), (await this.ownedOf(viewer.userId))(pack));
    return this.spec.community === null ? null : this.spec.community.detail(slug, viewer, installedOf);
  }

  /**
   * Installe ou retire. `not-found` : inconnu du domaine, non publié, ou
   * masqué et pas encore installé ; `not-removable` : retrait d'un pack non
   * retirable, ou refusé par la garde du domaine.
   */
  async setInstalled(userId: string, slug: string, installed: boolean): Promise<SetInstalledOutcome<S>> {
    const pack = this.registryPack(slug);
    const target = pack === undefined && this.spec.community !== null ? await this.spec.community.installable(slug) : null;
    if (pack === undefined && target === null) return { kind: 'not-found' };
    if (pack?.hidden === true && installed && !(await this.isInstalledNow(userId, pack))) return { kind: 'not-found' };
    if (installed && pack !== undefined && !(await this.ownedOf(userId))(pack)) return { kind: 'not-owned' };
    if (!installed && pack !== undefined && !pack.removable) return { kind: 'not-removable' };
    if (!installed && this.spec.removalGuard !== null && !(await this.spec.removalGuard(userId, slug))) return { kind: 'not-removable' };

    const byDefault = isPackInstalled(this.domain, slug, undefined, this.registries);
    const { delta, at } = await this.settle(this.prisma, userId, packChoiceKey(this.domain, slug), installed, byDefault);
    this.broadcast?.(userId, { domain: this.domain, slug, installed, at: at.toISOString() });

    if (target === null) return { kind: 'done', pack: this.spec.toSummary((pack as RegistryPack<D>).project(installed, true)) };
    const installCount = delta === 0 ? target.installCount : await (this.spec.community as CommunityPackStore<D>).addInstalls(target.id, delta);
    return { kind: 'done', pack: this.spec.toSummary(target.project(installed, installCount)) };
  }

  /**
   * ACHÈTE un pack payant du registre (#10632, § 4.3) : la dépense, la
   * possession et l'installation s'écrivent dans UNE transaction
   * (`MeeshSpend.spend`), idempotente par `(userId, requestId)`. Le prix est
   * celui du REGISTRE, jamais celui d'un client. Un rejeu rend le même pack.
   */
  async purchase(userId: string, slug: string, requestId: string): Promise<PurchaseOutcome<S>> {
    const pack = this.registryPack(slug);
    if (pack === undefined || pack.hidden) return { kind: 'not-found' };
    const price = pack.price;
    if (price === undefined) return { kind: 'free' };
    const key = packChoiceKey(this.domain, slug);
    const byDefault = isPackInstalled(this.domain, slug, undefined, this.registries);
    try {
      const outcome = await this.spend.spend<Date>({
        userId,
        requestId,
        price,
        kind: 'pack-purchase',
        meta: { domain: this.domain, slug, version: pack.version ?? 1 },
        guard: async () => {
          const owned = await this.prisma.userPackOwnership.findUnique({ where: { userId_packKey: { userId, packKey: key } }, select: { id: true } });
          if (owned !== null) throw new PurchaseRefusal('already-owned');
        },
        apply: async (tx: SpendTx) => {
          await tx.userPackOwnership.create({ data: { userId, packKey: key, priceMeeshes: price, requestId } });
          return (await this.settle(tx, userId, key, true, byDefault)).at;
        },
      });
      if (outcome.status === 'insufficient') return { kind: 'insufficient', balance: outcome.balance };
      if (outcome.status === 'spent' && outcome.result !== undefined) {
        this.broadcast?.(userId, { domain: this.domain, slug, installed: true, owned: true, at: outcome.result.toISOString() });
        return { kind: 'done', pack: this.spec.toSummary(pack.project(true, true)), balance: outcome.balance };
      }
      const installed = this.installedOf(await this.choices(userId))(slug);
      return { kind: 'done', pack: this.spec.toSummary(pack.project(installed, true)), balance: outcome.balance };
    } catch (error) {
      if (error instanceof PurchaseRefusal) return { kind: 'already-owned' };
      throw error;
    }
  }

  /** La loi de possession pour ce lecteur ; sans pack payant dans le domaine, aucune lecture. */
  private async ownedOf(userId: string): Promise<(pack: RegistryPack<D>) => boolean> {
    if (!this.spec.registry.some((pack) => pack.price !== undefined)) return () => true;
    const rows = await this.prisma.userPackOwnership.findMany({ where: { userId }, select: { packKey: true } });
    const keys = new Set(rows.map((row) => row.packKey));
    return (pack) => isPackOwned({ domain: this.domain, slug: pack.slug, price: pack.price }, keys);
  }

  /**
   * Amène la ligne de choix à l'état voulu et rend ce qui a réellement
   * BASCULÉ : +1 / −1 si cet appel a changé l'état, 0 s'il l'était déjà.
   * L'ordre des choix suit `updatedAt` : une écriture le touche toujours, même
   * sans bascule (la boutique servie avant LP0 le faisait par `upsert`).
   */
  private async settle(db: SettleClient, userId: string, key: string, installed: boolean, byDefault: boolean): Promise<{ delta: -1 | 0 | 1; at: Date }> {
    const sign = installed ? 1 : -1;
    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt += 1) {
      const at = this.now();
      const data = { installedAt: installed ? at : null, updatedAt: at };
      const flipped = await db.userStickerPack.updateMany({ where: { userId, packSlug: key, ...stateFilter(!installed) }, data });
      if (flipped.count > 0) return { delta: sign, at };
      const already = await db.userStickerPack.updateMany({ where: { userId, packSlug: key, ...stateFilter(installed) }, data: { updatedAt: at } });
      if (already.count > 0) return { delta: 0, at };
      try {
        await db.userStickerPack.create({ data: { userId, packSlug: key, ...data } });
        return { delta: installed === byDefault ? 0 : sign, at };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    throw new Error(`Pack installation did not settle after ${MAX_SETTLE_ATTEMPTS} attempts (${key})`);
  }

  private async isInstalledNow(userId: string, pack: RegistryPack<D>): Promise<boolean> {
    const row = await this.prisma.userStickerPack.findUnique({
      where: { userId_packSlug: { userId, packSlug: packChoiceKey(this.domain, pack.slug) } },
    });
    return row === null ? pack.installedByDefault : row.installedAt !== null;
  }

  private registryPack(slug: string): RegistryPack<D> | undefined {
    return this.spec.registry.find((pack) => pack.slug === slug);
  }

  private installedOf(choices: Choices): (slug: string) => boolean {
    return (slug) => isPackInstalled(this.domain, slug, choices.get(slug), this.registries);
  }

  /** Les choix de l'utilisateur DANS CE DOMAINE, par slug, dans l'ordre de leur dernière écriture. */
  private async choices(userId: string): Promise<Choices> {
    const rows = await this.prisma.userStickerPack.findMany({ where: { userId }, orderBy: { updatedAt: 'asc' } });
    return new Map(
      rows.flatMap((row) => {
        const parsed = parsePackChoiceKey(row.packSlug);
        return parsed !== null && parsed.domain === this.domain ? [[parsed.slug, { installed: row.installedAt !== null }] as const] : [];
      }),
    );
  }
}
