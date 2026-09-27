import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps } from './admin';
import { decodeAdminUserDetail, type AdminUserDetail } from './admin-user-detail';
import type { ApiResult } from './http';

/**
 * **CRÉER UN COMPTE DEPUIS L'ADMINISTRATION** (#8217) —
 * `POST admin.users`, sous `canCreateUsers` ; le rôle demandé passe
 * en plus par `canManageUser` (on ne crée pas plus haut que soi).
 *
 * La passerelle tient les règles, ce port les transporte :
 * - l'adresse est normalisée (`normalizeEmail`) et un doublon — à la casse
 *   près — rend 409 `EMAIL_TAKEN` (#8215) ;
 * - un pseudonyme pris rend 409 `USERNAME_TAKEN` ;
 * - un mot de passe trop faible rend 400, la raison dans `error`
 *   (`validatePasswordStrength`) — la politique ne se rejoue pas ici, elle
 *   divergerait au premier ajustement de palier.
 *
 * Le compte naît ACTIF, rejoint le salon global comme un inscrit, et se
 * connecte aussitôt avec son pseudonyme ou son adresse et ce mot de passe.
 *
 * La réponse est le membre sanitisé, décodé par `decodeAdminUserDetail` : les
 * champs traçants restent écartés sur ce chemin comme sur la lecture.
 */
export type AdminUserCreateInput = {
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly password: string;
  readonly role: string;
  readonly systemLanguage: string;
};

const REQUIRED = ['username', 'firstName', 'lastName', 'email', 'password'] as const;

export type AdminUserCreateField = (typeof REQUIRED)[number];

export function missingCreateFields(input: AdminUserCreateInput): readonly AdminUserCreateField[] {
  return REQUIRED.filter((champ) => input[champ].trim() === '');
}

export async function createAdminUser(
  params: AdminDeps & {
    readonly input: AdminUserCreateInput;
    /** L'administrateur ATTESTE l'adresse : le compte se connecte aussitôt (#8055). */
    readonly emailVerified?: boolean;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminUserDetail>> {
  const { input } = params;
  const manquants = missingCreateFields(input);
  if (manquants.length > 0) return { ok: false, status: 0, error: `Champs requis : ${manquants.join(', ')}` };

  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: adminEndpoints.users,
    body: {
      username: input.username.trim(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      password: input.password,
      role: input.role,
      systemLanguage: input.systemLanguage,
      ...(params.emailVerified === true ? { emailVerified: true } : {}),
    },
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const membre = decodeAdminUserDetail(result.data);
  return membre === null ? { ok: false, status: 0, error: 'Membre illisible' } : { ok: true, data: membre };
}
