import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { LienDePartage } from '@/lib/api/compte';
import { GLYPHE_LIEN, LIENS, NOUVEAU_LIEN, type Echeance } from '@/lib/contenu/liens';

import { adresseDuLien } from './contenu';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_LIENS, FEUILLE_DU_NOUVEAU_LIEN } from './liens-feuille';
import { carteVide } from './vue';

/**
 * L'ÉCRAN DES LIENS DE PARTAGE (`cible/links.png`, issue #4933).
 *
 * L'ADRESSE EST UN TEXTE, LA LIGNE EST UN LIEN — et les deux mènent à des
 * endroits DIFFÉRENTS, ce qui est délibéré. Le texte est ce que le lecteur
 * COLLE dans une conversation WhatsApp (`adresseDuLien`, site unique, déjà
 * employé par le tableau de bord) ; la ligne, elle, mène à la conversation du
 * lecteur dans l'interface connectée. `/chat/:lien` est la porte de l'INVITÉ :
 * y envoyer le membre lui ferait refaire une jonction qu'il a déjà faite. La
 * carte du tableau de bord tient déjà ce raisonnement ; cet écran ne l'invente
 * pas une seconde fois.
 *
 * QUAND LA PASSERELLE N'A PAS ÉTENDU LA CONVERSATION, LA LIGNE N'EST PAS UN
 * LIEN. Elle reste une ligne d'INFORMATION — l'adresse s'y lit et s'y copie —
 * plutôt qu'un lien mort (charte règle 7).
 *
 * « CRÉER » EST RENDU DEPUIS #5071, « COPIER » NE L'EST TOUJOURS PAS — et
 * c'est la MÊME règle qui décide des deux : un contrôle existe s'il a un effet.
 *
 *   - « Créer » ouvre `/links?nouveau`, une surimpression servie par le
 *     SERVEUR, qui POSTe vers `/links` et crée réellement le lien. Elle
 *     n'existait pas quand cet écran a été livré ; c'est ce qui a changé.
 *   - « Copier » exige le presse-papiers, donc du JavaScript, sur un écran qui
 *     en expédie zéro. Un bouton « Copier » qui ne copie pas est pire que son
 *     absence : le lecteur croit avoir copié et colle autre chose.
 *
 * L'adresse reste SÉLECTIONNABLE — c'est le chemin qui marche partout, y
 * compris sans JavaScript.
 *
 * UN LIEN FERMÉ RESTE, ET LE DIT. Le tableau de bord les écarte — un lien mort
 * peint sur l'accueil dirait qu'on peut encore le partager. Ici, c'est
 * l'inverse : cet écran est l'endroit où le lecteur apprend qu'un lien ne sert
 * plus. Le cacher se lirait comme une perte, pas comme une fermeture.
 */

export type EtatDesLiens = {
  readonly liens: readonly LienDePartage[];
  /** `meta.summary.activeLinks` — SERVI, jamais recompté sur la page. */
  readonly actifs: number;
  /** L'état d'adresse `?nouveau` : la feuille de création est-elle ouverte ? */
  readonly nouveau?: boolean;
  /** Ce que la soumission vient de faire, dit au retour de la redirection. */
  readonly avis?: 'cree' | null;
  /** Le refus de la passerelle, rendu TEL QUEL — jamais recomposé. */
  readonly motif?: string | null;
  /** Ce que le lecteur venait de taper, reposé après un refus. */
  readonly saisie?: SaisieDuLien;
};

/**
 * CE QUE LE FORMULAIRE REPOSE APRÈS UN REFUS. Perdre le nom d'une conversation
 * et six cases cochées parce qu'un champ a déplu est le défaut le plus cher
 * d'un formulaire — et il ne se voit qu'en refus, c'est-à-dire au pire moment.
 */
export type SaisieDuLien = {
  readonly conversation: string;
  readonly nom: string;
  readonly echeance: Echeance;
  readonly capacite: string;
  readonly permissions: ReadonlySet<string>;
};

