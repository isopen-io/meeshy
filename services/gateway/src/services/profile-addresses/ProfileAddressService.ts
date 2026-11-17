/**
 * Les adresses personnelles d'une fiche (#18863) : écriture du propriétaire, lecture avec clics.
 *
 * Le compteur n'a pas de modèle propre : une adresse « qui compte » possède SON `TrackingLink`
 * (`/l/<token>`), marqué de son identifiant, jamais partagé avec un autre contenu. Le jeton
 * TOURNE (ancien lien et ses clics effacés) quand l'URL change ou que le cercle se resserre :
 * un `/l/<jeton>` déjà diffusé ne doit ouvrir ni une autre URL, ni un public plus large que
 * celui qui l'a reçu. Une adresse masquée DÉSACTIVE son lien ; supprimée, ou qui cesse de
 * compter, elle EFFACE son lien et ses clics. Aucune règle de lecture par cercle ici — elle vit
 * dans `@meeshy/shared/utils/profile-addresses`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidObjectId } from '@meeshy/shared/utils/object-id';
import { relationLevelIfAtLeast } from '@meeshy/shared/types/relation';
import {
  ADDRESS_MAX_COUNT,
  DEFAULT_ADDRESS_GLYPH,
  isAddressCircle,
  isAddressGlyph,
  normalizeAddressTitle,
  normalizeAddressUrl,
} from '@meeshy/shared/utils/profile-addresses';
import { TrackingTargetCarriesEmailSecretError, isServableTrackingTarget } from '../tracking-link-target';
import { TrackingLinkService } from '../TrackingLinkService';
import { eraseAddressLinks, eraseLinksOfAddress, leadsTo, ownedAddressLinks, type AddressLink } from './address-links';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ProfileAddressService' });

export type AddressInput = {
  readonly url?: unknown;
  readonly title?: unknown;
  readonly glyph?: unknown;
  readonly circle?: unknown;
  readonly isShown?: boolean;
  readonly countClicks?: boolean;
};

export type OwnerAddress = {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly glyph: string;
  readonly circle: string;
  readonly position: number;
  readonly isShown: boolean;
  readonly clicks: number;
  readonly trackedPath?: string;
};

export type Refusal = { readonly status: 400 | 404 | 409; readonly code: string; readonly error: string };
export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: Refusal };

const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });
const refuse = (status: Refusal['status'], code: string, error: string): Outcome<never> => ({ ok: false, refusal: { status, code, error } });

type Row = {
  id: string;
  title: string;
  url: string;
  glyph: string;
  circle: string;
  position: number;
  isShown: boolean;
  trackingToken: string | null;
};

type Fields = { url: string; title: string; glyph: string; circle: string };

const validated = (input: AddressInput, base?: Fields): Outcome<Fields> => {
  const url = input.url === undefined && base ? base.url : normalizeAddressUrl(typeof input.url === 'string' ? input.url : null);
  if (url === null) return refuse(400, 'INVALID_ADDRESS_URL', 'The address must be a public http(s) site');
  const title = input.title === undefined && base ? base.title : normalizeAddressTitle(typeof input.title === 'string' ? input.title : null);
  if (title === null) return refuse(400, 'INVALID_ADDRESS_TITLE', 'The title must be 1 to 24 plain characters');
  const glyph = input.glyph === undefined ? (base?.glyph ?? DEFAULT_ADDRESS_GLYPH) : input.glyph;
  if (!isAddressGlyph(glyph)) return refuse(400, 'INVALID_ADDRESS_GLYPH', 'Unknown glyph');
  const circle = input.circle === undefined && base ? base.circle : input.circle;
  if (!isAddressCircle(circle)) return refuse(400, 'INVALID_ADDRESS_CIRCLE', 'Unknown circle');
  return ok({ url, title, glyph, circle });
};

const notFound = (): Outcome<never> => refuse(404, 'ADDRESS_NOT_FOUND', 'Address not found');
const untrackable = (): Outcome<never> => refuse(400, 'INVALID_ADDRESS_URL', 'This address cannot be tracked');

/** Le nouveau cercle écarte-t-il des lecteurs que l'ancien admettait ? Ils peuvent tenir le jeton : il tourne. */
const narrows = (from: string, to: string): boolean => isAddressCircle(from) && isAddressCircle(to) && relationLevelIfAtLeast(from, to) === null;

