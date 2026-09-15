import * as z from 'zod/mini';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';
import { reachFailureOf, unreadableFailure, type ReachFailure } from './link-failure';

/**
 * **LE PORT DU DÉSABONNEMENT DES E-MAILS** (#6715) — `notification.emailEnabled`,
 * lu et écrit par les routes unifiées `GET`/`PATCH /api/v1/me/preferences`
 * (`routes/me/preferences/unified-routes.ts`, sous session).
 *
 * **Pourquoi ce réglage et aucun autre** : c'est le SEUL que lisent la
 * diffusion dont l'e-mail porte le lien de désabonnement
 * (`jobs/broadcast-sender.ts`, `unsubscribeUrl = /settings/notifications`), le
 * digest (`jobs/notification-digest.ts`) et les e-mails de notification
 * (`NotificationService`). Les alertes de sécurité et de connexion partent
 * sans le consulter.
 *
 * **Un port à part, pas une huitième clé de `app-preferences.ts`.** Ce port-là
 * alimente un cache PERSISTÉ dont le décodeur exige ses sept valeurs : y
 * ajouter une clé rendrait illisible chaque cache déjà écrit sur un appareil,
 * pour un réglage que l'écran des réglages ne montre pas.
 */

export type EmailNotificationsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

const Served = z.object({ notification: z.object({ emailEnabled: z.boolean() }) });

const servedValue = (raw: unknown): ApiResult<boolean> => {
  const parsed = Served.safeParse(raw);
  return parsed.success ? { ok: true, data: parsed.data.notification.emailEnabled } : unreadableFailure('Préférence e-mail');
};

export async function loadEmailNotifications(deps: EmailNotificationsDeps): Promise<ApiResult<boolean>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureEmailNotifications } = await import('./fixtures-email-links');
    return fixtureEmailNotifications();
  }
  const result = await deps.transport.request<unknown>({ method: 'GET', path: '/api/v1/me/preferences?fields=notification.emailEnabled' });
  return result.ok ? servedValue(result.data) : result;
}

export async function saveEmailNotifications(deps: EmailNotificationsDeps, enabled: boolean): Promise<ApiResult<boolean>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureSaveEmailNotifications } = await import('./fixtures-email-links');
    return fixtureSaveEmailNotifications(enabled);
  }
  const result = await deps.transport.request<unknown>({
    method: 'PATCH',
    path: '/api/v1/me/preferences',
    body: { notification: { emailEnabled: enabled } },
  });
  return result.ok ? servedValue(result.data) : result;
}

export type EmailNotificationsFailure = 'signed-out' | ReachFailure;

export function emailNotificationsFailureOf(failure: ApiFailure): EmailNotificationsFailure {
  return failure.status === 401 ? 'signed-out' : reachFailureOf(failure);
}
