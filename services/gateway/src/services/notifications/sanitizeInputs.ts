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
 * - **#17177** — le CONTEXTE n'y passait pas du tout, et il porte l'enveloppe
 *   chiffrée que la NSE iOS déchiffre pour écraser le corps de la bannière. Un
 *   message à vue unique / flouté / éphémère d'une conversation e2ee composait
 *   donc son placeholder (`👁️ 🖼️`) et laissait partir à côté de quoi le
 *   remplacer par le texte entier — sur le fil APNs **et** dans la ligne
 *   `Notification` persistée, puisque `context` y est écrit tel quel.
 *
 * Les trois défauts ont la même forme : un champ voisin, écrit par la même
 * main, qu'aucune phrase du bloc ne nommait. Les extraire ici les rend
 * énumérables et testables sans monter un service.
 */

import type { NotificationActor, NotificationContext, NotificationMetadata } from '@meeshy/shared/types/notification';

import { SecuritySanitizer } from '../../utils/sanitize';
import { envelopeSurvivesProtectionLock } from './deviceEnvelopePush';

/** Longueur maximale d'un titre persisté — la troncature vient APRÈS la sanitisation. */
const TITRE_MAX = 160;

export type NotificationInputs = {
  readonly content: string;
  readonly actor?: NotificationActor;
  readonly metadata: NotificationMetadata;
  readonly context: NotificationContext;
};

export type SanitizedNotificationInputs = {
  readonly content: string;
  readonly actor: NotificationActor | undefined;
  readonly metadata: NotificationMetadata;
  readonly context: NotificationContext;
};

/**
 * Nettoie ce qu'une notification PERSISTE et TRANSPORTE : son texte, l'identité
 * de son acteur, ses métadonnées — et RETIENT du contexte le chiffré que la
 * protection déclarée n'autorise pas.
 *
 * La nuance n'est pas rhétorique : le `context` ne passe PAS par `sanitizeJSON`,
 * là où `metadata` y passe. Ses champs de texte (`conversationTitle`,
 * `firstAttachmentFilename`, `contentDetail`) atteignent la ligne persistée et
 * le fil sans assainissement, et c'est antérieur à ce lot. Écrire que ce bloc
 * « nettoie le contexte » arrêterait le prochain relecteur qui cherche où il
 * l'est — c'est le défaut que les deux paragraphes du dessus racontent, dans sa
 * forme la plus discrète : une phrase vraie de ce qu'on vient d'ajouter et
 * fausse de ce qu'elle a l'air de couvrir.
 *
 * L'avatar passe par `sanitizeURLOrPath`, qui distingue « chemin d'API
 * relatif » (gardé) de « protocole refusé » (abandonné) — cf. #7157.
 *
 * Le SECOND VERROU de l'enveloppe chiffrée est ici, et pas chez les trois
 * créateurs : c'est le seul point par lequel un `context` atteint la ligne
 * persistée ET la charge push, donc le seul endroit où la garde soit complète —
 * exactement la raison qui a fait naître `persistedNotificationTitle` (#7159).
 * Il lit la clé qui DÉCLARE la protection, comme le verrou du média du
 * cycle 125, parce que c'est tout ce qu'un contexte dit de lui-même.
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
  context: contextUnderProtectionLock(params.context),
});

/**
 * Le contexte débarrassé de son chiffré quand la protection DÉCLARÉE n'est pas
 * le chiffrement — cf. {@link envelopeSurvivesProtectionLock}.
 *
 * Le champ est RETIRÉ plutôt que vidé : `createNotification` sert
 * `params.context.encryptedContent || ''` sur le fil, donc l'absence produit la
 * même chaîne vide qu'avant pour les trois clients, sans écrire de clé dans la
 * ligne persistée. Un contexte sans enveloppe traverse inchangé — pas d'objet
 * recopié pour rien sur le chemin nominal.
 */
const contextUnderProtectionLock = (context: NotificationContext): NotificationContext => {
  if (!context.encryptedContent) return context;
  if (envelopeSurvivesProtectionLock(context.notificationLocKey)) return context;

  const { encryptedContent: _retenu, ...sansEnveloppe } = context;
  return sansEnveloppe;
};

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
