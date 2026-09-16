import { type AdminDeps } from './admin';
import type { ApiResult } from './http';

/**
 * **RÉINITIALISER LE MOT DE PASSE D'UN MEMBRE** (#6819) —
 * `POST /api/v1/admin/users/:userId/reset-password`, sous `canResetPasswords`
 * (ADMIN+) et `requireHierarchy`. Le geste **révoque les sessions ouvertes**
 * de la cible (`resetPassword`, #5569) : la personne est déconnectée partout.
 *
 * ## L'écran GÉNÈRE, il ne fait pas saisir
 *
 * La passerelle applique `validatePasswordStrength` (`routes/admin/users.ts:324`)
 * — que le schéma zod, lui, ne porte pas : longueur ≥ `PASSWORD_MIN_LENGTH` ET
 * un score `zxcvbn` **proportionnel à la longueur** (`≥16 ⇒ 3`, `≥10 ⇒ 2`,
 * sinon `1`), sans classe de caractères imposée.
 *
 * Un mot de passe tapé à la main tombe dans le palier le plus court avec le
 * score le plus fragile, et peut être refusé **après** l'aller-retour. Un
 * tirage de {@link GENERATED_PASSWORD_LENGTH} caractères entre dans le palier
 * des 16+, dont `password-strength.ts` atteste qu'il est atteignable « sans
 * classes forcées ». Et le geste est plus juste ainsi : un administrateur
 * TRANSMET un secret, il n'a pas à le composer.
 *
 * ## Ce que le corps ne porte pas
 *
 * `sendEmail` est accepté par le schéma et **n'envoie rien** (#6831) :
 * `resetPassword` ne le lit jamais. L'offrir afficherait une case dont la
 * seule fonction serait de rassurer celui qui la coche.
 */

/** 20 — dans le palier des 16+, avec de la marge sur sa borne basse. */
export const GENERATED_PASSWORD_LENGTH = 20;

/**
 * Sans `O`, `0`, `l`, `1` ni `I` : un secret se recopie, se dicte, se lit à
 * voix haute. Un caractère confondu se solde par une seconde réinitialisation,
 * donc un second secret en circulation.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*_+=?-';

/**
 * Tirage SANS BIAIS DE MODULO.
 *
 * `octet % ALPHABET.length` paraît suffire et ne l'est pas : 256 n'étant pas un
 * multiple de la taille de l'alphabet, les premiers symboles sortiraient plus
 * souvent que les derniers. Sur un identifiant, c'est véniel ; sur un SECRET,
 * cela abaisse l'entropie réelle en dessous de celle qu'on croit avoir — et
 * personne ne s'en aperçoit, puisque le mot de passe a l'air aléatoire.
 *
 * On rejette donc les octets au-delà du plus grand multiple utilisable, et on
 * retire tant qu'il en manque. `crypto.getRandomValues`, jamais
 * `crypto.randomUUID` — absent en contexte non sécurisé et sur d'anciennes
 * WebView Android (même raison que `client-message-id.ts`).
 */
export function generateStrongPassword(length: number = GENERATED_PASSWORD_LENGTH): string {
  const plafond = Math.floor(256 / ALPHABET.length) * ALPHABET.length;
  const sortie: string[] = [];

  while (sortie.length < length) {
    const octets = new Uint8Array(length - sortie.length);
    crypto.getRandomValues(octets);
    for (const octet of octets) {
      if (octet >= plafond) continue;
      sortie.push(ALPHABET[octet % ALPHABET.length]!);
      if (sortie.length === length) break;
    }
  }

  return sortie.join('');
}

/**
 * Le plancher SERVEUR (`PASSWORD_MIN_LENGTH` = 6). On refuse en dessous sans
 * appeler : c'est le seul refus dont on soit certain d'avance. Au-delà, c'est
 * le score `zxcvbn` qui décide, et il ne se calcule pas ici — reproduire la
 * politique côté client en ferait une jumelle qui divergerait au premier
 * ajustement de palier.
 */
const LONGUEUR_MINIMALE = 6;

export async function resetAdminUserPassword(
  params: AdminDeps & {
    readonly userId: string;
    readonly newPassword: string;
    readonly reason?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<null>> {
  if (params.newPassword.length < LONGUEUR_MINIMALE) {
    return { ok: false, status: 0, error: `Mot de passe trop court (min ${LONGUEUR_MINIMALE} caractères)` };
  }

  const motif = params.reason?.trim() ?? '';
  const corps: Record<string, unknown> = { newPassword: params.newPassword };
  if (motif !== '') corps.reason = motif;

  const result = await params.transport.request<unknown>({
    method: 'POST',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/reset-password`,
    body: corps,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  // La route ne rend qu'un message — aucune donnée du membre. Le port ne
  // prétend donc rien décoder : il dit que c'est fait.
  return { ok: true, data: null };
}
