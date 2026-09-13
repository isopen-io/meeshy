/**
 * L'ÉLAN — le multiplicateur de points, appliqué AU MOMENT du crédit (#5749).
 *
 * ## Ce qu'il récompense, et ce qu'il refuse de récompenser
 *
 * Directive porteur (2026-09-08) : « lorsqu'on a beaucoup de succès, des
 * niveaux élevés de badge, les points s'accumulent en facteur 2, 3, 4, 5 quand
 * on tient plusieurs sprints en même temps ».
 *
 *     élan = 1
 *          + (familles d'axes actives sur la fenêtre glissante − 1)   → 0 à 3
 *          + 1 si assise permanente                                   → 0 ou 1
 *     plafonné à 5
 *
 * **Pourquoi une fenêtre glissante et non la série.** La série globale répond
 * déjà « es-tu revenu hier ? ». L'élan doit répondre à une AUTRE question —
 * « fais-tu plusieurs choses à la fois ? » — sinon les deux mécanismes
 * récompensent le même comportement et l'un des deux est du bruit.
 *
 * **Pourquoi l'assise ne vaut qu'un cran.** Les succès et les hauts badges sont
 * ACQUIS. S'ils portaient l'essentiel du multiplicateur, un vétéran inactif
 * accumulerait plus vite qu'un nouveau très actif — l'inverse exact de ce qu'un
 * accélérateur doit faire. Ils donnent un cran ; l'activité donne les trois
 * autres.
 *
 * ## Ce que l'élan ne touche PAS
 *
 * Les BADGES. Ils comptent des ACTIONS (`EngagementCounter.count`), jamais des
 * points : « cinquante messages vocaux » veut dire cinquante, quel que soit
 * l'élan du jour. Sans cette séparation, un utilisateur en ×5 obtiendrait ses
 * badges cinq fois plus vite et toute comparaison entre comptes perdrait son
 * sens. L'élan ne gouverne que `EngagementCounter.points` et, par lui,
 * `User.engagementScore`, le niveau, puis la frappe des Meeshes.
 *
 * Les RECORDS et les COLLECTIONS (#5751) non plus : ils ne créditent aucun
 * point, ce qui est précisément ce qui empêche la vitesse de devenir une pompe
 * à monnaie.
 */

import { ENGAGEMENT_AXIS_FAMILIES, type EngagementAxisFamily } from '../types/engagement.js';

/** La fenêtre sur laquelle une famille compte comme ACTIVE. */
export const ELAN_WINDOW_DAYS = 7;

/** Bornes du multiplicateur — `1` est le neutre, `5` le plafond DUR. */
export const ELAN_MIN = 1;
export const ELAN_MAX = 5;

/** Nombre de succès à partir duquel l'assise est acquise. */
export const ELAN_ACHIEVEMENTS_FOR_STANDING = 10;

/** Palier de badge considéré comme « élevé », et nombre requis pour l'assise. */
export const ELAN_HIGH_BADGE_THRESHOLD = 100;
export const ELAN_HIGH_BADGES_FOR_STANDING = 5;

export type EngagementElanInput = {
  /** Les familles ayant reçu au moins une activité sur la fenêtre glissante. */
  readonly activeFamilies: readonly EngagementAxisFamily[];
  /** Succès débloqués, tous confondus. */
  readonly achievementCount: number;
  /** Badges dont le palier atteint `ELAN_HIGH_BADGE_THRESHOLD` ou plus. */
  readonly highBadgeCount: number;
};

export type EngagementElan = {
  /** Le multiplicateur effectif, toujours dans `[ELAN_MIN, ELAN_MAX]`. */
  readonly factor: number;
  /** Familles distinctes actives, bornées au catalogue — ce qui porte les trois premiers crans. */
  readonly activeFamilyCount: number;
  /**
   * La LISTE des familles qui composent `activeFamilyCount` (#5897). Un client
   * qui n'a que le cardinal ne peut afficher que le score CUMULÉ (tous axes
   * jamais > 0) — une approximation FAUSSE dès qu'une famille est abandonnée
   * depuis plus de `ELAN_WINDOW_DAYS`. Cette liste EST la fenêtre ; son
   * cardinal égale toujours `activeFamilyCount`.
   */
  readonly activeFamilies: readonly EngagementAxisFamily[];
  /** L'assise est-elle acquise — le quatrième cran. */
  readonly hasStanding: boolean;
};

