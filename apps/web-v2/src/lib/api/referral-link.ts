import * as z from 'zod/mini';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';

/**
 * **LE LIEN DE PARRAINAGE À PARTAGER** (#6707) — ce qu'« Inviter des amis »
 * met dans la feuille de partage. Le legacy, iOS et Android partagent
 * l'`affiliateLink` d'un jeton de campagne ; la v3.1 partageait l'origine du
 * site, SANS code : un filleul arrivé par là n'était rattaché à personne.
 *
 * - `GET /api/v1/affiliate/tokens?limit=50` (`routes/affiliate.ts:231`) — les
 *   jetons CRÉÉS PAR le lecteur, les plus récents d'abord. Le premier qui est
 *   actif, non expiré et non épuisé est choisi.
 * - `POST /api/v1/affiliate/tokens { name }` (`:87`) — seulement si AUCUN ne
 *   l'est : le premier partage crée le jeton, le lecteur n'a rien à régler.
 *
 * **Le lien est RECOMPOSÉ depuis l'origine servie**, jamais recopié
 * d'`affiliateLink` : la passerelle y met son `FRONTEND_URL`, qui n'est pas
 * forcément l'hôte où tourne ce build (staging, coque). La v3.1 sert
 * `/signup/affiliate/:token` elle-même (`route-table.tsx`).
 *
 * **Échouer ne partage rien.** Une lecture en panne ne crée pas de jeton à
 * l'aveugle, une réponse illisible n'est pas une liste vide, et un jeton que
 * la passerelle dit inutilisable ne part pas : chaque cas rend un échec, que
 * l'écran annonce, plutôt qu'un lien qui laisserait croire au parrainage.
 *
 * **Module À PART de `affiliate.ts`, et c'est une mesure** : `affiliate.ts`
 * est importé par l'inscription, qui n'atteint `zod` par AUCUN import statique
 * (mesuré le 2026-09-15). Y décoder ces jetons aurait ajouté le chunk `zod` à
 * la page où arrivent précisément les invités. La liste des conversations ne
 * charge ce module qu'au geste (`import()`), pour la même raison.
 */

export type ReferralLinkDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const REFERRAL_TOKEN_NAME = 'Invitation Meeshy';

const TOKENS_PAGE_LIMIT = 50;
const FIXTURE_REFERRAL_TOKEN = 'aff_recette';

type ReferralToken = {
  readonly token: string;
  readonly isActive: boolean;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly expiresAt: string | null;
};

const WireToken = z.object({
  token: z.string().check(z.minLength(1)),
  isActive: z.boolean(),
  maxUses: z.optional(z.nullable(z.number())),
  currentUses: z.optional(z.nullable(z.number())),
  expiresAt: z.optional(z.nullable(z.string())),
});

const UNREADABLE: ApiFailure = { ok: false, status: 0, error: 'Jeton de parrainage illisible' };

function decodeReferralToken(raw: unknown): ReferralToken | null {
  const parsed = WireToken.safeParse(raw);
  if (!parsed.success) return null;
  const { token, isActive, maxUses, currentUses, expiresAt } = parsed.data;
  return { token, isActive, maxUses: maxUses ?? null, currentUses: currentUses ?? 0, expiresAt: expiresAt ?? null };
}

/** Même lecture que `GET /affiliate/validate/:token` : expiré STRICTEMENT
 * après l'échéance, et une date illisible ne vaut jamais « sans échéance ». */
function isExpired(expiresAt: string | null, now: Date): boolean {
  if (expiresAt === null) return false;
  const at = Date.parse(expiresAt);
  return Number.isNaN(at) || now.getTime() > at;
}

/** `maxUses` lu en VÉRITÉ par la passerelle : `null` ou `0` veulent dire illimité. */
const isExhausted = ({ maxUses, currentUses }: ReferralToken): boolean =>
  maxUses !== null && maxUses > 0 && currentUses >= maxUses;

const isUsable = (token: ReferralToken, now: Date): boolean =>
  token.isActive && !isExpired(token.expiresAt, now) && !isExhausted(token);

const referralLinkOf = (origin: string, token: string): string => `${origin}/signup/affiliate/${encodeURIComponent(token)}`;

export async function loadShareableReferralLink(params: {
  readonly origin: string;
  readonly now: Date;
  readonly deps: ReferralLinkDeps;
}): Promise<ApiResult<string>> {
  const { origin, now, deps } = params;
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: referralLinkOf(origin, FIXTURE_REFERRAL_TOKEN) };

  const listed = await deps.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/affiliate/tokens?limit=${TOKENS_PAGE_LIMIT}`,
  });
  if (!listed.ok) return listed;
  if (!Array.isArray(listed.data)) return UNREADABLE;

  const usable = listed.data
    .map(decodeReferralToken)
    .find((token): token is ReferralToken => token !== null && isUsable(token, now));
  if (usable !== undefined) return { ok: true, data: referralLinkOf(origin, usable.token) };

  const created = await deps.transport.request<unknown>({
    method: 'POST',
    path: '/api/v1/affiliate/tokens',
    body: { name: REFERRAL_TOKEN_NAME },
  });
  if (!created.ok) return created;
  const token = decodeReferralToken(created.data);
  return token !== null && isUsable(token, now) ? { ok: true, data: referralLinkOf(origin, token.token) } : UNREADABLE;
}
