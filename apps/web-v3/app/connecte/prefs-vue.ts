import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { BASCULES_DE_PREFS, FUSEAUX_DND, FUSEAU_AUTO, PREFS, SECTIONS_DE_PREFS, type CleDePreference } from '@/lib/contenu/prefs-de-notif';

import { bandeau } from './bandeau-vue';
import { CHARGEUR_DE_PARTICIPATION } from './chargeur';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_PREFS } from './prefs-feuille';
import { commutateur } from './reglages-socle';

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

/**
 * `'fenetre-dnd'`, `'push-abonne'`, `'push-desabonne'` — les sentinelles de la
 * RÈGLE APPLIQUÉE quand le geste réglé n'est pas une des treize bascules. Le
 * push (#5391) porte DEUX sentinelles, pas une : « abonnement activé » et
 * « abonnement retiré » ne sont pas le même message, et rien d'autre que le
 * geste effectué ne le dit (§ 3.2 de la spécification).
 */
export type RegleAppliquee = CleDePreference | 'fenetre-dnd' | 'push-abonne' | 'push-desabonne' | null;

/**
 * L'ÉTAT DU PUSH WEB (#5391) — SERVI, jamais peint depuis un espoir local :
 * `abonne`/`non-abonne` viennent de `GET /users/me/devices` filtré par
 * `deviceId`/`platform`/`isActive` (§ 3.2 de la spécification) ;
 * `indisponible` couvre l'absence de configuration Firebase CÔTÉ SERVEUR
 * (déploiement sans les variables `NEXT_PUBLIC_FIREBASE_*`) — le navigateur
 * SANS Push API est une indisponibilité que seul le CLIENT peut mesurer,
 * dégradée par `lib/realtime/push-abonnement.ts` sans jamais désactiver la
 * rangée depuis le serveur.
 */
export type EtatPushAppareil = {
  readonly etat: 'abonne' | 'non-abonne' | 'indisponible';
  readonly motif: string | null;
  readonly deviceId: string | null;
  readonly configuration: ConfigurationFirebase | null;
};

/**
 * LA CONFIGURATION FIREBASE PUBLIQUE — les MÊMES noms d'environnement que le
 * legacy (`apps/web/firebase-config.ts:27-61`), jamais une jumelle de
 * nommage. `baseInstallations`/`baseRegistrations` sont les DEUX bases REST
 * du protocole SDK réécrit à la main (§ 0, § 2.5 de la spécification) —
 * paramétrées pour que les témoins e2e les pointent vers le bouchon.
 */
export type ConfigurationFirebase = {
  readonly apiKey: string;
  readonly projectId: string;
  readonly appId: string;
  readonly vapid: string;
  readonly baseInstallations: string;
  readonly baseRegistrations: string;
};

export type EtatDesPrefs = {
  readonly reglages: Readonly<Record<CleDePreference, boolean>>;
  readonly dndStartTime: string;
  readonly dndEndTime: string;
  readonly dndUtcOffsetMinutes: number;
  /**
   * LE DÉCALAGE MESURÉ DE L'APPAREIL, en minutes à ajouter à UTC — `null`
   * quand le cookie de fuseau n'est pas là (`app/session.ts` ›
   * `fuseauDuLecteur`). Il ne PEINT pas la sélection : il NOMME ce que
   * l'option « cet appareil » écrira, et la porte écrit exactement ça.
   */
  readonly decalageDeLAppareil: number | null;
  /** Non nul juste après la redirection du POST — le PRG dit ce qu'il a fait. */
  readonly regleAppliquee: RegleAppliquee;
  /** Vrai quand le POST (sans JS) a échoué — l'état affiché reste celui relu du serveur. */
  readonly echec: boolean;
  /**
   * LE MOTIF NOMMÉ DU REFUS, quand la porte en connaît un (une heure hors
   * format, § du geste `fenetre`). `null` ⇒ le motif générique `PREFS.echec` :
   * « réessayez » est juste pour un réseau coupé et faux pour une saisie que
   * réessayer à l'identique refusera pareil.
   */
  readonly motif: string | null;
  readonly tempsReel: { readonly module: string; readonly passerelle: string } | null;
  /** L'ABONNEMENT PUSH DE CET APPAREIL (#5391) — voir `EtatPushAppareil` ci-dessus. */
  readonly push: EtatPushAppareil;
};

const CHEMIN = '/notifications/preferences';

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

const messageDeLAvis = (regleAppliquee: Exclude<RegleAppliquee, null>): string => {
  if (regleAppliquee === 'fenetre-dnd') return PREFS.fenetreRegle;
  if (regleAppliquee === 'push-abonne') return PREFS.push.regleAbonne;
  if (regleAppliquee === 'push-desabonne') return PREFS.push.regleDesabonne;
  return PREFS.regle(LIBELLE_PAR_CLE[regleAppliquee]);
};

const avis = (regleAppliquee: RegleAppliquee): string =>
  `<p class="avis" role="status"${regleAppliquee === null ? ' hidden' : ''}>${
    regleAppliquee === null ? '' : svgDuSprite('ph-check-circle') + echappe(messageDeLAvis(regleAppliquee))
  }</p>`;

