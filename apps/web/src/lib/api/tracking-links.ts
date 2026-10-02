import * as trackingLinksEndpoints from '@meeshy/shared/api/endpoints/tracking-links';
import * as z from 'zod/mini';

import type { ClickContext } from '@/lib/links/click-context';
import type { SharedContent, SharedContentType, TrackingClick, TrackingResolution } from '@/lib/links/tracking-redirect';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { unreadableFailure } from './link-failure';

/**
 * **LE PORT DES LIENS SUIVIS** (#6714) — les deux routes PUBLIQUES que la page
 * legacy `/l/:token` appelait (`authOptional` côté passerelle) :
 *
 * - `POST trackingLinks.byTokenClick` (`routes/tracking-links/tracking.ts`)
 *   compte le clic et rend `originalUrl` ; 404 lien inconnu, 410
 *   `LINK_INACTIVE` / `LINK_EXPIRED` ;
 * - `GET trackingLinks.byTokenResolve` (`creation.ts`) rend la nature
 *   du lien (`tracking` ou, en repli, une invitation `conversation`) et son
 *   état `isActive`, expiration comprise.
 *
 * **Le port ne lit que ce que la page décide avec** — la cible, la nature,
 * l'état. `clickId`, le lien complet et la cible typée ne passent pas : aucune
 * décision ne les consulte, et un champ lu sans lecteur est une promesse que
 * personne ne tient.
 *
 * Le clic part par le transport PARTAGÉ, donc avec la session du lecteur s'il
 * en a une : la passerelle attribue alors le clic au compte, comme elle le
 * fait pour iOS. La liste des clics que voit le propriétaire d'un lien
 * (`trackingLinkUserClicksResponseSchema`) ne porte aucune identité.
 */

export type TrackingLinksDeps = { readonly source: DataSource; readonly transport: HttpTransport };

const ServedClick = z.object({ originalUrl: z.optional(z.nullable(z.string())) });

const ServedResolution = z.object({
  kind: z.enum(['tracking', 'conversation']),
  originalUrl: z.optional(z.nullable(z.string())),
  isActive: z.boolean(),
  targetType: z.optional(z.nullable(z.string())),
  targetId: z.optional(z.nullable(z.string())),
});

const SHARED_CONTENT_TYPES: ReadonlySet<string> = new Set<SharedContentType>(['POST', 'REEL', 'STORY', 'STATUS']);

const isSharedContentType = (type: string): type is SharedContentType => SHARED_CONTENT_TYPES.has(type);

/** La cible TYPÉE d'un partage de contenu (#9149) — `null` pour une adresse
 * externe, une invitation, un profil, ou une cible sans identifiant. */
function sharedContentOf(targetType: string | null | undefined, targetId: string | null | undefined): SharedContent | null {
  if (typeof targetType !== 'string' || typeof targetId !== 'string' || targetId === '') return null;
  return isSharedContentType(targetType) ? { type: targetType, id: targetId } : null;
}

/**
 * **QUI A PARTAGÉ** (#9149) — trois champs, que la passerelle ne remplit que
 * pour le partage d'un CONTENU par un compte actif
 * (`routes/tracking-links/link-sharer.ts`). Une forme illisible vaut
 * « personne » : l'invitation se dit alors sans nom, jamais avec un nom deviné.
 */
const ServedSharer = z.object({
  displayName: z.optional(z.nullable(z.string())),
  username: z.string(),
  avatar: z.optional(z.nullable(z.string())),
});

const ServedSharerEnvelope = z.object({ sharer: z.optional(z.unknown()) });

export type LinkSharer = { readonly displayName: string | null; readonly username: string; readonly avatar: string | null };

export async function recordTrackingClick(deps: TrackingLinksDeps, token: string, context: ClickContext): Promise<ApiResult<TrackingClick>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureTrackingClick } = await import('./fixtures-email-links');
    return fixtureTrackingClick(token);
  }
  const result = await deps.transport.request<unknown>({ method: 'POST', path: trackingLinksEndpoints.byTokenClick(token), body: context });
  if (!result.ok) return result;
  const parsed = ServedClick.safeParse(result.data);
  return { ok: true, data: { originalUrl: parsed.success ? (parsed.data.originalUrl ?? null) : null } };
}

export async function resolveTrackingLink(deps: TrackingLinksDeps, token: string): Promise<ApiResult<TrackingResolution>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureTrackingResolution } = await import('./fixtures-email-links');
    return fixtureTrackingResolution(token);
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: trackingLinksEndpoints.byTokenResolve(token) });
  if (!result.ok) return result;
  const parsed = ServedResolution.safeParse(result.data);
  if (!parsed.success) return unreadableFailure('Lien suivi');
  return {
    ok: true,
    data: {
      kind: parsed.data.kind,
      originalUrl: parsed.data.originalUrl ?? null,
      isActive: parsed.data.isActive,
      content: parsed.data.kind === 'tracking' ? sharedContentOf(parsed.data.targetType, parsed.data.targetId) : null,
    },
  };
}

export async function resolveLinkSharer(deps: TrackingLinksDeps, token: string): Promise<ApiResult<LinkSharer | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: null };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: trackingLinksEndpoints.byTokenResolve(token) });
  if (!result.ok) return result;
  const envelope = ServedSharerEnvelope.safeParse(result.data);
  const sharer = envelope.success ? ServedSharer.safeParse(envelope.data.sharer) : null;
  if (sharer === null || !sharer.success) return { ok: true, data: null };
  return { ok: true, data: { displayName: sharer.data.displayName ?? null, username: sharer.data.username, avatar: sharer.data.avatar ?? null } };
}
