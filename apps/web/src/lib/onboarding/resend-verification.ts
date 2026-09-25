import type { HttpTransport } from '@/lib/api/http';

/**
 * **RENVOYER LE LIEN DE VÉRIFICATION DEPUIS L'ONBOARDING** (#7907) — par les
 * deux routes EXISTANTES de la passerelle, sans contrat neuf :
 * `GET /api/v1/me` rend l'adresse du compte, `POST /api/v1/auth/resend-verification`
 * y renvoie le lien.
 *
 * La session ne garde pas l'adresse (`session.ts`, règle 1 : on ne persiste
 * que quatre champs) et le profil décodé ne la sert que MASQUÉE
 * (`profile.ts § decodeMyProfile`) : elle est donc relue ici, au geste,
 * traverse la fonction et n'est retenue nulle part.
 */
const emailOf = (payload: unknown): string | null => {
  if (typeof payload !== 'object' || payload === null) return null;
  const user: unknown = Reflect.get(payload, 'user');
  const email: unknown = typeof user === 'object' && user !== null ? Reflect.get(user, 'email') : null;
  return typeof email === 'string' && email.includes('@') ? email : null;
};

export async function resendOwnVerification(transport: HttpTransport): Promise<boolean> {
  const me = await transport.request<unknown>({ method: 'GET', path: '/api/v1/me' });
  if (!me.ok) return false;
  const email = emailOf(me.data);
  if (email === null) return false;
  const sent = await transport.request<unknown>({ method: 'POST', path: '/api/v1/auth/resend-verification', body: { email } });
  return sent.ok;
}
