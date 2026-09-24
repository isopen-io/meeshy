import { isEngagementProgressPayload, type EngagementProgressPayload } from '@meeshy/shared/types/engagement';
import { resolveEngagementProgress, type EngagementProgress } from '@meeshy/shared/utils/engagement-progress';

import type { DataSource } from './config';
import { ENGAGEMENT_PROGRESS_FIXTURE } from './engagement-fixture';
import type { ApiResult, HttpTransport } from './http';

/**
 * LE PORT DE LA PROGRESSION (#5547) — `GET /api/v1/me/engagement`
 * (`services/gateway/src/routes/me/engagement.ts`, #5670) : compteurs par
 * axe, paliers déjà gravés, série et score de l'utilisateur AUTHENTIFIÉ.
 * Lecture seule, le verbe fait partie du contrat (`net/transport.ts`).
 *
 * LA CHARGE EST VALIDÉE À LA FRONTIÈRE, jamais crue sur parole : le transport
 * rend `envelope.data as T` sans regarder dedans (`http.ts`), donc un
 * déploiement de passerelle qui changerait la forme arriverait ici en
 * `unknown` déguisé. `isEngagementProgressPayload` (la garde écrite avec le
 * type, `@meeshy/shared/types/engagement`) refuse une charge malformée
 * ENTIÈRE — code `MALFORMED_PAYLOAD`, distinct d'une panne réseau — plutôt
 * que de peindre un niveau depuis un score en chaîne.
 *
 * `loadEngagementProgress` rend la progression RÉSOLUE (la loi partagée,
 * `resolveEngagementProgress`), depuis la source déclarée à la construction :
 * `'fixtures'` sert la fixture sans toucher au réseau — c'est ce qui laisse le
 * POC, ses captures et `bun test` sans passerelle ; `'gateway'` parle au
 * transport. C'est le PREMIER écran qui lit `apiConfig.source` au lieu
 * d'importer les fixtures en direct (`vite.config.ts` § garde
 * `VITE_DATA_SOURCE`) — la garde y reste tant que la liste et le fil ne le
 * font pas aussi.
 */
export const ENGAGEMENT_PROGRESS_PATH = '/api/v1/me/engagement';

export const ENGAGEMENT_PROGRESS_QUERY_KEY = ['me', 'engagement'] as const;

export async function fetchEngagementProgress(
  transport: HttpTransport,
  signal?: AbortSignal,
): Promise<ApiResult<EngagementProgressPayload>> {
  const result = await transport.request<unknown>({
    method: 'GET',
    path: ENGAGEMENT_PROGRESS_PATH,
    ...(signal !== undefined ? { signal } : {}),
  });
  if (!result.ok) return result;
  if (!isEngagementProgressPayload(result.data)) {
    return {
      ok: false,
      status: 502,
      error: 'La progression servie est illisible — forme inattendue',
      code: 'MALFORMED_PAYLOAD',
    };
  }
  return { ok: true, data: result.data };
}

export async function loadEngagementProgress(params: {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly signal?: AbortSignal;
}): Promise<ApiResult<EngagementProgress>> {
  if (params.source === 'fixtures') {
    return { ok: true, data: resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE) };
  }
  const result = await fetchEngagementProgress(params.transport, params.signal);
  return result.ok ? { ok: true, data: resolveEngagementProgress(result.data) } : result;
}

/**
 * LA FRAPPE D'UNE MEESH — `POST /api/v1/me/meesh/mint` (#5743).
 *
 * `requestId` est fourni par l'APPELANT et porte l'idempotence : un double-tap,
 * un retry réseau ou une reprise d'onglet ne frappent qu'une fois. Il est donc
 * généré UNE fois par intention de frappe, pas une fois par requête — sans quoi
 * le retry deviendrait une seconde frappe, ce que l'identifiant est justement
 * là pour empêcher.
 */
export const MEESH_MINT_PATH = '/api/v1/me/meesh/mint';

export type MeeshMintResult = {
  readonly status: 'minted' | 'already-minted' | 'insufficient';
  readonly balance?: number;
  readonly mintedLifetime?: number;
};

export async function mintMeesh(
  transport: HttpTransport,
  requestId: string,
  signal?: AbortSignal,
): Promise<ApiResult<MeeshMintResult>> {
  return transport.request<MeeshMintResult>({
    method: 'POST',
    path: MEESH_MINT_PATH,
    body: { requestId },
    ...(signal !== undefined ? { signal } : {}),
  });
}