const toOwner = (row: Row, links: ReadonlyMap<string, AddressLink>): OwnerAddress => {
  const link = row.trackingToken ? links.get(row.trackingToken) : undefined;
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    glyph: row.glyph,
    circle: row.circle,
    position: row.position,
    isShown: row.isShown,
    clicks: link?.totalClicks ?? 0,
    ...(leadsTo(link, row.url) && row.trackingToken ? { trackedPath: `/l/${row.trackingToken}` } : {}),
  };
};

export class ProfileAddressService {
  private readonly links: TrackingLinkService;

  constructor(private readonly prisma: PrismaClient) {
    this.links = new TrackingLinkService(prisma);
  }

  private rows(userId: string): Promise<Row[]> {
    return this.prisma.profileAddress.findMany({ where: { userId }, orderBy: { position: 'asc' }, take: ADDRESS_MAX_COUNT }) as Promise<Row[]>;
  }

  private linksOf(userId: string, rows: ReadonlyArray<Row>): Promise<ReadonlyMap<string, AddressLink>> {
    return ownedAddressLinks(this.prisma, userId, rows);
  }

  /** Le lien de l'adresse s'il désigne encore un lien de son propriétaire (supprimé, renommé ou repris ⇒ `null`). */
  private async ownedLink(userId: string, row: Row): Promise<{ token: string; link: AddressLink } | null> {
    if (!row.trackingToken) return null;
    const link = (await this.linksOf(userId, [row])).get(row.trackingToken);
    return link ? { token: row.trackingToken, link } : null;
  }

  private async viewsOf(userId: string, rows: ReadonlyArray<Row>): Promise<OwnerAddress[]> {
    const links = await this.linksOf(userId, rows);
    return rows.map((row) => toOwner(row, links));
  }

  private async setLinkActive(token: string, isActive: boolean): Promise<void> {
    await this.links.updateTrackingLink({ token, isActive });
  }

  /** Le lien DÉDIÉ de cette adresse, fermé d'emblée si elle est masquée. */
  private async openLink(userId: string, addressId: string, fields: Fields, isShown: boolean): Promise<string> {
    const link = await this.links.createTrackingLink({ originalUrl: fields.url, name: fields.title, createdBy: userId, addressId });
    if (!isShown) await this.setLinkActive(link.token, false);
    return link.token;
  }