/**
 * Rend l'élan d'un lecteur. Fonction PURE : la passerelle lui remet des
 * entrées mesurées, les clients la rejouent pour AFFICHER le même chiffre.
 *
 * Fail-safe : une famille inconnue (axe ajouté au serveur avant la mise à jour
 * d'un client), un doublon, un compte négatif ⇒ ignorés, jamais une exception.
 * Le multiplicateur ne peut jamais sortir de `[1, 5]`, quelle que soit la
 * composition des entrées — c'est un plafond DUR, pas une convention.
 */
export function computeEngagementElan(input: EngagementElanInput): EngagementElan {
  const familles = new Set<EngagementAxisFamily>();
  for (const famille of input.activeFamilies) {
    if ((ENGAGEMENT_AXIS_FAMILIES as readonly string[]).includes(famille)) familles.add(famille);
  }
  const activeFamilyCount = familles.size;

  const succes = Number.isFinite(input.achievementCount) ? Math.max(0, input.achievementCount) : 0;
  const hautsBadges = Number.isFinite(input.highBadgeCount) ? Math.max(0, input.highBadgeCount) : 0;
  const hasStanding =
    succes >= ELAN_ACHIEVEMENTS_FOR_STANDING || hautsBadges >= ELAN_HIGH_BADGES_FOR_STANDING;

  // `Math.max(0, …)` : zéro famille active (le tout premier geste d'un compte,
  // dont l'axe n'est pas encore écrit) ne doit pas rendre −1.
  const cransActivite = Math.max(0, activeFamilyCount - 1);
  const brut = ELAN_MIN + cransActivite + (hasStanding ? 1 : 0);

  return {
    factor: Math.min(ELAN_MAX, Math.max(ELAN_MIN, brut)),
    activeFamilyCount,
    activeFamilies: [...familles],
    hasStanding,
  };
}

/** Les points qu'un geste crédite : son poids d'axe, multiplié par l'élan. */
export function creditedPoints(weight: number, elan: EngagementElan): number {
  return weight * elan.factor;
}

/**
 * Les entrées de l'élan DÉRIVÉES de lignes déjà lues — aucune requête de plus.
 *
 * La route `GET /me/engagement` lit déjà les compteurs et les paliers pour
 * composer sa charge ; lui faire relire la base pour l'élan serait payer deux
 * fois la même information. Cette fonction est donc la JUMELLE de
 * `EngagementService.loadElanInputs`, qui interroge la base avec un `where`
 * étroit parce qu'elle tourne sur la voie chaude de chaque message.
 *
 * Deux chemins, une seule LOI : les deux finissent dans `computeEngagementElan`
 * avec la même forme d'entrée. C'est ce qui garantit que le chiffre AFFICHÉ est
 * celui qui sera CRÉDITÉ.
 */
export function elanInputsFromRows(params: {
  readonly counters: readonly { readonly axisKey: string; readonly updatedAt: Date | string }[];
  readonly milestones: readonly { readonly milestoneType: string; readonly milestoneKey: string }[];
  readonly familyOf: (axisKey: string) => EngagementAxisFamily | null;
  readonly now?: Date;
}): EngagementElanInput {
  const maintenant = (params.now ?? new Date()).getTime();
  const depuis = maintenant - ELAN_WINDOW_DAYS * 24 * 60 * 60 * 1000;

  const familles = new Set<EngagementAxisFamily>();
  for (const compteur of params.counters) {
    const quand = new Date(compteur.updatedAt).getTime();
    if (!Number.isFinite(quand) || quand < depuis) continue;
    const famille = params.familyOf(compteur.axisKey);
    if (famille !== null) familles.add(famille);
  }

  let achievementCount = 0;
  let highBadgeCount = 0;
  for (const palier of params.milestones) {
    if (palier.milestoneType === 'achievement') {
      achievementCount += 1;
      continue;
    }
    if (palier.milestoneType !== 'badge') continue;
    const seuil = Number.parseInt(palier.milestoneKey.split(':').at(-1) ?? '', 10);
    if (Number.isFinite(seuil) && seuil >= ELAN_HIGH_BADGE_THRESHOLD) highBadgeCount += 1;
  }

  return { activeFamilies: [...familles], achievementCount, highBadgeCount };
}