export const CHAMPS_DU_NOUVEAU_LIEN = {
  conversation: 'conversation',
  nom: 'nom',
  echeance: 'echeance',
  capacite: 'capacite',
} as const;

/**
 * LES CINQ PERMISSIONS, ET LEUR CHAMP DE `createLinkSchema`. La clé est le nom
 * du champ côté PASSERELLE : le formulaire n'a pas de vocabulaire à lui, donc
 * personne n'a de table de correspondance à tenir à jour.
 */
export const PERMISSIONS_DU_LIEN = [
  { champ: 'allowAnonymousMessages', libelle: NOUVEAU_LIEN.ecrire, parDefaut: true },
  { champ: 'allowAnonymousImages', libelle: NOUVEAU_LIEN.images, parDefaut: true },
  { champ: 'allowAnonymousFiles', libelle: NOUVEAU_LIEN.fichiers, parDefaut: false },
  { champ: 'allowViewHistory', libelle: NOUVEAU_LIEN.historique, parDefaut: false },
  { champ: 'requireNickname', libelle: NOUVEAU_LIEN.pseudonyme, parDefaut: true },
] as const;

export const SAISIE_NEUVE: SaisieDuLien = {
  conversation: '',
  nom: '',
  echeance: 'semaine',
  capacite: '',
  permissions: new Set(PERMISSIONS_DU_LIEN.filter(({ parDefaut }) => parDefaut).map(({ champ }) => champ)),
};

/**
 * LA DATE D'ÉCHÉANCE, POSÉE PAR LE SERVEUR. `Intl` s'exécute ici, au rendu,
 * dans le fuseau du processus — l'écran n'ayant aucun JavaScript, il n'y a
 * personne pour la reposer chez le lecteur. Une date illisible ne rend rien
 * plutôt qu'« Invalid Date ».
 */
const jour = (iso: string | null): string | null => {
  if (iso === null) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
    instant,
  );
};

/**
 * CE QUE DIT LA SECONDE LIGNE. « Ont rejoint » d'abord — c'est le seul nombre
 * que la passerelle mesure —, puis la capacité et l'échéance quand le lien en
 * déclare. Rien n'est composé quand rien n'est servi : une ligne « 0 / 0 » sous
 * un lien sans borne serait une contrainte inventée.
 */
const meta = (lien: LienDePartage): readonly string[] => {
  const echeance = jour(lien.expireA);

  return [
    LIENS.ontRejoint(lien.utilisations),
    ...(lien.capacite === null ? [] : [LIENS.capacite(lien.utilisations, lien.capacite)]),
    ...(echeance === null ? [] : [LIENS.expire(echeance)]),
  ];
};

const dedans = (lien: LienDePartage): string =>
  `<span class="tuile" aria-hidden="true">${svgDuSprite(GLYPHE_LIEN)}</span>` +
  '<span class="dit">' +
  `<span class="adresse">${echappe(adresseDuLien(lien.identifiant))}</span>` +
  `<span class="meta">${meta(lien)
    .map((morceau) => `<span>${echappe(morceau)}</span>`)
    .join('')}</span>` +
  '</span>' +
  (lien.actif ? '' : `<span class="etat">${echappe(LIENS.ferme)}</span>`);

const ligne = (lien: LienDePartage): string => {
  const classe = `lien${lien.actif ? '' : ' ferme'}`;

  return lien.conversation === null
    ? `<li class="${classe}">${dedans(lien)}</li>`
    : `<li><a class="${classe}" href="/chats/${echappe(encodeURIComponent(lien.conversation))}">${dedans(lien)}</a></li>`;
};


