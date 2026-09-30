import type { MascotLine } from '@meeshy/shared/utils/mascot';

import { ACHIEVEMENT_COPY } from './progression';

/**
 * CE QUE DIT LA MASCOTTE (#8907) — une phrase par ligne de la loi partagée
 * (`@meeshy/shared/utils/mascot`), au tutoiement : la mascotte est une
 * compagne, pas l'institution.
 *
 * Même dette que `meesh-copy.ts` : l'écran Progression n'appelle pas encore
 * `translate()`, cette copie est donc en français seul ; l'accord passe par
 * `Intl.PluralRules`, pour que le jour du catalogue la bascule soit déjà au
 * bon endroit.
 */

const REGLE_FR = new Intl.PluralRules('fr-FR');

const points = (count: number): string => (REGLE_FR.select(count) === 'one' ? `${count} point` : `${count} points`);

export function mascotSay(line: MascotLine): string {
  switch (line.kind) {
    case 'meesh-minted':
      return `Tchak ! Une Meesh toute neuve. Tu en as ${line.balance}.`;
    case 'level-up':
      return `Niveau ${line.level} ! On fête ça.`;
    case 'achievement':
      return `Succès débloqué : ${ACHIEVEMENT_COPY[line.key].title} !`;
    case 'can-mint':
      return `Tes points sont prêts : on frappe une Meesh pour ${points(line.mintCost)} ?`;
    case 'first-step':
      return 'Salut, je suis Mee ! Envoie ton premier message et je compte tes points.';
    case 'streak':
      return `${line.days} jours d’affilée, continue comme ça !`;
    case 'meesh-missing':
      return `Encore ${points(line.missing)} et je frappe ta prochaine Meesh.`;
    case 'level-missing':
      return `Encore ${points(line.missing)} avant le niveau ${line.nextLevel}.`;
    case 'top-level':
      return 'Tu es au sommet. Bravo !';
  }
}
