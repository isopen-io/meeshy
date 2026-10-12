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
  packChoiceKey,
  parsePackChoiceKey,
  type PackDomain,
  type PackRegistries,
} from '@meeshy/shared/types/content-pack';
import type { PackInstallationUpdatedEventData } from '@meeshy/shared/types/socketio-events';

export type PackViewer = { readonly userId: string; readonly canModerate: boolean };

/** Un pack du registre d'un domaine : intégré ou officiel, servi sans ligne de pack en base. */
export type RegistryPack<D> = {
  readonly slug: string;
  readonly installedByDefault: boolean;
  readonly removable: boolean;
  /** Masqué : absent de la boutique, ni installable s'il ne l'est pas déjà ; servi en LECTURE (une photo gardée se reprend). */
  readonly hidden: boolean;
  readonly project: (installed: boolean) => D;
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
  | { readonly kind: 'not-removable' };

export type PackInstallationBroadcast = (userId: string, event: PackInstallationUpdatedEventData) => void;

export type PackCatalogDeps<S, D extends S> = {
  readonly prisma: PrismaClient;
  readonly spec: PackDomainSpec<S, D>;
  readonly now?: () => Date;
  readonly broadcast?: PackInstallationBroadcast;
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

  constructor(deps: PackCatalogDeps<S, D>) {
    this.prisma = deps.prisma;
    this.spec = deps.spec;
    this.domain = deps.spec.domain;
    this.now = deps.now ?? (() => new Date());
    this.broadcast = deps.broadcast;
    this.registries = { [deps.spec.domain]: deps.spec.registry.map(({ slug, installedByDefault }) => ({ slug, installedByDefault })) };
  }

  /** La boutique : le registre dans l'ordre éditorial (masqués exclus), puis les packs communautaires publiés. */
  async catalogue(userId: string): Promise<readonly S[]> {
    const choices = await this.choices(userId);
    const installedOf = this.installedOf(choices);
    const official = this.spec.registry.filter((pack) => !pack.hidden).map((pack) => this.spec.toSummary(pack.project(installedOf(pack.slug))));
    const community = this.spec.community === null ? [] : await this.spec.community.catalogue(installedOf);
    return [...official, ...community.map(this.spec.toSummary)];
  }

  /** Les packs installés, avec leur contenu : le registre d'abord (masqués compris), puis les communautaires dans l'ordre des choix. */
  async installed(userId: string): Promise<readonly D[]> {
    const choices = await this.choices(userId);
    const installedOf = this.installedOf(choices);
    const official = this.spec.registry.filter((pack) => installedOf(pack.slug)).map((pack) => pack.project(true));
    const chosen = [...choices.entries()].filter(([slug, choice]) => choice.installed && this.registryPack(slug) === undefined).map(([slug]) => slug);
    if (chosen.length === 0 || this.spec.community === null) return official;
    return [...official, ...(await this.spec.community.installed(chosen))];
  }

  /** Un pack — du registre (masqué compris, en lecture), sinon communautaire et visible de ce lecteur. */
  async detail(slug: string, viewer: PackViewer): Promise<D | null> {
    const choices = await this.choices(viewer.userId);
    const installedOf = this.installedOf(choices);
    const pack = this.registryPack(slug);
    if (pack !== undefined) return pack.project(installedOf(slug));
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
    if (!installed && pack !== undefined && !pack.removable) return { kind: 'not-removable' };
    if (!installed && this.spec.removalGuard !== null && !(await this.spec.removalGuard(userId, slug))) return { kind: 'not-removable' };

    const byDefault = isPackInstalled(this.domain, slug, undefined, this.registries);
    const { delta, at } = await this.settle(userId, packChoiceKey(this.domain, slug), installed, byDefault);
    this.broadcast?.(userId, { domain: this.domain, slug, installed, at: at.toISOString() });

    if (target === null) return { kind: 'done', pack: this.spec.toSummary((pack as RegistryPack<D>).project(installed)) };
    const installCount = delta === 0 ? target.installCount : await (this.spec.community as CommunityPackStore<D>).addInstalls(target.id, delta);
    return { kind: 'done', pack: this.spec.toSummary(target.project(installed, installCount)) };
  }

  /**
   * Amène la ligne de choix à l'état voulu et rend ce qui a réellement
   * BASCULÉ : +1 / −1 si cet appel a changé l'état, 0 s'il l'était déjà.
   * L'ordre des choix suit `updatedAt` : une écriture le touche toujours, même
   * sans bascule (la boutique servie avant LP0 le faisait par `upsert`).
   */
  private async settle(userId: string, key: string, installed: boolean, byDefault: boolean): Promise<{ delta: -1 | 0 | 1; at: Date }> {
    const sign = installed ? 1 : -1;
    for (let attempt = 0; attempt < MAX_SETTLE_ATTEMPTS; attempt += 1) {
      const at = this.now();
      const data = { installedAt: installed ? at : null, updatedAt: at };
      const flipped = await this.prisma.userStickerPack.updateMany({ where: { userId, packSlug: key, ...stateFilter(!installed) }, data });
      if (flipped.count > 0) return { delta: sign, at };
      const already = await this.prisma.userStickerPack.updateMany({ where: { userId, packSlug: key, ...stateFilter(installed) }, data: { updatedAt: at } });
      if (already.count > 0) return { delta: 0, at };
      try {
        await this.prisma.userStickerPack.create({ data: { userId, packSlug: key, ...data } });
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