/**
 * LA FEUILLE « NOUVEAU LIEN » — servie par le SERVEUR dans l'état
 * `/links?nouveau`, en `<dialog open data-retour>`.
 *
 * ELLE MARCHE ENTIÈRE SANS JAVASCRIPT, et sur cet écran il n'y en a AUCUN.
 * `/links` expédie 0 Ko de JS ; la feuille ne fait donc pas exception, elle est
 * la règle. Trois chemins la ferment, chacun un `<a href="/links">` : la croix,
 * le voile et la poignée. Le piège à focus vient d'`inert` sur le carnet — le
 * navigateur le donne gratuitement.
 *
 * ÉCHAP EST LA SEULE CHOSE QUI MANQUE, ET ELLE NE VAUT PAS UNE REQUÊTE.
 * `lib/realtime/plein-ecran.ts` élèverait ce `dialog[open][data-retour]` sans
 * qu'une ligne lui soit ajoutée — mais aucun module n'est servi ici, et en
 * charger un pour Échap seul coûterait un aller-retour sur une 3G rurale à un
 * écran qui n'en paie aucun. `data-retour` reste posé : le jour où `/links`
 * sert un module pour une AUTRE raison, l'élévation est gratuite. Ce n'est pas
 * une promesse non tenue — c'est une prise que rien n'occupe encore.
 *
 * LE CRITÈRE DE FIN INTERDIT LE CHAMP DÉCORATIF, et c'est ce qui décide de ce
 * qui est rendu ici : chaque case et chaque champ recouvre un champ de
 * `createLinkSchema` que la passerelle APPLIQUE. `allowedCountries` en est
 * absent — le schéma le déclare `CHAMP_PAYS_INERTE`.
 *
 * L'EXPIRATION EST UN GROUPE DE RADIOS, pas une saisie de date : trois choix
 * se décident d'un geste, et la date part calculée par le serveur — la seule
 * horloge que les deux bouts partagent.
 */
const nouveauLien = ({ saisie, motif }: { readonly saisie: SaisieDuLien; readonly motif: string | null }): string => {
  const coche = (champ: string, libelle: string): string =>
    `<label class="coche"><input type="checkbox" name="${champ}" value="1"${saisie.permissions.has(champ) ? ' checked' : ''}>${echappe(libelle)}</label>`;

  const echeance = (valeur: Echeance, libelle: string): string =>
    `<label class="coche"><input type="radio" name="${CHAMPS_DU_NOUVEAU_LIEN.echeance}" value="${valeur}"${saisie.echeance === valeur ? ' checked' : ''}>${echappe(libelle)}</label>`;

  return (
    `<a class="voile" href="/links" aria-label="${echappe(NOUVEAU_LIEN.fermer)}"></a>` +
    `<dialog class="nouveau-lien" open aria-modal="true" aria-labelledby="titre-du-lien" data-retour="/links">` +
    `<a class="poignee" href="/links" aria-label="${echappe(NOUVEAU_LIEN.fermer)}"></a>` +
    '<div class="tete">' +
    `<div class="dit"><h2 id="titre-du-lien">${echappe(NOUVEAU_LIEN.titre)}</h2></div>` +
    `<a class="fermer" href="/links" aria-label="${echappe(NOUVEAU_LIEN.fermer)}">${svgDuSprite('ph-x')}</a>` +
    '</div>' +
    (motif === null
      ? ''
      : `<p class="alerte" role="alert">${echappe(motif === '' ? NOUVEAU_LIEN.refuse : `${NOUVEAU_LIEN.refuse} ${motif}`)}</p>`) +
    '<form method="post">' +
    '<p class="champ">' +
    `<label for="l-conversation">${echappe(NOUVEAU_LIEN.conversation)}</label>` +
    `<input id="l-conversation" name="${CHAMPS_DU_NOUVEAU_LIEN.conversation}" type="text" required value="${echappe(saisie.conversation)}" autocomplete="off">` +
    `<span class="aide">${echappe(NOUVEAU_LIEN.conversationAide)}</span>` +
    '</p>' +
    '<p class="champ">' +
    `<label for="l-nom">${echappe(NOUVEAU_LIEN.nom)}</label>` +
    `<input id="l-nom" name="${CHAMPS_DU_NOUVEAU_LIEN.nom}" type="text" value="${echappe(saisie.nom)}" autocomplete="off">` +
    `<span class="aide">${echappe(NOUVEAU_LIEN.nomAide)}</span>` +
    '</p>' +
    '<fieldset class="groupe">' +
    `<legend>${echappe(NOUVEAU_LIEN.expiration)}</legend>` +
    echeance('jour', NOUVEAU_LIEN.jour) +
    echeance('semaine', NOUVEAU_LIEN.semaine) +
    echeance('jamais', NOUVEAU_LIEN.jamais) +
    '</fieldset>' +
    '<p class="champ">' +
    `<label for="l-capacite">${echappe(NOUVEAU_LIEN.capacite)}</label>` +
    `<input id="l-capacite" name="${CHAMPS_DU_NOUVEAU_LIEN.capacite}" type="number" min="1" inputmode="numeric" value="${echappe(saisie.capacite)}">` +
    `<span class="aide">${echappe(NOUVEAU_LIEN.capaciteAide)}</span>` +
    '</p>' +
    '<fieldset class="groupe">' +
    `<legend>${echappe(NOUVEAU_LIEN.anonymes)}</legend>` +
    PERMISSIONS_DU_LIEN.map(({ champ, libelle }) => coche(champ, libelle)).join('') +
    '</fieldset>' +
    `<p class="pied"><button type="submit" class="action primaire">${echappe(NOUVEAU_LIEN.creer)}</button></p>` +
    '</form>' +
    '</dialog>'
  );
};

