import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { Appel } from '@/lib/api/appels';
import { APPELS, classeDeLaTuile, duree, glypheDeLAppel } from '@/lib/contenu/appels';

import { FEUILLE_DES_APPELS } from './appels-feuille';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { carteVide, quand } from './vue';

/**
 * L'HISTORIQUE DES APPELS (`cible/calls.png`, matrice `#calls`, ordre 34).
 *
 * UN ÉCRAN DE CONSULTATION, SANS UNE LIGNE DE JAVASCRIPT. Ni module de
 * participation ni socket : c'est le critère même de la matrice (« le chunk
 * de /calls ne contient NI CallManager NI la pile WebRTC »), et il se tient
 * par CONSTRUCTION — `documentPleinEcran` n'est appelé ici avec AUCUN
 * `script`, contrairement au fil et à la boîte de notifications.
 *
 * LA LISTE EST ENTIÈREMENT SERVIE, DONC AUCUN ÉTAT DE CHARGEMENT N'EXISTE.
 * Le document qui part porte déjà les lignes : pas de spinner, pas de
 * squelette, rien à peindre après coup.
 *
 * CHAQUE LIGNE MÈNE AU FIL DE SA CONVERSATION (Q1 de la spécification) — la
 * ligne ENTIÈRE est un `<a>`, jamais un texte inerte à côté d'un chevron
 * décoratif : un contrôle existe s'il a un effet (charte règle 7), et
 * `/calls/:id` (callAudio) n'est pas une destination que la v3 sert.
 *
 * LA NATURE SE DIT EN TOUTES LETTRES, LA TEINTE CONFIRME. « Manqué »,
 * « Audio », « Vidéo » sont du texte dans `.meta` avant d'être une couleur de
 * tuile — même loi que les notifications et les contacts : un daltonien, un
 * lecteur d'écran et un écran au soleil lisent la même chose.
 *
 * AUCUNE PRÉSENCE. `peer.isOnline` n'est même pas projeté par
 * `lib/api/appels.ts` : la cible ne dessine aucune pastille, et une présence
 * non lue ne peut pas fuir dans un rendu distrait.
 */

export type EtatDesAppels = {
  readonly appels: readonly Appel[];
  readonly maintenant: number;
  /**
   * Le curseur de la page SUIVANTE, ou `null` — même patron que
   * `EtatDesNotifs.curseurSuivant` : `corps()` sert alors
   * `<a href="/calls?cursor=…">`, jamais un bouton sans cible (charte règle 7).
   */
  readonly curseurSuivant: string | null;
};

const enTete = (): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(APPELS.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(APPELS.titre)}</h1>` +
  `<p class="sous">${echappe(APPELS.sous)}</p>` +
  '</div>' +
  '</header>';

/**
 * LA MÉTA D'UNE LIGNE — trois parties jointes par « · », chacune omise quand
 * elle n'a rien à dire. Un manqué DIT « Manqué · entrant » (toujours entrant :
 * `deriveCallDirection` ne dérive `'missed'` que d'un appel REÇU, jamais
 * répondu) ; les autres disent leur médium puis leur durée — jamais leur sens
 * (la cible ne le montre pas pour un appel répondu).
 *
 * UN SORTANT `nonAbouti` (rejeté ou en échec, jamais décroché) REMPLACE sa
 * durée par `APPELS.nonAbouti` plutôt que de la laisser vide : `duree(0)`
 * rend `''`, la MÊME chaîne qu'un répondu de durée nulle produirait — sans ce
 * mot, « Audio · 13:02 » aurait pu dire l'un ou l'autre.
 */
const meta = (a: Appel, maintenant: number): string => {
  const instant = quand(a.debutA, maintenant);
  const parties =
    a.direction === 'missed'
      ? [APPELS.manque, APPELS.entrant, instant]
      : [a.video ? APPELS.video : APPELS.audio, a.nonAbouti ? APPELS.nonAbouti : duree(a.dureeSec), instant];
  return parties.filter((partie) => partie !== '').join(' · ');
};

const ligne = (a: Appel, maintenant: number): string =>
  `<li class="appel">` +
  `<a href="/chats/${echappe(a.conversationId)}">` +
  `<span class="tuile ${classeDeLaTuile(a.direction, a.video)}" aria-hidden="true">${svgDuSprite(glypheDeLAppel(a.direction, a.video))}</span>` +
  '<span class="dit">' +
  `<strong class="primaire">${echappe(a.titre)}</strong>` +
  `<span class="meta">${echappe(meta(a, maintenant))}</span>` +
  '</span>' +
  `<span class="chevron" aria-hidden="true">${svgDuSprite('ph-caret-right')}</span>` +
  '</a>' +
  '</li>';

/**
 * LE LIEN DE PAGE SUIVANTE — même patron que `plusAnciennes` de la boîte de
 * notifications : un `<a class="plus-ancien">`, dont la feuille est déjà
 * importée par ce document (`FEUILLE_DU_FIL`). Sans JavaScript, un
 * rechargement suffit.
 */
const plusAnciens = (curseurSuivant: string | null): string =>
  curseurSuivant === null
    ? ''
    : `<a class="plus-ancien action discrete" href="/calls?cursor=${echappe(encodeURIComponent(curseurSuivant))}">${echappe(APPELS.plusAnciens)}</a>`;

const corps = ({ appels, maintenant, curseurSuivant }: EtatDesAppels): string =>
  '<main id="main-content" class="appels-ecran">' +
  enTete() +
  (appels.length === 0
    ? carteVide({ glyphe: 'ph-phone', titre: APPELS.vide, phrase: APPELS.videPrecision })
    : `<ul class="appels" aria-label="${echappe(APPELS.liste)}">${appels
        .map((a) => ligne(a, maintenant))
        .join('')}</ul>${plusAnciens(curseurSuivant)}`) +
  '</main>';

export const documentDesAppels = (etat: EtatDesAppels): string =>
  documentPleinEcran({
    titre: APPELS.titre,
    description: APPELS.sous,
    corps: corps(etat),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_APPELS,
  });
