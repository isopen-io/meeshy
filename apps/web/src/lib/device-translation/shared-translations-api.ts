import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import type { ShareTranslationBody, SharedTranslation } from '@meeshy/shared/types/shared-translation';

import type { DataSource } from '@/lib/api/config';
import type { ApiResult, HttpRequest } from '@/lib/api/http';
import { outcomeOf } from '@/lib/api/outcome';

/**
 * **LE PORT SERVEUR DES TRADUCTIONS PARTAGÉES** (#9899) — `POST` et
 * `GET conversations.byIdSharedTranslations`
 * (`services/gateway/src/routes/conversations/shared-translations.ts`). Le
 * serveur garde et relaie une enveloppe SCELLÉE qu'il ne lit pas : ce module ne
 * l'ouvre pas non plus, il la porte.
 *
 * Il ne charge ni le scellement ni zod. Le contrat partagé
 * (`@meeshy/shared/types/shared-translation`) y entre en TYPES seulement : la
 * garde de forme est écrite ici à la main, et trois constantes locales
 * (`SHARED_TRANSLATION_REQUEST_LIMITS`, `SHARED_ENVELOPE_*`) sont relues contre
 * le contrat par `shared-translations-api.test.ts`, comme `nllb-codes.test.ts`
 * relit la table du serveur — le validateur complet pèse ~14 Ko gzip de plus que
 * ce que le web tient de zod aujourd'hui, et la garde de forme suffit : ce qui
 * s'ouvre est ensuite validé par le scellement lui-même.
 *
 * Aucune panne ne remonte jusqu'au fil : chaque appel rend une ISSUE, que
 * l'appelant lit pour décider de retenter (`failed`) ou de s'arrêter
 * (`refused`, et `declined` pour tout le compte).
 */
export type SharedTranslationsDeps = {
  readonly source: DataSource;
  readonly transport: { request<T>(request: HttpRequest): Promise<ApiResult<T>> };
};

type Route = (conversationId: string) => string;

/** Les bornes d'UNE requête de lecture — celles que la passerelle fait respecter (`SHARED_TRANSLATION_LIMITS`). */
export const SHARED_TRANSLATION_REQUEST_LIMITS = { messageIds: 100, languages: 8 } as const;

/**
 * Le compte a coupé ses accusés de lecture, et un partage en est un : la
 * passerelle refuse TOUT partage de ce compte, pas cette traduction-là
 * (`SHARED_TRANSLATION_ERROR_CODES.readReceiptsOff`).
 */
export const SHARED_TRANSLATION_READ_RECEIPTS_OFF = 'SHARED_TRANSLATION_READ_RECEIPTS_OFF';

export const SHARED_ENVELOPE_ALGORITHM = 'A256GCM';
export const SHARED_ENVELOPE_KDFS = ['message-content', 'message-secret'] as const;

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isEnvelope = (value: unknown): boolean =>
  isRecord(value) &&
  value.v === 1 &&
  value.alg === SHARED_ENVELOPE_ALGORITHM &&
  (SHARED_ENVELOPE_KDFS as readonly unknown[]).includes(value.kdf) &&
  isText(value.payload);

/** La forme d'une traduction partagée, telle que la passerelle la sert (lecture) et la relaie (`message:translation-shared`). */
export const isSharedTranslation = (value: unknown): value is SharedTranslation =>
  isRecord(value) &&
  isText(value.id) &&
  isText(value.conversationId) &&
  isText(value.messageId) &&
  isText(value.targetLanguage) &&
  isEnvelope(value.envelope) &&
  isText(value.sharedBy) &&
  isText(value.sharedAt);

export type SharedTranslationsOutcome =
  | { readonly status: 'ok'; readonly shares: readonly SharedTranslation[] }
  /** Un refus définitif (4xx, charge illisible) : le redemander ne changerait rien. */
  | { readonly status: 'refused' }
  /** Une panne (réseau, 5xx, limite de débit) : à retenter plus tard. */
  | { readonly status: 'failed' };

const NOTHING_SHARED: SharedTranslationsOutcome = { status: 'ok', shares: [] };

const defaultRoute: Route = (conversationId) => conversationsEndpoints.byIdSharedTranslations(conversationId);

async function requestOrNull<T>(deps: SharedTranslationsDeps, request: HttpRequest): Promise<ApiResult<T> | null> {
  try {
    return await deps.transport.request<T>(request);
  } catch {
    return null;
  }
}

const decodeShares = (data: unknown): readonly SharedTranslation[] | null => {
  if (!isRecord(data) || !Array.isArray(data.sharedTranslations)) return null;
  return data.sharedTranslations.filter(isSharedTranslation);
};

/** Relit les traductions que les autres membres ont partagées pour ces messages, dans ces langues. */
export async function fetchSharedTranslations(params: {
  readonly deps: SharedTranslationsDeps;
  readonly conversationId: string;
  readonly messageIds: readonly string[];
  readonly languages: readonly string[];
  readonly signal?: AbortSignal;
  readonly route?: Route;
}): Promise<SharedTranslationsOutcome> {
  if (__FIXTURES__ && params.deps.source === 'fixtures') return NOTHING_SHARED;
  if (params.messageIds.length === 0) return NOTHING_SHARED;

  const query = new URLSearchParams({ messageIds: params.messageIds.join(',') });
  if (params.languages.length > 0) query.set('languages', params.languages.join(','));
  const result = await requestOrNull<unknown>(params.deps, {
    method: 'GET',
    path: `${(params.route ?? defaultRoute)(params.conversationId)}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });

  if (result === null) return { status: 'failed' };
  if (!result.ok) return outcomeOf(result) === 'permanent' ? { status: 'refused' } : { status: 'failed' };
  const shares = decodeShares(result.data);
  return shares === null ? { status: 'refused' } : { status: 'ok', shares };
}

/** `declined` : le COMPTE ne partage pas (accusés de lecture coupés) — plus aucun partage de la session. */
export type ShareOutcome = 'shared' | 'refused' | 'declined' | 'failed';

/**
 * Partage la traduction de l'appareil. Un autre membre l'avait déjà partagée
 * (`created: false`) : c'est un succès, la sienne fait foi.
 */
export async function postSharedTranslation(params: {
  readonly deps: SharedTranslationsDeps;
  readonly conversationId: string;
  readonly body: ShareTranslationBody;
  readonly route?: Route;
}): Promise<ShareOutcome> {
  if (__FIXTURES__ && params.deps.source === 'fixtures') return 'refused';

  const result = await requestOrNull<unknown>(params.deps, {
    method: 'POST',
    path: (params.route ?? defaultRoute)(params.conversationId),
    body: params.body,
  });

  if (result === null) return 'failed';
  if (result.ok) return 'shared';
  if (result.code === SHARED_TRANSLATION_READ_RECEIPTS_OFF) return 'declined';
  return outcomeOf(result) === 'permanent' ? 'refused' : 'failed';
}