const enTete = (actifs: number): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(LIENS.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(LIENS.titre)}</h1>` +
  (actifs === 0 ? '' : `<p class="sous">${echappe(LIENS.actifs(actifs))}</p>`) +
  '</div>' +
  `<a class="action discrete" href="/links?nouveau">${svgDuSprite('ph-plus')}${echappe(NOUVEAU_LIEN.ouvrir)}</a>` +
  '</header>';

const corps = ({ liens, actifs, avis }: EtatDesLiens): string =>
  '<main id="main-content" class="liens-ecran">' +
  enTete(actifs) +
  (avis === 'cree' ? `<p class="avis" role="status">${svgDuSprite('ph-check-circle')}${echappe(NOUVEAU_LIEN.cree)}</p>` : '') +
  (liens.length === 0
    ? carteVide({
        glyphe: GLYPHE_LIEN,
        titre: LIENS.vide,
        phrase: LIENS.videPrecision,
        action: { libelle: NOUVEAU_LIEN.ouvrir, href: '/links?nouveau' },
      })
    : `<ul class="liens" aria-label="${echappe(LIENS.liste)}">${liens.map(ligne).join('')}</ul>`) +
  '</main>';

/**
 * LA FEUILLE N'EST SERVIE QUE DANS SON ÉTAT, corps ET style. Un `/links`
 * ordinaire ne paie pas un octet de la surimpression — la même règle que
 * l'état `?media=` du fil (charte règle 7).
 *
 * LA SURIMPRESSION EST RENDUE AVANT LE CORPS, et le corps devient INERTE
 * derrière elle. L'ORDRE d'abord : peinte après une longue liste, elle
 * grandirait pendant que le document arrive (le CLS mesuré chez sa voisine).
 * L'ACCÈS ensuite : sans JavaScript il n'y a ni Échap ni piège à focus, et
 * `inert` est ce que le navigateur donne gratuitement — la première tabulation
 * atteint la croix, et le lecteur d'écran n'annonce plus une liste que rien ne
 * montre.
 */
export const documentDesLiens = (etat: EtatDesLiens): string => {
  const surimpression =
    etat.nouveau === true
      ? nouveauLien({ saisie: etat.saisie ?? SAISIE_NEUVE, motif: etat.motif ?? null })
      : '';

  return documentPleinEcran({
    titre: etat.nouveau === true ? NOUVEAU_LIEN.titre : LIENS.titre,
    description: etat.actifs === 0 ? LIENS.titre : LIENS.actifs(etat.actifs),
    corps:
      surimpression +
      (surimpression === '' ? corps(etat) : corps(etat).replace('<main ', '<main inert ')),
    feuille:
      FEUILLE_CONNECTEE +
      FEUILLE_DU_FIL +
      FEUILLE_DES_LIENS +
      (surimpression === '' ? '' : FEUILLE_DU_NOUVEAU_LIEN),
  });
};
