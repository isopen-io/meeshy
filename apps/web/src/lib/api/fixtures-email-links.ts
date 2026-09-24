import type { TrackingClick, TrackingResolution } from '@/lib/links/tracking-redirect';

import type { DeletionAction, DeletionLink, DeletionResolution } from './account-deletion';
import type { EmailChangeResult } from './email-change';
import type { ApiFailure, ApiResult } from './http';

/**
 * **LE CORPUS DE RECETTE DES LIENS REÇUS** (#6714, #6715) — ce que servent les
 * ports `tracking-links.ts`, `account-deletion.ts`, `email-change.ts` et
 * `email-notifications.ts` sous la source `fixtures` (garde
 * `__FIXTURES__ && source === 'fixtures'`), chargé en `import()` et élagué des
 * builds `VITE_DATA_SOURCE=gateway`.
 *
 * Un seul lien suivi existe : `/l/demo-link`. Tout autre jeton est inconnu,
 * pour que la recette voie les DEUX issues sans réseau.
 */

export const FIXTURE_TRACKING_TOKEN = 'demo-link';

const FIXTURE_TARGET = 'https://meeshy.me/';

const UNKNOWN_LINK: ApiFailure = { ok: false, status: 404, error: 'Lien de tracking non trouvé' };

export const fixtureTrackingClick = (token: string): ApiResult<TrackingClick> =>
  token === FIXTURE_TRACKING_TOKEN ? { ok: true, data: { originalUrl: FIXTURE_TARGET } } : UNKNOWN_LINK;

export const fixtureTrackingResolution = (token: string): ApiResult<TrackingResolution> =>
  token === FIXTURE_TRACKING_TOKEN ? { ok: true, data: { kind: 'tracking', originalUrl: FIXTURE_TARGET, isActive: true } } : UNKNOWN_LINK;

const DELETION_RESOLUTIONS: Readonly<Record<DeletionAction, DeletionResolution>> = {
  confirm: { status: 'CONFIRMED', gracePeriodEndsAt: '2026-10-15T10:00:00.000Z', dataPurged: false },
  cancel: { status: 'CANCELLED', gracePeriodEndsAt: null, dataPurged: false },
  purge: { status: 'COMPLETED', gracePeriodEndsAt: null, dataPurged: true },
};

export const fixtureDeletionResolution = (link: DeletionLink): ApiResult<DeletionResolution> => ({
  ok: true,
  data: DELETION_RESOLUTIONS[link.action],
});

export const fixtureDeletionRequest = (): ApiResult<null> => ({ ok: true, data: null });

export const fixtureEmailChange = (): ApiResult<EmailChangeResult> => ({ ok: true, data: { email: 'awa@meeshy.example' } });

export const fixtureEmailNotifications = (): ApiResult<boolean> => ({ ok: true, data: true });

export const fixtureSaveEmailNotifications = (enabled: boolean): ApiResult<boolean> => ({ ok: true, data: enabled });
