/**
 * Les adresses personnelles d'une fiche (#18863) : écriture du propriétaire, lecture avec clics.
 *
 * Le compteur n'a pas de modèle propre : une adresse « qui compte » désigne un `TrackingLink`
 * (`/l/<token>`, le MÊME que « Mes liens »). Une adresse masquée ou supprimée DÉSACTIVE son lien :
 * hors audience, elle n'est ni servie ni comptée. Aucune règle de lecture par cercle ici — elle
 * vit dans `@meeshy/shared/utils/profile-addresses`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import {
  ADDRESS_MAX_COUNT,
  DEFAULT_ADDRESS_GLYPH,
  isAddressCircle,
  isAddressGlyph,
  normalizeAddressTitle,
  normalizeAddressUrl,
} from '@meeshy/shared/utils/profile-addresses';
import { TrackingTargetCarriesEmailSecretError } from '../tracking-link-target';
import { TrackingLinkService } from '../TrackingLinkService';
import { ownedAddressLinks, type AddressLink } from './address-links';
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
    ...(link && row.trackingToken ? { trackedPath: `/l/${row.trackingToken}` } : {}),
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
    return ownedAddressLinks(this.prisma, userId, rows.flatMap((row) => (row.trackingToken ? [row.trackingToken] : [])));
  }

  /** Le jeton de l'adresse s'il désigne encore un lien de son propriétaire (supprimé, renommé ou repris ⇒ `null`). */
  private async ownedToken(userId: string, row: Row): Promise<string | null> {
    return row.trackingToken && (await this.linksOf(userId, [row])).has(row.trackingToken) ? row.trackingToken : null;
  }

  private async viewsOf(userId: string, rows: ReadonlyArray<Row>): Promise<OwnerAddress[]> {
    const links = await this.linksOf(userId, rows);
    return rows.map((row) => toOwner(row, links));
  }

  private async setLinkActive(token: string, isActive: boolean): Promise<void> {
    await this.links.updateTrackingLink({ token, isActive });
  }

  private async openLink(userId: string, fields: Fields): Promise<string> {
    const link = await this.links.createTrackingLink({ originalUrl: fields.url, name: fields.title, createdBy: userId });
    return link.token;
  }

  async list(userId: string): Promise<OwnerAddress[]> {
    return this.viewsOf(userId, await this.rows(userId));
  }

  async create(userId: string, input: AddressInput): Promise<Outcome<OwnerAddress>> {
    const fields = validated(input);
    if (fields.ok === false) return fields;
    const existing = await this.rows(userId);
    if (existing.length >= ADDRESS_MAX_COUNT) return refuse(409, 'ADDRESS_LIMIT_REACHED', 'Too many addresses');
    const isShown = input.isShown ?? true;
    try {
      const trackingToken = input.countClicks === false ? null : await this.openLink(userId, fields.value);
      if (trackingToken && !isShown) await this.setLinkActive(trackingToken, false);
      const position = existing.reduce((max, row) => Math.max(max, row.position + 1), 0);
      const row = (await this.prisma.profileAddress.create({
        data: { userId, ...fields.value, position, isShown, trackingToken },
      })) as Row;
      return ok(toOwner(row, new Map(trackingToken ? [[trackingToken, { totalClicks: 0, isOpen: isShown }]] : [])));
    } catch (error) {
      if (error instanceof TrackingTargetCarriesEmailSecretError) return refuse(400, 'INVALID_ADDRESS_URL', 'This address cannot be tracked');
      throw error;
    }
  }

  async update(userId: string, id: string, input: AddressInput): Promise<Outcome<OwnerAddress>> {
    const current = (await this.prisma.profileAddress.findFirst({ where: { id, userId } })) as Row | null;
    if (!current) return refuse(404, 'ADDRESS_NOT_FOUND', 'Address not found');
    const fields = validated(input, current);
    if (fields.ok === false) return fields;
    const isShown = input.isShown ?? current.isShown;
    try {
      const trackingToken = await this.reconcileLink(userId, current, fields.value, isShown, input.countClicks);
      const row = (await this.prisma.profileAddress.update({
        where: { id },
        data: { ...fields.value, isShown, trackingToken },
      })) as Row;
      return ok((await this.viewsOf(userId, [row]))[0]);
    } catch (error) {
      if (error instanceof TrackingTargetCarriesEmailSecretError) return refuse(400, 'INVALID_ADDRESS_URL', 'This address cannot be tracked');
      throw error;
    }
  }

  /** Le jeton du lien de suivi après modification : ouvert, suivi, rouvert, fermé ou détaché. */
  private async reconcileLink(userId: string, current: Row, next: Fields, isShown: boolean, countClicks: boolean | undefined): Promise<string | null> {
    const token = await this.ownedToken(userId, current);
    if (countClicks === false) {
      if (token) await this.setLinkActive(token, false);
      return null;
    }
    if (!token) {
      if (countClicks !== true) return null;
      const opened = await this.openLink(userId, next);
      if (!isShown) await this.setLinkActive(opened, false);
      return opened;
    }
    if (next.url !== current.url) await this.links.updateTrackingLink({ token, originalUrl: next.url });
    if (isShown !== current.isShown) await this.setLinkActive(token, isShown);
    return token;
  }

  async remove(userId: string, id: string): Promise<Outcome<null>> {
    const current = (await this.prisma.profileAddress.findFirst({ where: { id, userId } })) as Row | null;
    if (!current) return refuse(404, 'ADDRESS_NOT_FOUND', 'Address not found');
    const token = await this.ownedToken(userId, current);
    if (token) await this.setLinkActive(token, false);
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
