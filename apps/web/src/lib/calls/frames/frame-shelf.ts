import type { FrameStudio } from './frame-studio';

/**
 * **L'ÉTAGÈRE DES AMBIANCES** (#10169, LC, § 5.10.7) — retirer une ambiance
 * cache sa PUCE, jamais son CADRE. L'atelier étagé ne restreint que ce qu'il
 * PROPOSE (`moods`, `framesOf`, et le défaut que rend `reconcile`) aux
 * ambiances installées ; `find` résout toujours sur le catalogue connu : le
 * cadre qu'un pair a choisi, ou mémorisé dans une ambiance retirée, se peint.
 *
 * `null` = étagère INCONNUE (ancien serveur, invité, panne) : rien ne se cache.
 * Un décorateur pur sur l'atelier, sans rien en importer (les lois de portée, c'est l'atelier qui les prête) : le chunk
 * `call_frame_studio` ne grossit pas, et tout ce que l'atelier porte (peinture,
 * libellés d'usage, polices) passe intact.
 *
 * `reconcile` reste celui de l'atelier, puis rend `null` si son choix tombe
 * dans une ambiance retirée : le même motif, puis la même ambiance, y seraient
 * retirés aussi — l'hôte retombe alors sur un classique.
 */
export function shelvedStudio(studio: FrameStudio, shelf: readonly string[] | null): FrameStudio {
  if (shelf === null) return studio;
  const installed = new Set<string>(shelf);
  const shelved: Omit<FrameStudio, 'hidesBeyondSpotlight' | 'scopeShowing'> = {
    ...studio,
    moods: (people, scope) => studio.moods(people, scope).filter((mood) => installed.has(mood)),
    framesOf: (people, mood, scope) => (installed.has(mood) ? studio.framesOf(people, mood, scope) : []),
    reconcile: (id, people) => {
      const reconciled = studio.reconcile(id, people);
      return reconciled !== null && installed.has(reconciled.mood) ? reconciled : null;
    },
  };
  return { ...shelved, ...studio.scopeLaws(shelved) };
}
