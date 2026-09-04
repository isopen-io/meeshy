import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { Notification } from '@/lib/api/notifications';
import { ATTRIBUT_PAR_CONTEXTE, glypheDuGenre, GLYPHE_PAR_DEFAUT, NOTIFS, textesDeNotif, type CleDeContexte } from '@/lib/contenu/notifs';

import { CHARGEUR_DE_PARTICIPATION } from './chargeur';
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
 * de temps réel n'est jamais arrivé. Le direct l'AMÉLIORE (compteur optimiste,
 * événements `notification:read-bulk`), il ne le remplace pas : c'est la loi 4
 * de la charte — un contrôle existe s'il a un effet — tenue par le moyen le
 * plus pauvre, donc le plus sûr.
 *
 * CHAQUE FENTE EST SERVIE, MÊME VIDE — la loi de `liste-peinture.ts` portée
 * ici : le compteur de l'en-tête, « Tout lire », la région de statut, la carte
 * vide ET la liste existent toujours dans le document, cachés (`hidden`) quand
 * ils n'ont rien à dire. Le module de participation ne fait que remplir et
 * révéler ; une fente absente serait un nœud à FABRIQUER, et une région de
 * statut créée après coup n'est annoncée par aucun lecteur d'écran. Un contrôle
 * caché n'est pas un contrôle inerte : il n'est pas rendu.
 *
 * UNE NON-LUE SE DIT, ELLE NE SE COLORE PAS SEULEMENT. La pastille est
 * `aria-hidden`, et le mot « Non lue » voyage dans un `<span class="hors-ecran">`
 * : un lecteur d'écran, un daltonien et un écran au soleil lisent la même
 * chose. La couleur CONFIRME l'état, elle ne le PORTE pas.
 *
 * LE TEXTE VIENT DU SERVEUR, ENTIER. `title`, `subtitle` et `content` sont
 * servis localisés et résolus par le Prisme pour CE lecteur — cette vue les
 * rend par `textesDeNotif` (site unique, partagé avec la peinture du direct),
 * elle n'en compose aucun et n'en re-résout aucun. Une phrase fabriquée ici à
 * partir du genre divergerait de la bannière poussée sur le téléphone du même
 * lecteur (cycle 122).
 *
 * LA LIGNE PORTE CE QUE LE PRÉDICAT DE MASSE RELIT (`data-id`, `data-genre`,
 * `data-creee`, les attributs de `ATTRIBUT_PAR_CONTEXTE`) : un
 * `notification:read-bulk` se rejoue sur le document, jamais par un refetch.
 */

/** Ce que le document porte pour son module de participation (§ 12.4). */
export type TempsReelDesNotifs = {
  readonly module: string;
  readonly socket: string;
  readonly passerelle: string;
};

export type EtatDesNotifs = {
  readonly notifications: readonly Notification[];
  readonly nonLues: number;
  readonly maintenant: number;
  /** Vrai au retour du POST « tout lire » : l'action DIT ce qu'elle a fait. */
  readonly toutLu: boolean;
  readonly tempsReel: TempsReelDesNotifs | null;
};