const echecBandeau = (echec: boolean, motif: string | null): string =>
  `<p class="echec" role="alert"${echec ? '' : ' hidden'}>${
    echec ? svgDuSprite('ph-warning-circle') + echappe(motif ?? PREFS.echec) : ''
  }</p>`;

/**
 * SERVI CACHÉ, COMME LES BANDEAUX DIFFÉRÉS DU FIL — un 401 en cours de
 * session (jeton expiré ENTRE le chargement de l'écran et une bascule) n'a
 * pas d'autre fenêtre où naître : la loi tient même si `etat.tempsReel` est
 * `null`, exactement comme `avis`/`echecBandeau` ci-dessus, jamais devenu un
 * nœud construit après coup.
 */
const sessionExpireeBandeau = (): string =>
  bandeau({
    classe: 'attention',
    identifiant: 'bandeau-session-expiree',
    role: 'alert',
    glyphe: 'ph-warning-circle',
    titre: PREFS.bandeauSessionExpiree.titre,
    corps: PREFS.bandeauSessionExpiree.corps,
    action: { libelle: PREFS.bandeauSessionExpiree.action, href: `/login?returnUrl=${encodeURIComponent(CHEMIN)}` },
    cache: true,
  });

/**
 * UNE RANGÉE — le commutateur PARTAGÉ (`reglages-socle.ts`), avec la valeur
 * qu'un lecteur d'écran annonce. La rangée DND gagne une seconde ligne, hors
 * du formulaire de bascule : une VALEUR affichée, puis SON édition (§ 12.10,
 * ce lot) dans un `<details>` distinct — deux formulaires, deux gestes.
 */
const ligneBascule = (
  b: { readonly cle: CleDePreference; readonly libelle: string },
  reglages: Readonly<Record<CleDePreference, boolean>>,
  fenetreDnd: string,
): string =>
  commutateur({
    cle: b.cle,
    libelle: b.libelle,
    actif: reglages[b.cle],
    libelleActif: PREFS.activee,
    libelleInactif: PREFS.desactivee,
    apres: b.cle === 'dndEnabled' ? `<p class="fenetre">${echappe(fenetreDnd)}</p>` : '',
  });

/**
 * L'ÉDITION DE LA PLAGE — un `<details>` fermé par défaut (la VALEUR au repos
 * suffit à la lecture courante), qui s'ouvre sur DEUX `<input type="time">`
 * et un `<select>` de fuseau FERMÉ (`FUSEAUX_DND`, § 3 témoins 7 et 8 de la
 * spécification). `fuseau=auto` est le choix par défaut : il ne pose AUCUN
 * `dndUtcOffsetMinutes` au corps posté, la valeur stockée survit.
 */
const optionDeFuseau = (fuseau: { readonly valeur: string; readonly libelle: string }, actuel: number): string =>
  `<option value="${echappe(fuseau.valeur)}"${Number(fuseau.valeur) === actuel ? ' selected' : ''}>${echappe(fuseau.libelle)}</option>`;

const formulaireDeLaFenetre = (
  etat: Pick<EtatDesPrefs, 'dndStartTime' | 'dndEndTime' | 'dndUtcOffsetMinutes' | 'decalageDeLAppareil'>,
): string =>
  '<details class="fenetre-edition">' +
  `<summary>${echappe(PREFS.fenetreModifier)}</summary>` +
  '<form method="post">' +
  '<input type="hidden" name="geste" value="fenetre">' +
  '<div class="champ">' +
  `<label for="dnd-debut">${echappe(PREFS.fenetreDebut)}</label>` +
  `<input type="time" id="dnd-debut" name="dndStartTime" value="${echappe(etat.dndStartTime)}" required>` +
  '</div>' +
  '<div class="champ">' +
  `<label for="dnd-fin">${echappe(PREFS.fenetreFin)}</label>` +
  `<input type="time" id="dnd-fin" name="dndEndTime" value="${echappe(etat.dndEndTime)}" required>` +
  '</div>' +
  '<div class="champ">' +
  `<label for="dnd-fuseau">${echappe(PREFS.fenetreFuseau)}</label>` +
  `<select id="dnd-fuseau" name="fuseau">` +
  `<option value="${FUSEAU_AUTO}">${echappe(PREFS.fenetreFuseauAuto(etat.decalageDeLAppareil))}</option>` +
  FUSEAUX_DND.map((fuseau) => optionDeFuseau(fuseau, etat.dndUtcOffsetMinutes)).join('') +
  '</select>' +
  '</div>' +
  `<button type="submit" class="action primaire">${echappe(PREFS.fenetreEnregistrer)}</button>` +
  '</form>' +
  '</details>';

