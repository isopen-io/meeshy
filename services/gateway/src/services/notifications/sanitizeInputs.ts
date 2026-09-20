/**
 * Défense en profondeur des entrées d'une notification — site UNIQUE.
 *
 * Ce bloc vivait dans `createNotification`, et il a été deux fois pris en
 * défaut par ce qu'il NE couvrait pas plutôt que par ce qu'il faisait :
 *
 * - **#7157** — l'avatar était « sanitisé » par
 *   `sanitizeURL(avatar) ?? avatar`. `sanitizeURL` rend `null` pour deux
 *   raisons opposées (entrée dangereuse / entrée qui n'est pas une URL
 *   absolue), donc le repli restituait la valeur d'origine PRÉCISÉMENT dans le
 *   cas rejeté : la garde ne laissait passer que ce qu'elle devait bloquer ;
 * - **#7159** — le TITRE ne traversait pas ce bloc du tout, alors que le
 *   `content` du même appel y passait.
 *
 * Les deux défauts ont la même forme : un champ voisin, écrit par la même
 * main, qu'aucune phrase du bloc ne nommait. Les extraire ici les rend
 * énumérables et testables sans monter un service.
 */

import type { NotificationActor, NotificationMetadata } from '@meeshy/shared/types/notification';
import { SecuritySanitizer } from '../../utils/sanitize';

/** Longueur maximale d'un titre persisté — la troncature vient APRÈS la sanitisation. */
const TITRE_MAX = 160;

export type NotificationInputs = {
  readonly content: string;
  readonly actor?: NotificationActor;
  readonly metadata: NotificationMetadata;
};

export type SanitizedNotificationInputs = {
  readonly content: string;
  readonly actor: NotificationActor | undefined;
  readonly metadata: NotificationMetadata;
};

/**
 * Nettoie ce qu'une notification PERSISTE et TRANSPORTE : son texte, l'identité
 * de son acteur, ses métadonnées.
 *
 * L'avatar passe par `sanitizeURLOrPath`, qui distingue « chemin d'API
 * relatif » (gardé) de « protocole refusé » (abandonné) — cf. #7157.
 */
export const sanitizeNotificationInputs = (
  params: NotificationInputs
): SanitizedNotificationInputs => ({
  content: SecuritySanitizer.sanitizeText(params.content),
  actor: params.actor
    ? {
        ...params.actor,
        displayName: params.actor.displayName
          ? SecuritySanitizer.sanitizeText(params.actor.displayName)
          : params.actor.displayName,
        avatar: params.actor.avatar
          ? SecuritySanitizer.sanitizeURLOrPath(params.actor.avatar)
          : params.actor.avatar,
      }
    : undefined,
  // `sanitizeJSON` est déclarée `(input: any): any` : elle traverse une
  // structure arbitraire sans rien savoir de sa forme. L'assertion RESTAURE le
  // type d'entrée — elle ne l'élargit pas, et elle est la seule façon de ne pas
  // propager le `any` de l'utilitaire dans le reste de la chaîne.
  metadata: SecuritySanitizer.sanitizeJSON(params.metadata) as NotificationMetadata,
});

/**
 * Le titre RÉELLEMENT écrit en base.
 *
 * `displayTitle` est le libellé localisé que le builder produit pour les types
 * sociaux ; `fallbackTitle` est le titre explicite de l'appelant (le sujet
 * d'une annonce système, par exemple). Ce point de passage est le SEUL par
 * lequel un titre atteint la ligne persistée, quelle que soit sa source —
 * c'est ce qui rend la garde complète (#7159).
 *
 * L'ordre compte : sanitiser PUIS tronquer, sans quoi la troncature couperait
 * au milieu d'une entité que la sanitisation vient d'introduire.
 */
export const persistedNotificationTitle = (
  displayTitle: string | null | undefined,
  fallbackTitle: string | null | undefined
): string | null => {
  const brut = displayTitle ?? fallbackTitle ?? null;
  if (brut === null) return null;

  const sain = SecuritySanitizer.sanitizeText(brut).trim();
  return sain === '' ? null : sain.slice(0, TITRE_MAX);
};
