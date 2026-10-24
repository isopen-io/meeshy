/**
 * LES TÂCHES D'UN GATE TOURNENT N À LA FOIS, ET LEURS CONSTATS SORTENT DANS
 * L'ORDRE DES TÂCHES (#12622).
 *
 * `check-phone-frame` relevait ses trois téléphones, ses dix gabarits de
 * Progression et ses vingt et une landings un contexte après l'autre : 436 s
 * en CI, la tranche 1 des gardes navigateur finissant deux minutes après les
 * trois autres. Un navigateur sert plusieurs contextes à la fois ; seule la
 * limite garde la machine de la CI (4 cœurs) hors de la saturation, où les
 * relevés ralentiraient au lieu de se recouvrir.
 *
 * Chaque tâche reçoit SON `constate` : les échecs se rangent par tâche, puis
 * se concatènent dans l'ordre des tâches — la sortie d'un rouge ne dépend pas
 * de qui a fini le premier.
 */
export const runBounded = async (taches, limite) => {
  const constats = taches.map(() => []);
  let suivante = 0;
  const ouvrier = async () => {
    while (suivante < taches.length) {
      const i = suivante;
      suivante += 1;
      await taches[i]((vrai, quoi) => {
        if (!vrai) constats[i].push(quoi);
      });
    }
  };
  const ouvriers = Math.min(Math.max(1, limite), taches.length);
  await Promise.all(Array.from({ length: ouvriers }, ouvrier));
  return constats.flat();
};
