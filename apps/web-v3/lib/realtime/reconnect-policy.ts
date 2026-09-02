/**
 * UNE politique de reconnexion (conception § 7) — 1 s → 30 s, aléa 0,5 —,
 * reprise du patron mesuré dans `apps/web/services/socketio/connection.service.ts:
 * 203-206`, et écrite une seule fois : le module de participation la passe à
 * `io()` telle quelle, et personne d'autre n'a de socket.
 *
 * Ce que ce module ne dit PAS : QUAND reconnecter. C'est `lib/realtime/
 * lifecycle.ts` qui le dit (masquage ⇒ rien ne part ; reprise ⇒ `connect()`),
 * et ce partage est ce qui rend vraie la loi « onglet caché ⇒ zéro requête ».
 */
export const POLITIQUE_DE_RECONNEXION = {
  reconnection: true,
  reconnectionDelay: 1_000,
  reconnectionDelayMax: 30_000,
  randomizationFactor: 0.5,
  timeout: 20_000,
} as const;

/**
 * Au-delà de cette absence, le socket ne rejoue pas ce qui s'est dit : le
 * retour passe par `GET /sync` depuis le curseur (§ 7, « socket tombée
 * 30 s – 5 min »). En deçà, le point d'état passe de plein à creux, rien d'autre.
 */
export const SEUIL_DE_RATTRAPAGE_MS = 30_000;

/** Le battement de bail d'un invité (§ 5.1, § 6.4) : 5 min, tenu par UN onglet. */
export const PERIODE_DU_BATTEMENT_MS = 5 * 60_000;

/** Après ce silence de frappe, `typing:stop` part sans qu'on l'ait demandé. */
export const SILENCE_DE_FRAPPE_MS = 3_000;

/** Le serveur étrangle `typing:start` à 2 s par (utilisateur, conversation) — inutile d'en émettre plus. */
export const CADENCE_DE_FRAPPE_MS = 2_000;
