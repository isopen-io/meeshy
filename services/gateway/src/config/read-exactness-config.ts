/**
 * Armement du suivi exact de lecture.
 *
 * Le passage de « lu = fenêtre temporelle » à « lu = réellement affiché » rend
 * les accusés de lecture nettement moins nombreux et empêche le badge de
 * non-lus de se vider à la simple ouverture d'une conversation. C'est l'effet
 * recherché, mais c'est un changement visible par tous les utilisateurs.
 *
 * Sur ce dépôt, pousser sur `main` déclenche le déploiement : la bascule ne
 * doit donc PAS suivre la livraison du code. Elle est armée à part, par la
 * variable d'environnement `EXACT_READ_TRACKING_SINCE`, ce qui permet de
 * choisir le moment — et de revenir en arrière sans redéployer.
 *
 * @see docs/superpowers/specs/2026-07-24-read-exactness-design.md
 */

import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'read-exactness-config' });

const ENV_KEY = 'EXACT_READ_TRACKING_SINCE';

/**
 * Date à partir de laquelle un message sans `readAt` figé est réputé NON lu.
 *
 * `null` — variable absente, vide ou illisible — conserve le repli sur le
 * curseur, donc le comportement historique à l'identique. Une valeur illisible
 * ne doit jamais armer la bascule par accident : le repli est le seul défaut sûr.
 *
 * Mémoïsé sur la valeur BRUTE de la variable, pas au premier appel : les
 * chemins de lecture l'interrogent une fois par participant et par message, et
 * re-parser une date à chaque itération serait gratuit mais inutile. Indexer le
 * cache sur la chaîne d'origine préserve la possibilité de changer d'avis sans
 * redémarrer le service.
 */
let cachedRaw: string | undefined;
let cachedCutover: Date | null = null;

export function getExactReadTrackingCutover(): Date | null {
  const raw = process.env[ENV_KEY];

  if (raw === cachedRaw) return cachedCutover;
  cachedRaw = raw;

  if (!raw) {
    cachedCutover = null;
    return cachedCutover;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    logger.warn(
      `[read-exactness] ${ENV_KEY} illisible ("${raw}") — suivi exact NON armé, repli curseur conservé`
    );
    cachedCutover = null;
    return cachedCutover;
  }

  cachedCutover = parsed;
  return cachedCutover;
}
