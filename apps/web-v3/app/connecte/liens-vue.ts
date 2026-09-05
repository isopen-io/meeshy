import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { LienDePartage } from '@/lib/api/compte';
import { FERMETURE, GLYPHE_LIEN, LIENS, NOUVEAU_LIEN } from '@/lib/contenu/liens';

import { adresseDuLien } from './contenu';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { CHARGEUR_DE_PARTICIPATION } from './chargeur';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_LIENS, FEUILLE_DU_NOUVEAU_LIEN } from './liens-feuille';
import { nouveauLien, SAISIE_NEUVE, type SaisieDuLien } from './nouveau-lien-vue';
import { carteVide } from './vue';

/**
 * `CHAMPS_DU_NOUVEAU_LIEN`, `PERMISSIONS_DU_LIEN`, `SAISIE_NEUVE`, `SaisieDuLien`
 * et `nouveauLien` vivent désormais dans `./nouveau-lien-vue` (#5034) : la
 * feuille a un SECOND hôte, le fil du membre (`/chats/:cle?lien`), et un
 * module à deux hôtes ne recopie ni son rendu ni son vocabulaire de champs.
 * Ré-exportés ici pour les lecteurs historiques de cet écran.
 */
export { CHAMPS_DU_NOUVEAU_LIEN, PERMISSIONS_DU_LIEN, SAISIE_NEUVE, type SaisieDuLien } from './nouveau-lien-vue';

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
 *
 * ON LE FERME DEPUIS ICI, DEPUIS #4933. Chaque ligne ACTIVE porte un menu
 * (`<details class="actions">`, l'atome `MENU_DE_LIGNE` partagé avec `/chats`)
 * dont l'unique geste POSTe `{ geste: 'fermer', lien: <linkId> }` — sans
 * `action`, donc vers `/links` lui-même, comme la feuille de création. Une
 * ligne FERMÉE n'a AUCUN menu : il n'y a plus rien à y faire (règle 11, « un
 * contrôle existe s'il a un effet »).
 */

export type EtatDesLiens = {
  readonly liens: readonly LienDePartage[];
  /** `meta.summary.activeLinks` — SERVI, jamais recompté sur la page. */
  readonly actifs: number;
  /** L'état d'adresse `?nouveau` : la feuille de création est-elle ouverte ? */
  readonly nouveau?: boolean;
  /** Ce que la soumission vient de faire, dit au retour de la redirection (PRG). */
  readonly avis?: 'cree' | 'ferme' | null;
  /** Le refus de la passerelle À LA CRÉATION, rendu TEL QUEL — jamais recomposé. */
  readonly motif?: string | null;
  /**
   * LE REFUS DE LA PASSERELLE À LA FERMETURE (#4933) — distinct de `motif`
   * (celui de la feuille de création) : ils ne sont jamais servis ensemble, et
   * les confondre ferait porter le motif d'un geste sur l'écran de l'autre.
   * `null` : aucun refus à dire. Rendu dans `#carnet`, `role="alert"`.
   */
  readonly refusFermeture?: string | null;
  /** Ce que le lecteur venait de taper, reposé après un refus. */
  readonly saisie?: SaisieDuLien;
  /** Ce que le document porte pour son module (§ 12.4, #5090) — même origine, aucune passerelle. */
  readonly tempsReel: { readonly module: string } | null;
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

/**
 * LA PASTILLE « FERMÉ » EST UNE FENTE SERVIE, MUETTE SUR UNE LIGNE ACTIVE
 * (#4933, patron `reserve: true` de `liste-vue.ts`) — jamais un nœud que le
 * module compose.
 *
 * Elle l'était : `marqueFerme` créait le `<span class="etat">` et l'appendait
 * DANS `.dit`, quand le serveur le pose en FRÈRE de `.dit`. `.lien .dit` est
 * un `flex-direction:column` (`liens-feuille.ts:55`) : la même pastille y
 * tombait sur une TROISIÈME ligne, pleine largeur, au lieu du bout de rangée
 * où le rechargement la remet. Un état optimiste doit être l'état confirmé —
 * sinon la ligne SAUTE quand la passerelle répond, et l'optimisme se voit.
 */
const dedans = (lien: LienDePartage): string =>
  `<span class="tuile" aria-hidden="true">${svgDuSprite(GLYPHE_LIEN)}</span>` +
  '<span class="dit">' +
  `<span class="adresse">${echappe(adresseDuLien(lien.identifiant))}</span>` +
  `<span class="meta">${meta(lien)
    .map((morceau) => `<span>${echappe(morceau)}</span>`)
    .join('')}</span>` +
  '</span>' +
  `<span class="etat"${lien.actif ? ' hidden' : ''}>${echappe(LIENS.ferme)}</span>`;

/**
 * LE MENU DE FERMETURE (#4933) — un `<details class="actions">`, l'atome
 * `MENU_DE_LIGNE` partagé avec `/chats`, jamais posé sur une ligne FERMÉE :
 * il n'y a plus rien à y faire (règle 11).
 *
 * LE `<form>` N'A PAS D'`action` : sans elle, le défaut du navigateur est
 * l'adresse COURANTE — `/links` —, la même route que la création. La porte
 * distingue les deux par le champ `geste`, présent ici et absent là-bas.
 */
const menu = (lien: LienDePartage): string =>
  '<details class="actions">' +
  `<summary>${svgDuSprite('ph-caret-down')}<span class="hors-ecran">${echappe(FERMETURE.menu(lien.nom))}</span></summary>` +
  '<form method="post">' +
  '<input type="hidden" name="geste" value="fermer">' +
  `<input type="hidden" name="lien" value="${echappe(lien.identifiant)}">` +
  `<p class="aide">${echappe(FERMETURE.aide)}</p>` +
  `<button type="submit" class="grave">${echappe(FERMETURE.geste)}</button>` +
  '</form>' +
  '</details>';

/**
 * UN `<form>` NE VIT JAMAIS DANS UN `<a>` (HTML invalide, et le clic sur
 * « Fermer ce lien » ouvrirait la conversation au passage) : le menu est donc
 * le FRÈRE du `.lien`, tous deux enfants du `<li class="ligne-lien">` qui
 * porte l'identifiant — la même géométrie que `liste-vue.ts` › `ligne()`.
 */
const ligne = (lien: LienDePartage): string => {
  const classe = `lien${lien.actif ? '' : ' ferme'}`;
  const interieur =
    lien.conversation === null
      ? `<span class="${classe}">${dedans(lien)}</span>`
      : `<a class="${classe}" href="/chats/${echappe(encodeURIComponent(lien.conversation))}">${dedans(lien)}</a>`;

  return (
    `<li class="ligne-lien${lien.actif ? '' : ' ferme'}" data-lien="${echappe(lien.identifiant)}">` +
    interieur +
    (lien.actif ? menu(lien) : '') +
    '</li>'
  );
};


/**
 * LA FEUILLE « NOUVEAU LIEN » — servie par le SERVEUR dans l'état
 * `/links?nouveau`, en `<dialog open data-retour>`. Sa géométrie et son
 * balisage vivent dans `nouveauLien()` (`./nouveau-lien-vue`, #5034) : cet
 * hôte est le PREMIER des DEUX qui la servent, `/links?nouveau` — la
 * conversation n'y est pas encore choisie, elle se SAISIT (`conversationVerrouillee`
 * omis) ; le second, le fil du membre (`?lien`), la sert déjà VERROUILLÉE.
 *
 * ELLE MARCHE ENTIÈRE SANS JAVASCRIPT, et sur cet écran il n'y en a AUCUN.
 * `/links` expédie 0 Ko de JS. Trois chemins la ferment, chacun un
 * `<a href="/links">` : la croix, le voile et la poignée. Le piège à focus
 * vient d'`inert` sur le carnet — le navigateur le donne gratuitement.
 *
 * ÉCHAP EST LA SEULE CHOSE QUI MANQUE ICI, ET ELLE NE VAUT PAS UNE REQUÊTE.
 * `lib/realtime/plein-ecran.ts` élèverait ce `dialog[open][data-retour]` sans
 * qu'une ligne lui soit ajoutée — mais aucun module n'est servi ici, et en
 * charger un pour Échap seul coûterait un aller-retour sur une 3G rurale à un
 * écran qui n'en paie aucun. `data-retour` reste posé : le jour où `/links`
 * sert un module pour une AUTRE raison, l'élévation est gratuite.
 */

const enTete = (actifs: number): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/" aria-label="${echappe(LIENS.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(LIENS.titre)}</h1>` +
  (actifs === 0 ? '' : `<p class="sous">${echappe(LIENS.actifs(actifs))}</p>`) +
  '</div>' +
  `<a class="action discrete" href="/links?nouveau">${svgDuSprite('ph-plus')}${echappe(NOUVEAU_LIEN.ouvrir)}</a>` +
  '</header>';

/**
 * LA RÉGION QUE LE MODULE ÉCHANGE (#5090) — l'avis ET le carnet, ensemble :
 * le document redemandé après une création OU une fermeture porte les deux,
 * et les échanger d'un bloc fait dire à la région de statut ce que la liste
 * vient de gagner ou de perdre.
 *
 * DEUX AVIS DE SUCCÈS (`role="status"`), UN AVIS DE REFUS (`role="alert"`) —
 * jamais les deux premiers ensemble (`avis` est une clé unique), et le refus
 * de fermeture ne redirige PAS : la ligne visée reste sous les yeux du
 * lecteur, sans qu'un PRG ne la fasse défiler hors champ.
 *
 * L'ALERTE EST TOUJOURS SERVIE, MUETTE QUAND IL N'Y A RIEN À DIRE — la voix du
 * module, comme `.avis-feuille` l'est pour la feuille de création. Une région
 * `role="alert"` doit exister dans le document AVANT qu'on n'y écrive : celle
 * qu'un script insère avec son texte n'est annoncée par aucun lecteur d'écran
 * de façon fiable, et le module aurait dû la COMPOSER — un second site de
 * balisage pour un message que le serveur écrit déjà.
 */
const corps = ({ liens, actifs, avis, refusFermeture }: EtatDesLiens, participation: string): string =>
  `<main id="main-content" class="liens-ecran"${participation}>` +
  enTete(actifs) +
  '<div id="carnet">' +
  (avis === 'cree' ? `<p class="avis" role="status">${svgDuSprite('ph-check-circle')}${echappe(NOUVEAU_LIEN.cree)}</p>` : '') +
  (avis === 'ferme' ? `<p class="avis" role="status">${svgDuSprite('ph-check-circle')}${echappe(FERMETURE.fait)}</p>` : '') +
  `<p class="avis alerte" role="alert"${refusFermeture === null || refusFermeture === undefined ? ' hidden' : ''}>` +
  svgDuSprite('ph-warning-circle') +
  `<span class="motif">${
    refusFermeture === null || refusFermeture === undefined
      ? ''
      : echappe(refusFermeture === '' ? FERMETURE.refuse : `${FERMETURE.refuse} ${refusFermeture}`)
  }</span>` +
  '</p>' +
  (liens.length === 0
    ? carteVide({
        glyphe: GLYPHE_LIEN,
        titre: LIENS.vide,
        phrase: LIENS.videPrecision,
        action: { libelle: NOUVEAU_LIEN.ouvrir, href: '/links?nouveau' },
      })
    : `<ul class="liens" aria-label="${echappe(LIENS.liste)}">${liens.map(ligne).join('')}</ul>`) +
  '</div>' +
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
      ? nouveauLien({ saisie: etat.saisie ?? SAISIE_NEUVE, motif: etat.motif ?? null, retour: '/links' })
      : '';

  const participation =
    etat.tempsReel === null
      ? ''
      : ` data-participation="liens" data-module="${echappe(etat.tempsReel.module)}"`;

  return documentPleinEcran({
    titre: etat.nouveau === true ? NOUVEAU_LIEN.titre : LIENS.titre,
    description: etat.actifs === 0 ? LIENS.titre : LIENS.actifs(etat.actifs),
    corps:
      surimpression +
      (surimpression === ''
        ? corps(etat, participation)
        : corps(etat, participation).replace('<main ', '<main inert ')),
    feuille:
      FEUILLE_CONNECTEE +
      FEUILLE_DU_FIL +
      FEUILLE_DES_LIENS +
      (surimpression === '' ? '' : FEUILLE_DU_NOUVEAU_LIEN),
    script: etat.tempsReel === null ? '' : CHARGEUR_DE_PARTICIPATION,
  });
};
