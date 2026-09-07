import { echappe } from '@/app/socle';
import { formeDePiece } from '@/lib/api/formes';
import type { MediaDeStory } from '@/lib/api/publication';

/**
 * LE MÉDIA D'UNE PUBLICATION, RENDU — le site UNIQUE, partagé par la story
 * (`app/(public)/partage-vue.ts`, qui sert aussi le réel et l'humeur) et le fil social
 * (`app/connecte/social-vue.ts`, #5031) : les deux servent les mêmes genres de
 * pièce, par la même table `formeDePiece`.
 *
 * IL VIT À LA RACINE DE `app/`, PAS DANS UN SEGMENT DE ROUTE. Il vivait dans
 * la vue de la story, où il n'avait qu'un lecteur ; l'y
 * laisser et l'importer depuis `app/connecte/` (un AUTRE segment d'App Router)
 * faisait planter `next start` en production — `TypeError: (c ?? …) is not
 * une function` dans le chunk assemblé pour `/feed`, alors que le même code
 * passait sans faute sous `ts-jest` (jsdom). App Router compile chaque segment
 * comme une frontière ; une fonction qu'un AUTRE segment importe doit vivre
 * HORS de tout segment, au même rang que `app/socle.ts` et
 * `app/actifs-inlines.ts`.
 *
 * Une image est rendue AVEC ses dimensions (le CLS est nul par construction,
 * § 12.6) ; une vidéo et un son restent en `preload="none"` — zéro octet avant
 * la pression. Un genre sans lecteur natif et sans image (un fichier) n'est
 * pas rendu : ni une story ni un post n'en portent, et fabriquer une affiche
 * pour un cas que la passerelle ne produit pas serait inventer.
 */
export const mediaHtml = (media: MediaDeStory, texte: string): string => {
  const alt = media.alt ?? texte;
  const dimensions =
    media.largeur === null || media.hauteur === null ? '' : ` width="${media.largeur}" height="${media.hauteur}"`;
  if (media.genre === 'image') return `<img src="${echappe(media.url)}" alt="${echappe(alt)}"${dimensions}/>`;
  const lecteur = formeDePiece(media.genre).lecteur;
  if (lecteur === null) return '';
  return `<${lecteur} controls preload="none" src="${echappe(media.url)}"></${lecteur}>`;
};
