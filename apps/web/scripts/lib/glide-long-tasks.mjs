/**
 * UNE TÂCHE LONGUE ISOLÉE N'EST PAS LE TRAITEMENT SUR LE FIL PRINCIPAL (#20176).
 *
 * L'invariant de `check-calls-effects-perf.mjs` prouve une promesse : le
 * traitement de chaque image a quitté le fil principal, donc glisser le
 * carrousel des effets ne paie aucune tâche longue. La régression qu'il garde
 * a une signature : un coût PAR IMAGE, rejoué à 30 Hz, qui touche CHAQUE
 * glissé (sans GPU, ~40 ms par image : le fil principal est occupé en continu).
 *
 * Le zéro absolu rougissait pourtant sur UNE tâche de 61 ms dans UN glissé
 * sur treize, sur un diff purement Markdown (run 44877483959), et ni l'absence
 * de GPU ni quatre cœurs saturés ne la reproduisent : ce n'est pas la
 * signature de la régression. La règle juge donc la FORME :
 *
 *  - deux glissés touchés, ou deux tâches dans un même glissé ⇒ rouge : un
 *    coût qui revient n'est pas un accident de l'hôte ;
 *  - une tâche isolée de `ISOLATED_LONG_TASK_CEILING_MS` ou plus ⇒ rouge :
 *    100 ms, deux fois le plancher de 50 ms qui définit une tâche longue, c'est
 *    six images figées, un gel que l'utilisateur voit quelle qu'en soit la
 *    cause ;
 *  - une seule tâche, sous ce plafond, dans un seul glissé ⇒ tolérée, et
 *    NOMMÉE (glissé, décalage par rapport à son début, durée) pour que sa
 *    récurrence se lise dans les journaux au lieu de se relancer.
 */

export const ISOLATED_LONG_TASK_CEILING_MS = 100;

const overlaps = (task, glide) => task.start < glide.end && task.start + task.duration > glide.start;

export const glideLongTaskVerdict = ({ tasks, glides }) => {
  if (tasks === null) return { ok: false, tolerated: null, touched: [] };
  const touched = tasks.flatMap((task) => {
    const glide = glides.findIndex((candidate) => overlaps(task, candidate));
    return glide === -1 ? [] : [{ glide, offsetMs: Math.round(task.start - glides[glide].start), duration: Math.round(task.duration) }];
  });
  if (touched.length === 0) return { ok: true, tolerated: null, touched };
  const [only] = touched;
  const isolated = touched.length === 1 && only.duration < ISOLATED_LONG_TASK_CEILING_MS;
  return isolated ? { ok: true, tolerated: only, touched } : { ok: false, tolerated: null, touched };
};
