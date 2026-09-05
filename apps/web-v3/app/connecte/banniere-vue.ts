import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';

import { BANNIERE } from '@/lib/contenu/banniere';

/**
 * LA RÉGION DE LA BANNIÈRE — SERVIE VIDE par le document, jamais créée par le
 * module (#4454).
 *
 * **UNE RÉGION `aria-live` CRÉÉE APRÈS COUP N'EST ANNONCÉE PAR AUCUN LECTEUR
 * D'ÉCRAN.** Le navigateur ne surveille que les régions qui existaient quand il
 * a construit l'arbre d'accessibilité : un module qui insérerait son `<output>`
 * au moment de peindre produirait un toast que voit l'œil et que personne
 * n'entend. C'est la même raison qui fait servir muette la voix des gestes
 * (`.voix-du-geste`, #5090) — et c'est un fait de plateforme, pas une
 * précaution.
 *
 * `<output>` PLUTÔT QU'UN `<div role="status">` : HTML lui donne déjà ce rôle
 * et la politesse qui va avec. Un rôle explicite serait une seconde déclaration
 * de ce que l'élément EST.
 *
 * ELLE COÛTE ENVIRON CENT OCTETS AUX DEUX ÉCRANS QUI LA SERVENT, et rien aux
 * autres : le tableau de bord, le composer et les réglages ne la portent pas —
 * ils n'ont pas de socket, donc jamais rien à y peindre (charte règle 7).
 */
export const REGION_DE_LA_BANNIERE =
  `<output class="banniere" aria-label="${echappe(BANNIERE.region)}" hidden>` +
  '<span class="banniere-dit">' +
  '<span class="banniere-titre"></span>' +
  '<span class="banniere-corps" hidden></span>' +
  '</span>' +
  '<span class="banniere-reaction" aria-hidden="true" hidden></span>' +
  `<button type="button" class="banniere-fermer" aria-label="${echappe(BANNIERE.fermer)}">` +
  `${svgDuSprite('ph-x')}</button>` +
  '</output>';