const section = (
  s: { readonly titre: string; readonly bascules: readonly { readonly cle: CleDePreference; readonly libelle: string }[] },
  etat: EtatDesPrefs,
): string =>
  '<section class="groupe-prefs">' +
  `<h2>${echappe(s.titre)}</h2>` +
  `<ul class="bascules">${s.bascules
    .map((b) => ligneBascule(b, etat.reglages, PREFS.fenetre(etat.dndStartTime, etat.dndEndTime)))
    .join('')}</ul>` +
  (s.bascules.some((b) => b.cle === 'dndEnabled') ? formulaireDeLaFenetre(etat) : '') +
  '</section>';

/**
 * LA RANGÉE « SUR CET APPAREIL » (#5391) — PAS une quatorzième entrée de
 * `SECTIONS_DE_PREFS` : un geste `push` distinct (`name="geste" value="push"`),
 * jamais `name="cle"` — l'abonnement vit sur le NAVIGATEUR, pas dans les
 * treize colonnes de `NotificationPreference`. Même famille visuelle que
 * `commutateur()` (classes `commutateur`/`piste`/`pouce`/`hors-ecran`), un
 * markup PROPRE plutôt qu'un partage forcé : `commutateur()` grave
 * `name="cle"` en dur, et cette rangée n'a pas de `cle`.
 *
 * `abonnement` ET `deviceId` sont des champs CACHÉS VIDES au repos — c'est le
 * module de participation (`lib/realtime/push-abonnement.ts`) qui les
 * REMPLIT juste avant que la soumission native parte (§ 3.4 de la
 * spécification). Sans JavaScript, `abonnement` reste vide : la porte le lit
 * et sert le motif « exige JavaScript », JAMAIS un appel à la passerelle.
 */
const rangeePush = (push: EtatPushAppareil): string => {
  const abonne = push.etat === 'abonne';
  const indisponible = push.etat === 'indisponible';
  const libelleEtat = abonne ? PREFS.push.abonne : indisponible ? PREFS.push.indisponible : PREFS.push.nonAbonne;
  const detail = indisponible && push.motif !== null ? push.motif : PREFS.push.detailCorps;
  return (
    '<section class="groupe-prefs groupe-push">' +
    `<h2>${echappe(PREFS.push.titreSection)}</h2>` +
    '<ul class="bascules">' +
    '<li>' +
    '<form class="bascule-push" method="post">' +
    '<input type="hidden" name="geste" value="push">' +
    `<input type="hidden" name="valeur" value="${abonne ? 'false' : 'true'}">` +
    '<input type="hidden" name="abonnement" value="">' +
    `<input type="hidden" name="deviceId" value="${echappe(push.deviceId ?? '')}">` +
    `<button type="submit" class="commutateur" role="switch" aria-checked="${abonne ? 'true' : 'false'}"${indisponible ? ' disabled' : ''}>` +
    `<span class="libelle">${echappe(PREFS.push.libelle)}</span>` +
    '<span class="piste" aria-hidden="true"><span class="pouce"></span></span>' +
    `<span class="hors-ecran">${echappe(libelleEtat)}</span>` +
    '</button>' +
    '</form>' +
    '<details class="push-detail">' +
    `<summary>${echappe(PREFS.push.detailResume)}</summary>` +
    `<p>${echappe(detail)}</p>` +
    '</details>' +
    '</li>' +
    '</ul>' +
    '</section>'
  );
};

const corps = (etat: EtatDesPrefs, participation: string): string =>
  `<main id="main-content" class="prefs-ecran"${participation}>` +
  enTete() +
  avis(etat.regleAppliquee) +
  echecBandeau(etat.echec, etat.motif) +
  sessionExpireeBandeau() +
  SECTIONS_DE_PREFS.map((s) => section(s, etat)).join('') +
  rangeePush(etat.push) +
  '</main>';

/**
 * LES ATTRIBUTS `data-firebase-*` — servis SEULEMENT quand le déploiement a
 * les quatre variables (§ 3.4 de la spécification) : leur absence est ce qui
 * fait naître `push.configuration` à `null`, et c'est CE `null` qui empêche
 * le module de s'armer (`lib/realtime/push-abonnement.ts`) — jamais un
 * second test côté client des mêmes variables.
 */
const attributsFirebase = (configuration: ConfigurationFirebase | null): string =>
  configuration === null
    ? ''
    : ` data-firebase-api-key="${echappe(configuration.apiKey)}" data-firebase-project-id="${echappe(configuration.projectId)}" data-firebase-app-id="${echappe(configuration.appId)}" data-firebase-vapid="${echappe(configuration.vapid)}" data-fcm-installations-base="${echappe(configuration.baseInstallations)}" data-fcm-registrations-base="${echappe(configuration.baseRegistrations)}"`;

export const documentDesPrefs = (etat: EtatDesPrefs): string =>
  documentPleinEcran({
    titre: PREFS.titre,
    description: PREFS.sousTitre,
    corps: corps(
      etat,
      (etat.tempsReel === null
        ? ''
        : ` data-participation="prefs" data-module="${echappe(etat.tempsReel.module)}" data-passerelle="${echappe(etat.tempsReel.passerelle)}"`) +
        attributsFirebase(etat.push.configuration),
    ),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_PREFS,
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });
