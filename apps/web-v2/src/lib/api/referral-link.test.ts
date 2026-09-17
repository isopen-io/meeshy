import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { loadShareableReferralLink, REFERRAL_TOKEN_NAME } from './referral-link';

const ORIGIN = 'https://meeshy.me';
const NOW = new Date('2026-09-15T10:00:00.000Z');

type Replies = Readonly<Record<string, ApiResult<unknown>>>;

/** Répond selon `MÉTHODE chemin`, et garde la trace de CHAQUE appel : un
 * témoin qui ne relit pas les requêtes ne peut pas dire « aucun jeton créé ». */
function fakeTransport(replies: Replies): { readonly transport: HttpTransport; readonly calls: () => readonly HttpRequest[] } {
  const calls: HttpRequest[] = [];
  const request = async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    calls.push(req);
    return replies[`${req.method} ${req.path}`] ?? { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  };
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = request as HttpTransport['request'];
  return { transport, calls: () => calls };
}

const LIST = 'GET /api/v1/affiliate/tokens?limit=50';
const CREATE = 'POST /api/v1/affiliate/tokens';

/** La forme de `GET /affiliate/tokens` : la ligne Prisma étalée, `expiresAt`
 * ABSENT quand il n'y en a pas (`token.expiresAt?.toISOString()`), et un
 * `affiliateLink` dont l'hôte est le `FRONTEND_URL` de la passerelle. */
const wireToken = (overrides: Readonly<Record<string, unknown>> = {}) => ({
  id: 't1',
  token: 'aff_actif',
  name: 'Campagne',
  affiliateLink: 'https://app.meeshy.me/signup/affiliate/aff_actif',
  maxUses: null,
  currentUses: 0,
  clickCount: 0,
  isActive: true,
  createdAt: '2026-09-01T09:00:00.000Z',
  _count: { affiliations: 0 },
  ...overrides,
});

const listed = (tokens: readonly unknown[]): ApiResult<unknown> => ({
  ok: true,
  data: tokens,
  pagination: { total: tokens.length, offset: 0, limit: 50, hasMore: false },
});

const gateway = (replies: Replies) => {
  const fake = fakeTransport(replies);
  return { ...fake, deps: { source: 'gateway' as const, transport: fake.transport } };
};

