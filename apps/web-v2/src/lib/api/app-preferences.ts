import * as z from 'zod/mini';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES RÉGLAGES D'USAGE** (#5563) — `GET`/`PATCH /api/v1/me/preferences`,
 * les routes unifiées de #4181 (`services/gateway/src/routes/me/preferences/
 * unified-routes.ts`). Miroir `UserPreferencesManager` (iOS), limité à ce que
 * l'écran montre.
 *
 * **Un réglage n'entre ici que si la passerelle l'OBÉIT** (loi 4 : un contrôle
 * existe s'il a un effet) :
 *  - `application.theme` — relu par iOS à chaque synchronisation
 *    (`ThemeManager.observeRemoteThemeSync`) ;
 *  - `notification.pushEnabled` / `soundEnabled` — la porte et la sourdine de
 *    `PushNotificationService` (`shouldSendPush`, `muted`) ;
 *  - `privacy.showOnlineStatus` / `showLastSeen` — `PresenceVisibilityService`
 *    et l'audience de `user:status` (`socketio/presence-audience.ts`) ;
 *  - `privacy.showReadReceipts` — `MessageReadStatusService`,
 *    `MeeshySocketIOManager` ;
 *  - `privacy.showTypingIndicator` — `PrivacyPreferencesService`.
 * Les vibrations (aucun lecteur serveur, aucun effet web) et le téléchargement
 * automatique des médias (#5563, issue dédiée) n'y sont PAS.
 *
 * **La lecture est une PROJECTION** : `?fields=` ne demande que ces sept
 * valeurs, et le décodeur n'en laisse entrer aucune autre — le cache de
 * requêtes est persisté dans le `localStorage` (`query-client.ts`). Une valeur
 * de mauvais type rend la lecture ILLISIBLE plutôt qu'une valeur devinée : une
 * bascule de confidentialité affichée à tort « désactivée » ferait croire au
 * lecteur qu'il est caché quand il ne l'est pas.
 */

export const APP_PREFERENCES_QUERY_KEY = ['me', 'app-preferences'] as const;

export type AppPreferencesDeps = { readonly source: DataSource; readonly transport: HttpTransport };

const ThemeMode = z.enum(['light', 'dark', 'auto']);

const Application = z.object({ theme: ThemeMode });
const Notification = z.object({ pushEnabled: z.boolean(), soundEnabled: z.boolean() });
const Privacy = z.object({
  showOnlineStatus: z.boolean(),
  showLastSeen: z.boolean(),
  showReadReceipts: z.boolean(),
  showTypingIndicator: z.boolean(),
});

const Complete = z.object({ application: Application, notification: Notification, privacy: Privacy });
const Served = z.object({
  application: z.optional(Application),
  notification: z.optional(Notification),
  privacy: z.optional(Privacy),
});

export type ThemeMode = z.infer<typeof ThemeMode>;

export type AppPreferences = Readonly<
  z.infer<typeof Application> & z.infer<typeof Notification> & z.infer<typeof Privacy>
>;

export type PreferencesPatch = Partial<AppPreferences>;

export type PreferenceCategory = 'application' | 'notification' | 'privacy';

/** Chaque réglage, et la catégorie de la passerelle qui le range. */
export const APP_PREFERENCE_FIELDS = {
  theme: 'application',
  pushEnabled: 'notification',
  soundEnabled: 'notification',
  showOnlineStatus: 'privacy',
  showLastSeen: 'privacy',
  showReadReceipts: 'privacy',
  showTypingIndicator: 'privacy',
} as const satisfies Readonly<Record<keyof AppPreferences, PreferenceCategory>>;

type PreferenceKey = keyof typeof APP_PREFERENCE_FIELDS;

const PREFERENCE_KEYS = Object.keys(APP_PREFERENCE_FIELDS) as readonly PreferenceKey[];

const FIELDS_QUERY = PREFERENCE_KEYS.map((key) => `${APP_PREFERENCE_FIELDS[key]}.${key}`).join(',');

export function decodeAppPreferences(raw: unknown): AppPreferences | null {
  const parsed = Complete.safeParse(raw);
  if (!parsed.success) return null;
  return { ...parsed.data.application, ...parsed.data.notification, ...parsed.data.privacy };
}

export function decodeServedPreferences(raw: unknown): PreferencesPatch | null {
  const parsed = Served.safeParse(raw);
  if (!parsed.success) return null;
  return { ...parsed.data.application, ...parsed.data.notification, ...parsed.data.privacy };
}

export type PreferencesPatchBody = Partial<Record<PreferenceCategory, Readonly<Record<string, boolean | ThemeMode>>>>;

export function preferencesPatchBody(patch: PreferencesPatch): PreferencesPatchBody {
  return PREFERENCE_KEYS.reduce<PreferencesPatchBody>((body, key) => {
    const value = patch[key];
    if (value === undefined) return body;
    const category = APP_PREFERENCE_FIELDS[key];
    return { ...body, [category]: { ...body[category], [key]: value } };
  }, {});
}

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadAppPreferences(
  params: AppPreferencesDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<AppPreferences>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureAppPreferences } = await import('./fixtures-app-preferences');
    return { ok: true, data: fixtureAppPreferences() };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/me/preferences?fields=${FIELDS_QUERY}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const preferences = decodeAppPreferences(result.data);
  return preferences === null ? { ok: false, status: 0, error: 'Réglages illisibles' } : { ok: true, data: preferences };
}

export async function patchAppPreferences(deps: AppPreferencesDeps, patch: PreferencesPatch): Promise<ApiResult<PreferencesPatch>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixturePatchAppPreferences } = await import('./fixtures-app-preferences');
    return { ok: true, data: fixturePatchAppPreferences(patch) };
  }
  const result = await deps.transport.request<unknown>({
    method: 'PATCH',
    path: '/api/v1/me/preferences',
    body: preferencesPatchBody(patch),
  });
  if (!result.ok) return result;
  const served = decodeServedPreferences(result.data);
  return served === null ? { ok: false, status: 0, error: 'Réglages illisibles' } : { ok: true, data: served };
}

export function appPreferencesQueryOptions(deps: AppPreferencesDeps) {
  return {
    queryKey: APP_PREFERENCES_QUERY_KEY,
    queryFn: async ({ signal }: { readonly signal?: AbortSignal }) =>
      unwrap(await loadAppPreferences({ ...deps, ...withSignal(signal) })),
  };
}