const enTete = (nonLues: number): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(NOTIFS.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(NOTIFS.titre)}</h1>` +
  `<p class="sous"${nonLues === 0 ? ' hidden' : ''}>${nonLues === 0 ? '' : echappe(NOTIFS.nonLues(nonLues))}</p>` +
  '</div>' +
  '</header>';

/**
 * Le formulaire poste vers la MÊME adresse — pas d'attribut `action`. Écrire
 * `/notifications` en dur y ajouterait un second endroit à corriger le jour où
 * l'écran déménage, pour aucun gain : le défaut du navigateur EST l'adresse
 * courante, et il suit la route quoi qu'il arrive.
 */
const toutLire = (nonLues: number): string =>
  `<form class="tout-lire" method="post"${nonLues === 0 ? ' hidden' : ''}>` +
  `<button type="submit" class="action discrete">${svgDuSprite('ph-checks')}${echappe(NOTIFS.toutLire)}</button>` +
  '</form>';

/**
 * LA VOIX DE L'ÉCRAN — servie même muette : une région de statut créée après
 * coup n'est annoncée par aucun lecteur d'écran. Le POST la remplit au retour ;
 * le module du direct y dit l'action optimiste et son éventuel refus.
 */
const avis = (toutLu: boolean): string =>
  `<p class="avis" role="status"${toutLu ? '' : ' hidden'}>${
    toutLu ? svgDuSprite('ph-check-circle') + echappe(NOTIFS.toutLuFait) : ''
  }</p>`;

const attributsDeContexte = (n: Notification): string =>
  (Object.keys(ATTRIBUT_PAR_CONTEXTE) as readonly CleDeContexte[])
    .map((cle) => {
      const valeur = n.contexte[cle];
      return valeur === undefined ? '' : ` ${ATTRIBUT_PAR_CONTEXTE[cle]}="${echappe(valeur)}"`;
    })
    .join('');

/**
 * UNE LIGNE. Les textes viennent de `textesDeNotif` (site unique) ; la pastille
 * et le mot « Non lue » sont servis pour toute ligne non lue, et c'est le
 * module qui les CACHE quand un autre appareil lit la ligne — les retirer
 * l'obligerait à les refabriquer.
 */
const ligne = (n: Notification, maintenant: number): string => {
  const { primaire, secondaire } = textesDeNotif(n);
  const instant = quand(n.creeeA, maintenant);

  return (
    `<li class="notif${n.lue ? '' : ' non-lue'}" data-id="${echappe(n.id)}" data-genre="${echappe(n.genre)}"` +
    (n.creeeA === null ? '' : ` data-creee="${echappe(n.creeeA)}"`) +
    attributsDeContexte(n) +
    '>' +
    `<span class="vignette" aria-hidden="true">${svgDuSprite(glypheDuGenre(n.genre))}</span>` +
    '<span class="dit">' +
    `<span class="primaire">${echappe(primaire)}</span>` +
    (secondaire === null ? '' : `<span class="secondaire">${echappe(secondaire)}</span>`) +
    (instant === '' ? '' : `<span class="instant">${echappe(instant)}</span>`) +
    '</span>' +
    (n.lue
      ? ''
      : `<span class="pastille" aria-hidden="true"></span><span class="hors-ecran">${echappe(NOTIFS.nonLue)}</span>`) +
    '</li>'
  );
};

/**
 * LE GABARIT D'UNE LIGNE NEUVE — ce que la peinture du direct CLONE quand
 * `notification:new` arrive (`lib/realtime/notifs-peinture.ts`). Le glyphe est
 * la cloche : les tracés du sprite sont inlinés par le serveur, et un module de
 * navigateur n'en compose pas ; la peinture lui substitue celui d'une ligne
 * existante du même genre quand il y en a une.
 */
const gabarit = (): string =>
  '<template id="gabarit-notif">' +
  '<li class="notif non-lue" data-id="" data-genre="">' +
  `<span class="vignette" aria-hidden="true">${svgDuSprite(GLYPHE_PAR_DEFAUT)}</span>` +
  '<span class="dit">' +
  '<span class="primaire"></span>' +
  '<span class="secondaire" hidden></span>' +
  '<span class="instant" hidden></span>' +
  '</span>' +
  `<span class="pastille" aria-hidden="true"></span><span class="hors-ecran">${echappe(NOTIFS.nonLue)}</span>` +
  '</li>' +
  '</template>';

const corps = ({ notifications, nonLues, maintenant, toutLu }: EtatDesNotifs, participation: string): string =>
  `<main id="main-content" class="notifs-ecran" data-nonlues="${nonLues}"${participation}>` +
  enTete(nonLues) +
  avis(toutLu) +
  toutLire(nonLues) +
  `<div class="vide-des-notifs"${notifications.length === 0 ? '' : ' hidden'}>${carteVide({
    glyphe: 'ph-bell',
    titre: NOTIFS.vide,
    phrase: NOTIFS.videPrecision,
  })}</div>` +
  `<ul class="notifs" aria-label="${echappe(NOTIFS.liste)}"${notifications.length === 0 ? ' hidden' : ''}>${notifications
    .map((n) => ligne(n, maintenant))
    .join('')}</ul>` +
  gabarit() +
  '</main>';

export const documentDesNotifs = (etat: EtatDesNotifs): string =>
  documentPleinEcran({
    titre: NOTIFS.titre,
    description: etat.nonLues === 0 ? NOTIFS.titre : NOTIFS.nonLues(etat.nonLues),
    corps: corps(
      etat,
      etat.tempsReel === null
        ? ''
        : ` data-participation="notifs" data-module="${echappe(etat.tempsReel.module)}" data-socket="${echappe(
            etat.tempsReel.socket,
          )}" data-passerelle="${echappe(etat.tempsReel.passerelle)}"`,
    ),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_NOTIFS,
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });
