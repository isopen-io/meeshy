import type { SessionUser } from './session';

/**
 * `POST /auth/verify-email` (`magic-link.ts`, `AuthSchemas.verifyEmail`) —
 * DEUX preuves de possession de l'adresse : le CODE à 6 chiffres (saisi) ou le
 * JETON du lien reçu par e-mail (#8034). `password` ne voyage QU'AVEC le code :
 * la passerelle ne l'applique que si le compte n'en a pas encore (contrat
 * #8033), et un mot de passe tapé ne s'attache jamais à un lien qu'un autre a
 * pu ouvrir.
 */
export type VerifyEmailRequest =
  | { readonly email: string; readonly code: string; readonly password?: string }
  | { readonly email: string; readonly token: string };

/**
 * La réponse. `alreadyVerified` + `verifiedAt` : la branche « déjà vérifié »,
 * un succès. `token` + `sessionToken` + `user` (#8034, contrat #8033) : la
 * vérification OUVRE la session ; ABSENTS sur une passerelle antérieure, qui
 * se contente de vérifier.
 */
export type VerifyEmailData = {
  readonly message?: string;
  readonly verified?: boolean;
  readonly alreadyVerified?: boolean;
  readonly verifiedAt?: string;
  readonly token?: string;
  readonly sessionToken?: string;
  readonly user?: SessionUser;
  readonly expiresIn?: number;
};

export type VerifiedSession = VerifyEmailData & { readonly token: string; readonly sessionToken: string; readonly user: SessionUser };

export function verificationOpensSession(data: VerifyEmailData): data is VerifiedSession {
  return typeof data.token === 'string' && typeof data.sessionToken === 'string' && data.user !== undefined;
}

export function verifyEmailBody(request: VerifyEmailRequest): Record<string, string> {
  if ('token' in request) return { email: request.email, token: request.token };
  const password = request.password ?? '';
  return { email: request.email, code: request.code, ...(password !== '' ? { password } : {}) };
}

/**
 * `POST /auth/verification/status` (#8083) — l'adresse a-t-elle été prouvée
 * (code ou lien, où que ce soit) depuis que CET appareil a reçu son jeton
 * d'attente ? Un ÉTAT, jamais une session : l'appareil ne se connecte que par
 * le code saisi sur lui ou le lien ouvert sur lui. 401 jeton inconnu, 410
 * expiré.
 */
export type VerificationStatusData = { readonly status: 'pending' | 'proven' };
