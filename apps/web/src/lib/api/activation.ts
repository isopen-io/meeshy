import * as z from 'zod/mini';

import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import * as usersEndpoints from '@meeshy/shared/api/endpoints/users';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **L'ÉTAT D'ACTIVATION DE SOI** (#8239, loi serveur #8238) — la passerelle
 * sert `activation: { phase, deadline, missing }` dans la charge de
 * l'utilisateur courant : `quiet` (J0–J7, rien à dire), `invite` (J7–J28, la
 * modal invite), `blocked` (après J28, la connexion mène à l'écran du code),
 * `done` (adresse prouvée ; le numéro peut encore manquer).
 *
 * **Une forme inconnue ne change RIEN.** Champ absent (passerelle antérieure)
 * ou phase inconnue ⇒ `null`, et aucun écran n'invite. Un canal inconnu dans
 * `missing` est écarté seul : il ne doit pas éteindre l'invitation aux deux
 * autres.
 *
 * **L'adresse voyage EN CLAIR, en mémoire vive seulement.** « Recevoir le
 * code » et sa saisie en ont besoin ; le profil du cache persisté ne porte
 * qu'un masque (`profile.ts`). Cette lecture n'écrit donc dans aucun cache —
 * l'hôte la garde le temps de la modal.
 *
 * **Le numéro passe par le parcours d'iOS** (`UserService.changePhone` /
 * `verifyPhoneChange`, `SecurityView`) : `POST users.meChangePhone` envoie le
 * code par SMS, `POST users.meVerifyPhoneChange` l'active.
 */

export type ActivationPhase = 'quiet' | 'invite' | 'blocked' | 'done';
export type ActivationChannel = 'email' | 'phone';

export type Activation = {
  readonly phase: ActivationPhase;
  readonly deadline: string | null;
  readonly missing: readonly ActivationChannel[];
};

export type MyActivation = { readonly activation: Activation | null; readonly email: string | null };

export type ActivationDeps = { readonly source: DataSource; readonly transport: HttpTransport };

const WireActivation = z.object({
  phase: z.enum(['quiet', 'invite', 'blocked', 'done']),
  deadline: z.optional(z.nullable(z.string())),
  missing: z.optional(z.nullable(z.array(z.string()))),
});

const isChannel = (value: string): value is ActivationChannel => value === 'email' || value === 'phone';

export function decodeActivation(raw: unknown): Activation | null {
  const parsed = WireActivation.safeParse(raw);
  if (!parsed.success) return null;
  return {
    phase: parsed.data.phase,
    deadline: parsed.data.deadline ?? null,
    missing: (parsed.data.missing ?? []).filter(isChannel),
  };
}

const WireMe = z.object({
  user: z.optional(z.object({ email: z.optional(z.nullable(z.string())), activation: z.optional(z.unknown()) })),
  activation: z.optional(z.unknown()),
});

export async function loadMyActivation(deps: ActivationDeps): Promise<ApiResult<MyActivation>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { activation: null, email: null } };
  const result = await deps.transport.request<unknown>({ method: 'GET', path: meEndpoints.root });
  if (!result.ok) return result;
  const parsed = WireMe.safeParse(result.data);
  if (!parsed.success) return { ok: true, data: { activation: null, email: null } };
  const email = parsed.data.user?.email;
  return {
    ok: true,
    data: {
      activation: decodeActivation(parsed.data.user?.activation ?? parsed.data.activation),
      email: email === undefined || email === null || email.trim() === '' ? null : email,
    },
  };
}

/** Un numéro international : `+`, puis 8 à 15 chiffres (E.164). Les espaces,
 * points, tirets et parenthèses de la saisie sont retirés avant d'envoyer. */
export function compactPhone(value: string): string | null {
  const compact = value.replace(/[\s().-]/g, '');
  return /^\+\d{8,15}$/.test(compact) ? compact : null;
}

export async function requestPhoneCode(deps: ActivationDeps, phone: string): Promise<ApiResult<unknown>> {
  const newPhoneNumber = compactPhone(phone);
  if (newPhoneNumber === null) return { ok: false, status: 0, error: 'Numéro invalide', code: 'INVALID_PHONE' };
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: {} };
  return deps.transport.request<unknown>({ method: 'POST', path: usersEndpoints.meChangePhone, body: { newPhoneNumber } });
}

export async function verifyPhoneCode(deps: ActivationDeps, code: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: {} };
  return deps.transport.request<unknown>({ method: 'POST', path: usersEndpoints.meVerifyPhoneChange, body: { code } });
}
