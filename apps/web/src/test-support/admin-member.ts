import type { AdminUserDetail } from '@/lib/api/admin-user-detail';
import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';

/**
 * LE MEMBRE DE RECETTE DES ÉCRANS D'ADMINISTRATION (#7845) — une fabrique, et
 * non un littéral recopié dans chaque témoin : `AdminUserDetail` a gagné vingt
 * champs dans ce lot, et chaque témoin qui en portait sa propre copie a dû être
 * réécrit pour compiler. Les témoins surchargent ce qu'ils interrogent, rien de
 * plus.
 */
export function adminMember(overrides: Partial<AdminUserDetail> = {}): AdminUserDetail {
  return {
    id: 'u-membre',
    username: 'membre',
    displayName: 'Le membre',
    firstName: 'Léa',
    lastName: 'Martin',
    bio: '',
    avatar: '',
    email: 'membre@example.test',
    phoneNumber: '',
    role: 'USER',
    timezone: 'Europe/Paris',
    systemLanguage: 'de',
    regionalLanguage: 'es',
    customDestinationLanguage: 'it',
    isActive: true,
    isOnline: false,
    deactivatedAt: null,
    deletedAt: null,
    deletedBy: null,
    lockedUntil: null,
    lockedReason: null,
    failedLoginAttempts: 0,
    lastPasswordChange: null,
    twoFactorEnabledAt: null,
    twoFactorEnabled: false,
    emailVerifiedAt: null,
    phoneVerifiedAt: null,
    lastActiveAt: null,
    createdAt: '2026-01-12T08:30:00.000Z',
    updatedAt: null,
    banner: null,
    phoneCountryCode: '',
    profileCompletionRate: null,
    counts: {
      participations: 0,
      sentFriendRequests: 0,
      receivedFriendRequests: 0,
      createdShareLinks: 0,
      createdTrackingLinks: 0,
      createdAffiliateTokens: 0,
    },
    deviceLocale: '',
    deviceCountry: '',
    ageVerifiedAt: null,
    consents: { voiceProfile: null, voiceData: null, dataProcessing: null, analytics: null, voiceCloning: null },
    termsAcceptedAt: null,
    termsVersion: null,
    onboardingCompletedAt: null,
    engagement: {
      currentStreakDays: 0,
      longestStreakDays: 0,
      lastStreakDate: null,
      engagementScore: 0,
      meeshBalance: 0,
      meeshMintedLifetime: 0,
    },
    blockedCount: 0,
    ...overrides,
  };
}

export type RoutedReply = (req: HttpRequest) => ApiResult<unknown> | undefined;

/**
 * UN TRANSPORT QUI RÉPOND PAR CHEMIN SANS SA REQUÊTE, et garde chaque appel.
 *
 * `scriptedTransport` compare l'adresse ENTIÈRE, chaîne de requête comprise :
 * un témoin de TRI doit pourtant pouvoir répondre à `…/conversations` quels que
 * soient `sort` et `order`, puis relire ce qui est parti. Le répondeur reçoit la
 * requête et rend `undefined` pour « pas moi » — la suivante est essayée, et
 * faute de preneur la réponse est le 404 que ferait la passerelle.
 */
export function routedTransport(...repondeurs: readonly RoutedReply[]): {
  readonly transport: HttpTransport;
  readonly calls: () => readonly HttpRequest[];
} {
  const calls: HttpRequest[] = [];
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    calls.push(req);
    for (const repondre of repondeurs) {
      const reponse = repondre(req);
      if (reponse !== undefined) return reponse;
    }
    return { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  }) as HttpTransport['request'];
  return { transport, calls: () => calls };
}

/** Le chemin SANS sa chaîne de requête. */
export const pathOf = (req: HttpRequest): string => req.path.split('?')[0] ?? req.path;

/** La chaîne de requête, lue. */
export const queryOf = (req: HttpRequest): URLSearchParams => new URLSearchParams(req.path.split('?')[1] ?? '');
