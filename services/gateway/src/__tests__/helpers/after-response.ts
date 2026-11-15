/**
 * Un exécuteur post-réponse DÉTERMINISTE pour les témoins (#5216).
 *
 * La production diffère ses travaux best-effort par `setImmediate`
 * (`utils/after-response.ts`) : une suite qui assert sur l'un d'eux mesurerait
 * le vide, la tâche n'étant pas encore partie. L'exécuteur ci-dessous la
 * démarre TOUT DE SUITE et RETIENT sa promesse, ce qui donne au témoin deux
 * choses que `setImmediate` lui refuse : le déterminisme, et la possibilité
 * d'attendre la fin de la tâche avant d'asserter.
 *
 * Il enregistre aussi les LIBELLÉS, parce que « quel travail a été différé ? »
 * est en soi une question de contrat : le message système du salon global ne
 * doit pas retenir la réponse, et un lot qui le remettrait en ligne doit faire
 * rougir quelque chose.
 *
 * @module __tests__/helpers/after-response
 */

import type { AfterResponse } from '../../utils/after-response';

export type ExecuteurDeTemoin = {
  /** À injecter là où la production attend un `AfterResponse`. */
  readonly afterResponse: AfterResponse;
  /** Les libellés des tâches programmées, dans l'ordre. */
  readonly labels: string[];
  /** Attend la fin de toutes les tâches démarrées jusqu'ici. */
  readonly settle: () => Promise<void>;
};

export function executeurImmediat(): ExecuteurDeTemoin {
  const labels: string[] = [];
  const enCours: Array<Promise<unknown>> = [];

  const afterResponse: AfterResponse = (task, label) => {
    labels.push(label);
    // Une tâche qui LÈVE synchroniquement ne doit pas faire échouer l'appelant
    // — c'est le contrat de la production, et un témoin qui ne le reproduit pas
    // atteste une robustesse absente.
    try {
      enCours.push(task().catch(() => undefined));
    } catch {
      enCours.push(Promise.resolve());
    }
  };

  return {
    afterResponse,
    labels,
    settle: async () => {
      await Promise.all([...enCours]);
    },
  };
}