describe('loadShareableReferralLink — le lien de parrainage à partager (#6707)', () => {
  test('un jeton ACTIF est choisi, sans en créer un autre', async () => {
    const { deps, calls } = gateway({ [LIST]: listed([wireToken()]) });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result).toEqual({ ok: true, data: 'https://meeshy.me/signup/affiliate/aff_actif' });
    expect(calls().map((c) => `${c.method} ${c.path}`)).toEqual([LIST]);
  });

  /**
   * L'hôte d'`affiliateLink` est celui du `FRONTEND_URL` de la passerelle :
   * sur un déploiement où il n'est pas l'origine servie, recopier ce lien
   * enverrait l'invité ailleurs que là où il a été invité.
   */
  test('le lien est RECOMPOSÉ depuis l’origine du site, jamais recopié d’affiliateLink', async () => {
    const { deps } = gateway({ [LIST]: listed([wireToken({ affiliateLink: 'http://localhost:3100/signup/affiliate/aff_actif' })]) });

    const result = await loadShareableReferralLink({ origin: 'https://staging.meeshy.me', now: NOW, deps });

    expect(result).toEqual({ ok: true, data: 'https://staging.meeshy.me/signup/affiliate/aff_actif' });
  });

  test('un jeton INACTIF, EXPIRÉ ou ÉPUISÉ est ignoré au profit du suivant utilisable', async () => {
    const { deps, calls } = gateway({
      [LIST]: listed([
        wireToken({ token: 'aff_inactif', isActive: false }),
        wireToken({ token: 'aff_expire', expiresAt: '2026-09-14T10:00:00.000Z' }),
        wireToken({ token: 'aff_epuise', maxUses: 5, currentUses: 5 }),
        wireToken({ token: 'aff_bon', maxUses: 5, currentUses: 4, expiresAt: '2026-10-01T00:00:00.000Z' }),
      ]),
    });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result).toEqual({ ok: true, data: 'https://meeshy.me/signup/affiliate/aff_bon' });
    expect(calls()).toHaveLength(1);
  });

  /** La passerelle lit `maxUses` en VÉRITÉ (`routes/affiliate.ts`,
   * `/validate/:token`) : `0` ou `null` veulent dire « illimité ». */
  test('`maxUses` nul ou à zéro reste illimité, comme la passerelle le lit', async () => {
    const { deps } = gateway({ [LIST]: listed([wireToken({ token: 'aff_zero', maxUses: 0, currentUses: 12 })]) });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result).toEqual({ ok: true, data: 'https://meeshy.me/signup/affiliate/aff_zero' });
  });

  test('aucun jeton utilisable : un jeton est CRÉÉ, et c’est lui qui part', async () => {
    const { deps, calls } = gateway({
      [LIST]: listed([wireToken({ token: 'aff_inactif', isActive: false })]),
      [CREATE]: { ok: true, data: wireToken({ token: 'aff_neuf', name: REFERRAL_TOKEN_NAME }) },
    });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result).toEqual({ ok: true, data: 'https://meeshy.me/signup/affiliate/aff_neuf' });
    expect(calls().map((c) => `${c.method} ${c.path}`)).toEqual([LIST, CREATE]);
    expect(calls()[1]?.body).toEqual({ name: 'Invitation Meeshy' });
  });

  test('une liste VIDE crée aussi le jeton', async () => {
    const { deps, calls } = gateway({ [LIST]: listed([]), [CREATE]: { ok: true, data: wireToken({ token: 'aff_premier' }) } });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result).toEqual({ ok: true, data: 'https://meeshy.me/signup/affiliate/aff_premier' });
    expect(calls()).toHaveLength(2);
  });

  test('le jeton est encodé dans le chemin', async () => {
    const { deps } = gateway({ [LIST]: listed([wireToken({ token: 'aff a/b' })]) });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result).toEqual({ ok: true, data: 'https://meeshy.me/signup/affiliate/aff%20a%2Fb' });
  });

  test('un échec de LECTURE est un échec — et aucun jeton n’est créé à l’aveugle', async () => {
    const { deps, calls } = gateway({ [LIST]: { ok: false, status: 500, error: 'Erreur lors de la récupération des tokens' } });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result.ok).toBe(false);
    expect(calls()).toHaveLength(1);
  });

  test('un échec de CRÉATION est un échec, jamais un lien sans code', async () => {
    const { deps } = gateway({ [LIST]: listed([]), [CREATE]: { ok: false, status: 401, error: 'Authentication required' } });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result.ok).toBe(false);
  });

  /** Une réponse ILLISIBLE n'est pas une liste vide : créer un jeton sur une
   * enveloppe qu'on ne comprend pas en empilerait un à chaque partage. */
  test('une liste illisible est un échec, sans création', async () => {
    const { deps, calls } = gateway({ [LIST]: { ok: true, data: { tokens: [] } } });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result.ok).toBe(false);
    expect(calls()).toHaveLength(1);
  });

  test('une création illisible (pas de jeton) est un échec', async () => {
    const { deps } = gateway({ [LIST]: listed([]), [CREATE]: { ok: true, data: { affiliateLink: 'https://meeshy.me/signup/affiliate/' } } });

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps });

    expect(result.ok).toBe(false);
  });

  test('en fixtures, un lien de recette PORTANT un code, sans réseau', async () => {
    const { transport, calls } = fakeTransport({});

    const result = await loadShareableReferralLink({ origin: ORIGIN, now: NOW, deps: { source: 'fixtures', transport } });

    expect(result.ok).toBe(true);
    expect(result.ok ? result.data : '').toMatch(/^https:\/\/meeshy\.me\/signup\/affiliate\/[^/]+$/);
    expect(calls()).toHaveLength(0);
  });
});
