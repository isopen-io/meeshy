import * as z from 'zod/mini';

import type { ClickContext } from '@/lib/links/click-context';
import type { TrackingClick, TrackingResolution } from '@/lib/links/tracking-redirect';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import { unreadableFailure } from './link-failure';

/**
 * **LE PORT DES LIENS SUIVIS** (#6714) — les deux routes PUBLIQUES que la page
 * legacy `/l/:token` appelait (`authOptional` côté passerelle) :
 *
 * - `POST /api/v1/tracking-links/:token/click` (`routes/tracking-links/tracking.ts`)
 *   compte le clic et rend `originalUrl` ; 404 lien inconnu, 410
 *   `LINK_INACTIVE` / `LINK_EXPIRED` ;
 * - `GET /api/v1/tracking-links/:token/resolve` (`creation.ts`) rend la nature
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
});

const tokenPath = (token: string, leaf: 'click' | 'resolve'): string => `/api/v1/tracking-links/${encodeURIComponent(token)}/${leaf}`;

export async function recordTrackingClick(deps: TrackingLinksDeps, token: string, context: ClickContext): Promise<ApiResult<TrackingClick>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureTrackingClick } = await import('./fixtures-email-links');
    return fixtureTrackingClick(token);
  }
  const result = await deps.transport.request<unknown>({ method: 'POST', path: tokenPath(token, 'click'), body: context });
  if (!result.ok) return result;
  const parsed = ServedClick.safeParse(result.data);
  return { ok: true, data: { originalUrl: parsed.success ? (parsed.data.originalUrl ?? null) : null } };
}

export async function resolveTrackingLink(deps: TrackingLinksDeps, token: string): Promise<ApiResult<TrackingResolution>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureTrackingResolution } = await import('./fixtures-email-links');
    return fixtureTrackingResolution(token);
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: tokenPath(token, 'resolve') });
  if (!result.ok) return result;
  const parsed = ServedResolution.safeParse(result.data);
  if (!parsed.success) return unreadableFailure('Lien suivi');
  return { ok: true, data: { kind: parsed.data.kind, originalUrl: parsed.data.originalUrl ?? null, isActive: parsed.data.isActive } };
}
