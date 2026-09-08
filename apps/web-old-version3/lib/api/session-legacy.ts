/**
 * LES CLÉS DE LA SESSION LEGACY — déménagées de
 * `app/authentification/remise.ts`, qui les POSE, parce que la déconnexion
 * (#5095) a besoin de les LIRE depuis un module de NAVIGATEUR
 * (`lib/realtime/deconnexion.ts`, compilé par `bun build --target=browser`).
 *
 * `remise.ts` importe `app/actifs-inlines` pour composer son document — une
 * lecture de disque, indisponible dans un bundle client. Les NOMS de clés,
 * eux, ne dépendent de rien : ils vivent ici, `remise.ts` les RÉ-EXPORTE et
 * garde son récit (précédent exact : `COOKIE_DE_JETON`/`COOKIE_DE_SESSION`,
 * déménagés vers `lib/api/cookies.ts`).
 *
 * Miroirs de `apps/web/constants/auth.ts` — les clés que le legacy relit.
 * `AUTH_STORAGE_KEYS` pour la session, `SESSION_STORAGE_KEYS` pour l'étape de
 * vérification. Gardés par un témoin de source qui les oppose au fichier.
 */
export const CLES = {
  jeton: 'meeshy_auth_token',
  jetonDeSession: 'meeshy_session_token',
  utilisateur: 'meeshy_user_data',
} as const;

export const CLES_DEUXIEME_FACTEUR = {
  jetonTemporaire: 'meeshy_2fa_temp_token',
  identifiantUtilisateur: 'meeshy_2fa_user_id',
  pseudonyme: 'meeshy_2fa_username',
} as const;

/**
 * LE JETON DE SESSION LEGACY, LU — pour que la déconnexion (#5095) puisse le
 * relayer au formulaire (`lib/realtime/deconnexion.ts`) sans accéder à
 * `localStorage` elle-même : ce fichier est le détenteur ÉNUMÉRÉ de ces trois
 * clés (`zone-session-invitee.test.ts`), au même titre que
 * `lib/api/guest-session.ts` l'est de `meeshy.guest.*`. Un accès raté
 * (navigation privée, quota) rend `null`, jamais une exception.
 */
export const lisLeJetonDeSession = (): string | null => {
  try {
    return localStorage.getItem(CLES.jetonDeSession);
  } catch {
    return null;
  }
};

/** Les trois clés que le legacy relit — l'acte NOMMÉ de la sortie (#5095). */
export const effaceLaSessionLegacy = (): void => {
  try {
    localStorage.removeItem(CLES.jeton);
    localStorage.removeItem(CLES.jetonDeSession);
    localStorage.removeItem(CLES.utilisateur);
  } catch {
    // best-effort — un stockage indisponible n'interrompt jamais la sortie.
  }
};
