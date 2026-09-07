import { documentDeMessage } from '@/app/enveloppe/vue';
import { FEUILLE_CONNECTEE } from '@/app/connecte/feuille';

import { REELS_DU_FIL } from '@/lib/contenu/reels';

/**
 * LE FIL DE RÉELS N'A RIEN À MONTRER — un état DESSINÉ (charte règle 18), pas
 * un écran blanc et pas une erreur.
 *
 * IL ARRIVE DEUX FOIS, ET C'EST LA MÊME PAGE. Un compte neuf n'a encore aucun
 * réel à découvrir ; un lecteur qui a parcouru la file entière arrive au bout.
 * Les distinguer demanderait de savoir si le curseur a servi — une information
 * que l'écran a (`?cursor=`), mais qui ne change RIEN à ce qu'il propose : dans
 * les deux cas, ce qui manque est du contenu à regarder, et les deux portes
 * ouvertes sont les mêmes.
 *
 * `documentDeMessage` est le gabarit des écrans sans contenu de la zone — le
 * même que l'indisponible d'une story et la panne du tableau de bord. Un
 * huitième bloc écrit à la main aurait divergé au premier changement de charte.
 */
export const documentSansReel = (): string =>
  documentDeMessage({
    titre: REELS_DU_FIL.videTitre,
    paragraphes: [REELS_DU_FIL.videCorps],
    actions: [
      { libelle: REELS_DU_FIL.versLeFil, href: '/feed', glyphe: 'ph-squares-four' },
      { libelle: REELS_DU_FIL.versLAccueil, href: '/', ton: 'contour' },
    ],
    feuille: FEUILLE_CONNECTEE,
    robots: 'noindex, nofollow',
    retour: true,
  });