  /** La ligne n'est gardée que si elle est parmi les douze premières créées : le plafond tient sous la concurrence. */
  private async withinLimit(userId: string, id: string): Promise<boolean> {
    const kept = await this.prisma.profileAddress.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: ADDRESS_MAX_COUNT,
      select: { id: true },
    });
    return kept.some((row) => row.id === id);
  }

  async list(userId: string): Promise<OwnerAddress[]> {
    return this.viewsOf(userId, await this.rows(userId));
  }

  async create(userId: string, input: AddressInput): Promise<Outcome<OwnerAddress>> {
    const fields = validated(input);
    if (fields.ok === false) return fields;
    const counts = input.countClicks !== false;
    if (counts && !isServableTrackingTarget(fields.value.url)) return untrackable();
    const existing = await this.rows(userId);
    if (existing.length >= ADDRESS_MAX_COUNT) return refuse(409, 'ADDRESS_LIMIT_REACHED', 'Too many addresses');
    const isShown = input.isShown ?? true;
    const position = existing.reduce((max, row) => Math.max(max, row.position + 1), 0);
    const created = (await this.prisma.profileAddress.create({
      data: { userId, ...fields.value, position, isShown, trackingToken: null },
    })) as Row;
    if (!(await this.withinLimit(userId, created.id))) {
      await this.prisma.profileAddress.delete({ where: { id: created.id } });
      return refuse(409, 'ADDRESS_LIMIT_REACHED', 'Too many addresses');
    }
    if (!counts) return ok(toOwner(created, new Map()));
    try {
      const trackingToken = await this.openLink(userId, created.id, fields.value, isShown);
      const row = (await this.prisma.profileAddress.update({ where: { id: created.id }, data: { trackingToken } })) as Row;
      return ok(toOwner(row, new Map([[trackingToken, { totalClicks: 0, isOpen: isShown, target: fields.value.url }]])));
    } catch (error) {
      await this.prisma.profileAddress.delete({ where: { id: created.id } });
      if (error instanceof TrackingTargetCarriesEmailSecretError) return untrackable();
      throw error;
    }
  }

  private async mine(userId: string, id: string): Promise<Row | null> {
    if (!isValidObjectId(id)) return null;
    return (await this.prisma.profileAddress.findFirst({ where: { id, userId } })) as Row | null;
  }

  async update(userId: string, id: string, input: AddressInput): Promise<Outcome<OwnerAddress>> {
    const current = await this.mine(userId, id);
    if (!current) return notFound();
    const fields = validated(input, current);
    if (fields.ok === false) return fields;
    const tracked = input.countClicks === true || (input.countClicks !== false && current.trackingToken !== null);
    if (tracked && !isServableTrackingTarget(fields.value.url)) return untrackable();
    const isShown = input.isShown ?? current.isShown;
    try {
      const trackingToken = await this.reconcileLink(userId, current, fields.value, isShown, input.countClicks);
      const row = (await this.prisma.profileAddress.update({
        where: { id },
        data: { ...fields.value, isShown, trackingToken },
      })) as Row;
      return ok((await this.viewsOf(userId, [row]))[0]);
    } catch (error) {
      if (error instanceof TrackingTargetCarriesEmailSecretError) return untrackable();
      throw error;
    }
  }

  /**
   * Le jeton du lien de suivi après modification : ouvert, gardé, renommé, rouvert, fermé,
   * TOURNÉ (URL changée, cercle resserré, lien dévié hors de l'adresse) ou détaché.
   */
  private async reconcileLink(userId: string, current: Row, next: Fields, isShown: boolean, countClicks: boolean | undefined): Promise<string | null> {
    const owned = await this.ownedLink(userId, current);
    if (countClicks === false || (owned === null && countClicks !== true)) {
      if (owned) await eraseAddressLinks(this.prisma, userId, [owned.token]);
      return null;
    }
    const rotates = owned === null || next.url !== current.url || !leadsTo(owned.link, next.url) || narrows(current.circle, next.circle);
    if (rotates) {
      if (owned) await eraseAddressLinks(this.prisma, userId, [owned.token]);
      return this.openLink(userId, current.id, next, isShown);
    }
    if (next.title !== current.title) await this.links.updateTrackingLink({ token: owned.token, name: next.title });
    if (isShown !== current.isShown) await this.setLinkActive(owned.token, isShown);
    return owned.token;
  }

  async remove(userId: string, id: string): Promise<Outcome<null>> {
    const current = await this.mine(userId, id);
    if (!current) return notFound();
    await eraseLinksOfAddress(this.prisma, userId, current.id);
    await this.prisma.profileAddress.delete({ where: { id } });
    return ok(null);
  }

  async reorder(userId: string, ids: ReadonlyArray<string>): Promise<Outcome<OwnerAddress[]>> {
    const existing = await this.rows(userId);
    const known = new Set(existing.map((row) => row.id));
    const exact = ids.length === known.size && new Set(ids).size === ids.length && ids.every((id) => known.has(id));
    if (!exact) return refuse(400, 'INVALID_ADDRESS_ORDER', 'The order must list every address exactly once');
    await this.prisma.$transaction(ids.map((id, position) => this.prisma.profileAddress.update({ where: { id }, data: { position } })));
    logger.info('profile addresses reordered', { userId, count: ids.length });
    return ok(await this.list(userId));
  }
}
