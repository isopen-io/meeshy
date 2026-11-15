/**
 * Ce qui s'exécute APRÈS que la réponse est partie (#5216).
 *
 * ## Le défaut que ce module ferme
 *
 * L'inscription faisait ATTENDRE la personne pendant quatre travaux dont aucun
 * n'a d'effet sur la réponse : la géolocalisation de l'IP (jusqu'à trois
 * secondes, un appel HTTP vers un tiers), l'envoi de l'e-mail de vérification,
 * l'avis d'arrivée dans le salon global, et le décompte de ses membres. Le
 * compte est créé et le jeton émis bien avant ; ce qui reste ne fait que
 * retenir l'écran de chargement.
 *
 * **Une lenteur est un BUG, pas une dette** (dimension 2) : un écran qui attend
 * un tiers alors qu'il a déjà tout ce qu'il doit rendre n'est pas « un peu
 * lent », il est en panne de conception.
 *
 * ## Pourquoi c'est un PARAMÈTRE injectable
 *
 * Un différé rend le témoin non déterministe : la suite se termine avant que la
 * tâche ne parte, et l'assertion mesure alors le vide. Les tests injectent donc
 * un exécuteur IMMÉDIAT, ce qui leur rend le déterminisme sans les faire
 * mesurer un ordonnancement qu'ils ne contrôlent pas — et ce qui les empêche,
 * surtout, d'attester un travail que la production ne ferait pas.
 *
 * ## La garde obligatoire
 *
 * Une promesse DÉTACHÉE dont le rejet n'a pas d'écouteur termine le PROCESS
 * sous le `--unhandled-rejections=throw` par défaut de Node 22 (§ « Critical
 * Gotchas » du `CLAUDE.md` de ce service, leçon 230). Toute la passerelle
 * tomberait pour un e-mail non parti. Le `.catch` n'est donc pas une précaution
 * du site d'appel : il est ICI, dans le seul endroit d'où la promesse part,
 * pour qu'aucun appelant n'ait à s'en souvenir.
 *
 * @module utils/after-response
 */

import { enhancedLogger } from './logger-enhanced.js';

const logger = enhancedLogger.child({ module: 'AfterResponse' });

/**
 * Programme une tâche « best-effort » à exécuter une fois la réponse rendue.
 * `label` nomme la tâche dans le journal — sans lui, un échec différé est une
 * pile sans contexte.
 */
export type AfterResponse = (task: () => Promise<void>, label: string) => void;

/**
 * L'exécuteur par DÉFAUT : `setImmediate`, donc après le tour de boucle qui
 * écrit la réponse, et jamais de rejet non géré.
 */
export const deferAfterResponse: AfterResponse = (task, label) => {
  setImmediate(() => {
    // `void` DÉTACHE la promesse : le `try/catch` d'un appelant n'attraperait
    // que le `throw` synchrone de `task()`, jamais son rejet. Les deux gardes
    // sont disjointes, et les deux sont ici.
    try {
      void task().catch((error: unknown) => {
        logger.warn('tâche post-réponse échouée', {
          label,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    } catch (error) {
      logger.warn('tâche post-réponse impossible à démarrer', {
        label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
};
