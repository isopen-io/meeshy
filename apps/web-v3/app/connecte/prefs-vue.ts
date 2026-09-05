import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { BASCULES_DE_PREFS, PREFS, SECTIONS_DE_PREFS, type CleDePreference } from '@/lib/contenu/prefs-de-notif';

import { CHARGEUR_DE_PARTICIPATION } from './chargeur';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_PREFS } from './prefs-feuille';

/**
 * `/notifications/preferences` — LES TREIZE BASCULES DE NOTIFICATION
 * (`cible/notifPrefs.png`, issue #4899, spécification § 1, § 4 étape 3).
 *
 * UN CONTRÔLE EXISTE S'IL A UN EFFET, PAR LE MOYEN LE PLUS PAUVRE. Chaque
 * bascule est un `<form method="post">` vers la MÊME adresse — sans attribut
 * `action`, comme partout dans la v3 — portant `cle` et l'INVERSE de l'état
 * SERVI : un clic, même sans JavaScript, envoie exactement le geste voulu, et
 * la porte (`prefs-porte.ts`) le traite en Post/Redirect/Get. Le module de
 * participation (`lib/realtime/prefs.ts`) AMÉLIORE ce chemin — bascule
 * optimiste, réconciliation, rollback visible — il ne le remplace pas.
 *
 * LES FENTES DE STATUT SONT SERVIES MÊME VIDES, `hidden` quand muettes — la
 * loi de `liste-peinture.ts` et de `notifs-vue.ts` reprise ici : une région de
 * statut créée APRÈS coup n'est annoncée par aucun lecteur d'écran, et un
 * bandeau d'échec fabriqué à la volée ne serait pas repérable pour qui teste
 * son apparition.
 *
 * L'ÉTAT SE DIT, IL NE SE COLORE PAS SEULEMENT. Le commutateur porte
 * `role="switch"` et `aria-checked` — reflétant TOUJOURS ce que le serveur a
 * SERVI, jamais un espoir local — et le mot « Activé »/« Désactivé » voyage
 * dans un `<span class="hors-ecran">` : un lecteur d'écran, un daltonien et un
 * écran au soleil lisent la même chose.
 *
 * LA FENÊTRE « NE PAS DÉRANGER » EST UNE VALEUR, PAS UN FORMULAIRE. La planche
 * ne dessine qu'une bascule et l'intervalle affiché à côté (§ 9 question 2 de
 * la spécification) : aucun `<input type="time">` ici, l'édition est un
 * travail à part.
 */

export type EtatDesPrefs = {
  readonly reglages: Readonly<Record<CleDePreference, boolean>>;
  readonly dndStartTime: string;
  readonly dndEndTime: string;
  /** Non nul juste après la redirection du POST — le PRG dit ce qu'il a fait. */
  readonly regleAppliquee: CleDePreference | null;
  /** Vrai quand le POST (sans JS) a échoué — l'état affiché reste celui relu du serveur. */
  readonly echec: boolean;
  readonly tempsReel: { readonly module: string; readonly passerelle: string } | null;
};

const LIBELLE_PAR_CLE: Readonly<Record<CleDePreference, string>> = Object.fromEntries(
  BASCULES_DE_PREFS.map((b) => [b.cle, b.libelle]),
) as Record<CleDePreference, string>;

const enTete = (): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/notifications" aria-label="${echappe(PREFS.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(PREFS.titre)}</h1>` +
  `<p class="sous">${echappe(PREFS.sousTitre)}</p>` +
  '</div>' +
  '</header>';

const avis = (regleAppliquee: CleDePreference | null): string =>
  `<p class="avis" role="status"${regleAppliquee === null ? ' hidden' : ''}>${
    regleAppliquee === null ? '' : svgDuSprite('ph-check-circle') + echappe(PREFS.regle(LIBELLE_PAR_CLE[regleAppliquee]))
  }</p>`;

const echecBandeau = (echec: boolean): string =>
  `<p class="echec" role="alert"${echec ? '' : ' hidden'}>${echec ? svgDuSprite('ph-warning-circle') + echappe(PREFS.echec) : ''}</p>`;

/**
 * UNE RANGÉE — un commutateur qui porte lui-même son texte, sa piste et son
 * pouce (`aria-hidden`, la couleur CONFIRME l'état sans le PORTER). La rangée
 * DND gagne une seconde ligne, hors du formulaire : une VALEUR, jamais une
 * saisie.
 */
const ligneBascule = (
  b: { readonly cle: CleDePreference; readonly libelle: string },
  reglages: Readonly<Record<CleDePreference, boolean>>,
  fenetreDnd: string,
): string => {
  const etat = reglages[b.cle];
  return (
    '<li>' +
    '<form class="bascule" method="post">' +
    `<input type="hidden" name="cle" value="${echappe(b.cle)}">` +
    `<input type="hidden" name="valeur" value="${etat ? 'false' : 'true'}">` +
    `<button type="submit" class="commutateur" role="switch" aria-checked="${etat ? 'true' : 'false'}">` +
    `<span class="libelle">${echappe(b.libelle)}</span>` +
    `<span class="piste" aria-hidden="true"><span class="pouce"></span></span>` +
    `<span class="hors-ecran">${etat ? echappe(PREFS.activee) : echappe(PREFS.desactivee)}</span>` +
    '</button>' +
    '</form>' +
    (b.cle === 'dndEnabled' ? `<p class="fenetre">${echappe(fenetreDnd)}</p>` : '') +
    '</li>'
  );
};

const section = (
  s: { readonly titre: string; readonly bascules: readonly { readonly cle: CleDePreference; readonly libelle: string }[] },
  reglages: Readonly<Record<CleDePreference, boolean>>,
  fenetreDnd: string,
): string =>
  '<section class="groupe-prefs">' +
  `<h2>${echappe(s.titre)}</h2>` +
  `<ul class="bascules">${s.bascules.map((b) => ligneBascule(b, reglages, fenetreDnd)).join('')}</ul>` +
  '</section>';

const corps = (etat: EtatDesPrefs, participation: string): string =>
  `<main id="main-content" class="prefs-ecran"${participation}>` +
  enTete() +
  avis(etat.regleAppliquee) +
  echecBandeau(etat.echec) +
  SECTIONS_DE_PREFS.map((s) => section(s, etat.reglages, PREFS.fenetre(etat.dndStartTime, etat.dndEndTime))).join('') +
  '</main>';

export const documentDesPrefs = (etat: EtatDesPrefs): string =>
  documentPleinEcran({
    titre: PREFS.titre,
    description: PREFS.sousTitre,
    corps: corps(
      etat,
      etat.tempsReel === null
        ? ''
        : ` data-participation="prefs" data-module="${echappe(etat.tempsReel.module)}" data-passerelle="${echappe(etat.tempsReel.passerelle)}"`,
    ),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_PREFS,
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });
