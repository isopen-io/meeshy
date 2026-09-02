/**
 * Le défi d'étape 2 d'une connexion — SITE UNIQUE (#4542).
 *
 * Deux producteurs d'étape 1 le composaient, chacun avec sa copie du mint :
 * `AuthService.authenticate` (formulaire) et
 * `MagicLinkService.mintPendingTwoFactorToken` (lien magique, livré par #4534,
 * qui ne pouvait pas l'éviter — `AuthService.ts` était hors de son territoire
 * ET hors budget). Les deux copies étaient encore identiques au moment de
 * l'extraction ; c'est précisément l'instant où l'on extrait, parce qu'une
 * divergence ne s'annonce pas : elle apparaît le jour où l'une des deux change
 * de durée, d'algorithme d'empreinte ou de colonne.
 *
 * Le défi vit dans SES PROPRES colonnes — `User.twoFactorChallengeHash` /
 * `twoFactorChallengeExpiresAt` — depuis ce lot. Il empruntait
 * `phoneVerificationCode` / `phoneVerificationExpiry`, ce qui produisait DEUX
 * défauts mesurés, pas un :
 *
 * 1. **La collision.** Une vérification de téléphone en cours était écrasée
 *    par un défi 2FA, et réciproquement — le second écrivain gagnait, sans que
 *    rien ne le dise à personne.
 * 2. **L'interchangeabilité.** `AuthService.hashToken()` est
 *    `sha256(token)` — exactement l'empreinte du mint. Un code SMS à SIX
 *    CHIFFRES présenté comme jeton d'étape 2 résolvait donc le compte, et un
 *    jeton d'étape 2 présenté comme code SMS posait `phoneVerifiedAt` sans
 *    qu'aucun SMS n'ait jamais été reçu. Deux secrets de forces très
 *    différentes se substituaient l'un à l'autre parce qu'ils partageaient une
 *    colonne, pas parce qu'un contrôle manquait.
 *
 * Aucun autre fichier de `src/` ne nomme ces deux colonnes — c'est un
 * INVENTAIRE VIDE, tenu par `pending-two-factor-sweep.ts`. Quand ce balayage
 * tombe, la réparation est de faire passer le nouveau site par ce module,
 * jamais d'ajouter une exception à l'inventaire.
 */

import crypto from 'crypto';

/**
 * Ce qu'il faut d'un client Prisma. Le strict nécessaire, pour que les bancs
 * d'essai montent un magasin plutôt qu'un client entier — et pour que ce
 * module ne dépende pas du client généré, dont la forme change avec le schéma.
 */
export type PendingTwoFactorStore = {
  user: {
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
  };
};

/**
 * Cinq minutes : la durée que les deux producteurs portaient déjà, l'un par
 * une constante nommée, l'autre par un littéral en ligne. Elle vit ici
 * désormais, et nulle part ailleurs.
 */
export const PENDING_TWO_FACTOR_TTL_MS = 5 * 60 * 1000;

/** Un jeton d'étape 2 : 32 octets, rendus en hexadécimal. */
const TOKEN_BYTES = 32;

const sha256 = (value: string): string =>
  crypto.createHash('sha256').update(value).digest('hex');

/**
 * Le fragment `where` d'un défi VALIDE, ou `null` quand aucun défi ne peut
 * l'être.
 *
 * Fail-closed sur les deux versants, parce que c'est un secret :
 *
 * - Un jeton vide ou blanc rend `null`. Sans ce refus, `sha256('')` est une
 *   constante parfaitement définie, et une colonne qui la porterait par
 *   accident serait ouverte à quiconque envoie une chaîne vide.
 * - `twoFactorChallengeExpiresAt: { gt: maintenant }` ne matche NI `null` NI
 *   un champ ABSENT du document. Les comptes créés avant ce lot n'ont pas
 *   encore la colonne : ils se comportent en « aucun défi en cours », ce qui
 *   est le sens sûr — jamais une exception, jamais un défi accepté.
 */
export function pendingTwoFactorWhere(
  twoFactorToken: string | undefined | null
): { readonly twoFactorChallengeHash: string; readonly twoFactorChallengeExpiresAt: { gt: Date } } | null {
  if (typeof twoFactorToken !== 'string') return null;

  const token = twoFactorToken.trim();
  if (token.length === 0) return null;

  return {
    twoFactorChallengeHash: sha256(token),
    twoFactorChallengeExpiresAt: { gt: new Date() }
  };
}

/**
 * Le fragment `data` qui EFFACE le défi.
 *
 * Il s'épand dans la mise à jour qui clôt l'étape 2 : sans lui, un jeton
 * consommé resterait valide jusqu'à sa péremption et se rejouerait.
 */
export const clearPendingTwoFactor = (): {
  readonly twoFactorChallengeHash: null;
  readonly twoFactorChallengeExpiresAt: null;
} => ({
  twoFactorChallengeHash: null,
  twoFactorChallengeExpiresAt: null
});

/**
 * Composer le défi d'étape 2 et l'ARMER, puis rendre le jeton BRUT.
 *
 * Le brut ne quitte cette fonction que par son retour : la base ne reçoit que
 * son SHA-256, même discipline que `MagicLinkToken.tokenHash`.
 *
 * L'écriture n'est pas gardée. Si elle échoue, l'exception remonte à
 * l'appelant, qui refuse la connexion — jamais une session ouverte sur un
 * second facteur qu'on n'aurait pas su armer.
 */
export async function mintPendingTwoFactorChallenge(params: {
  readonly prisma: PendingTwoFactorStore;
  readonly userId: string;
}): Promise<string> {
  const { prisma, userId } = params;

  const twoFactorToken = crypto.randomBytes(TOKEN_BYTES).toString('hex');

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorChallengeHash: sha256(twoFactorToken),
      twoFactorChallengeExpiresAt: new Date(Date.now() + PENDING_TWO_FACTOR_TTL_MS)
    }
  });

  return twoFactorToken;
}
