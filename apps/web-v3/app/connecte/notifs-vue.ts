import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { Notification } from '@/lib/api/notifications';
import { glypheDuGenre, NOTIFS } from '@/lib/contenu/notifs';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_NOTIFS } from './notifs-feuille';
import { carteVide, quand } from './vue';

/**
 * LA BOÎTE DE NOTIFICATIONS (`cible/notifs.png`, issue #4898).
 *
 * « TOUT LIRE » A UN EFFET SANS UNE LIGNE DE JAVASCRIPT. La cible dessine
 * l'action ; dans le legacy elle n'en a aucun. Ici c'est un `<form
 * method="post">` vers la MÊME adresse, que la route traite en
 * Post/Redirect/Get — le chemin qui marche partout, y compris quand le module
 * de temps réel n'est jamais arrivé. Le direct viendra l'AMÉLIORER (compteur
 * optimiste, événements `notification:read-bulk`), il ne le remplacera pas :
 * c'est la loi 4 de la charte — un contrôle existe s'il a un effet — tenue par
 * le moyen le plus pauvre, donc le plus sûr.
 *
 * L'ACTION NE SE REND PAS QUAND ELLE NE FERAIT RIEN. Zéro non-lue ⇒ pas de
 * bouton : un contrôle qui ne change rien est un mensonge poli, et le lecteur
 * qui le touche apprend seulement qu'il ne sert à rien.
 *
 * UNE NON-LUE SE DIT, ELLE NE SE COLORE PAS SEULEMENT. La pastille est
 * `aria-hidden`, et le mot « Non lue » voyage dans un `<span class="hors-ecran">`
 * : un lecteur d'écran, un daltonien et un écran au soleil lisent la même
 * chose. La couleur CONFIRME l'état, elle ne le PORTE pas.
 *
 * LE TEXTE VIENT DU SERVEUR, ENTIER. `title`, `subtitle` et `content` sont
 * servis localisés et résolus par le Prisme pour CE lecteur — cette vue les
 * rend, elle n'en compose aucun et n'en re-résout aucun. Une phrase fabriquée
 * ici à partir du genre divergerait de la bannière poussée sur le téléphone du
 * même lecteur (cycle 122).
 */

export type EtatDesNotifs = {
  readonly notifications: readonly Notification[];
  readonly nonLues: number;
  readonly maintenant: number;
  /** Vrai au retour du POST « tout lire » : l'action DIT ce qu'elle a fait. */
  readonly toutLu: boolean;
};

const enTete = (nonLues: number): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(NOTIFS.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(NOTIFS.titre)}</h1>` +
  (nonLues === 0 ? '' : `<p class="sous">${echappe(NOTIFS.nonLues(nonLues))}</p>`) +
  '</div>' +
  '</header>';

/**
 * Le formulaire poste vers la MÊME adresse — pas d'attribut `action`. Écrire
 * `/notifications` en dur y ajouterait un second endroit à corriger le jour où
 * l'écran déménage, pour aucun gain : le défaut du navigateur EST l'adresse
 * courante, et il suit la route quoi qu'il arrive.
 */
const toutLire = (nonLues: number): string =>
  nonLues === 0
    ? ''
    : '<form class="tout-lire" method="post">' +
      `<button type="submit" class="action discrete">${svgDuSprite('ph-checks')}${echappe(NOTIFS.toutLire)}</button>` +
      '</form>';

const avis = (toutLu: boolean): string =>
  toutLu
    ? `<p class="avis" role="status">${svgDuSprite('ph-check-circle')}${echappe(NOTIFS.toutLuFait)}</p>`
    : '';

/**
 * UNE LIGNE. Le titre servi est le texte primaire ; le corps le suit quand il
 * en diffère — une notification dont le titre EST le contenu ne le dirait pas
 * deux fois.
 */
const ligne = (n: Notification, maintenant: number): string => {
  const secondaire = n.sousTitre ?? (n.corps === n.titre ? null : n.corps);
  const instant = quand(n.creeeA, maintenant);

  return (
    `<li class="notif${n.lue ? '' : ' non-lue'}" data-genre="${echappe(n.genre)}">` +
    `<span class="vignette" aria-hidden="true">${svgDuSprite(glypheDuGenre(n.genre))}</span>` +
    '<span class="dit">' +
    `<span class="primaire">${echappe(n.titre ?? n.corps ?? n.nomDeLActeur ?? NOTIFS.titre)}</span>` +
    (secondaire === null ? '' : `<span class="secondaire">${echappe(secondaire)}</span>`) +
    (instant === '' ? '' : `<span class="instant">${echappe(instant)}</span>`) +
    '</span>' +
    (n.lue
      ? ''
      : `<span class="pastille" aria-hidden="true"></span><span class="hors-ecran">${echappe(NOTIFS.nonLue)}</span>`) +
    '</li>'
  );
};

const corps = ({ notifications, nonLues, maintenant, toutLu }: EtatDesNotifs): string =>
  '<main id="main-content" class="notifs-ecran">' +
  enTete(nonLues) +
  avis(toutLu) +
  toutLire(nonLues) +
  (notifications.length === 0
    ? carteVide({ glyphe: 'ph-bell', titre: NOTIFS.vide, phrase: NOTIFS.videPrecision })
    : `<ul class="notifs" aria-label="${echappe(NOTIFS.liste)}">${notifications
        .map((n) => ligne(n, maintenant))
        .join('')}</ul>`) +
  '</main>';

export const documentDesNotifs = (etat: EtatDesNotifs): string =>
  documentPleinEcran({
    titre: NOTIFS.titre,
    description: etat.nonLues === 0 ? NOTIFS.titre : NOTIFS.nonLues(etat.nonLues),
    corps: corps(etat),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_NOTIFS,
  });
