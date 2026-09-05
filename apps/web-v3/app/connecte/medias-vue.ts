import { svgDuSprite } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { echappe } from '@/app/socle';
import { adresseDuRetourDuPlein } from '@/lib/api/adresses-du-fil';
import { formeDePiece, GENRES_DE_PIECE, sEcouteSurPlace, type GenreDePiece } from '@/lib/api/formes';
import type { PieceJointe } from '@/lib/api/fil';
import { adresseDesMedias, adresseDuPleinDeLaGalerie, type Galerie, type Media } from '@/lib/api/medias';
import { FIL } from '@/lib/contenu/fil';
import { MEDIAS } from '@/lib/contenu/medias';
import { metaDePiece } from '@/lib/poids';

import { CHARGEUR_DE_PARTICIPATION, type TempsReel } from './chargeur';
import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_MEDIAS } from './medias-feuille';
import { FEUILLE_DU_PLEIN } from './plein-feuille';
import { aFiche, ficheDePiece, gesteDePiece, pieceEnPlein, pleinEcran } from './plein-vue';
import { blocDeTranscription } from './transcrit';
import { carteVide } from './vue';

/**
 * LA GALERIE DES MÉDIAS D'UNE CONVERSATION (`cible/media.png`, issue #4525) —
 * on la parcourt, on l'ouvre, et **le poids de chaque pièce est annoncé avant
 * qu'un octet ne parte**.
 *
 * ZÉRO OCTET DE MÉDIA À L'OUVERTURE DE LA GRILLE. La grille ne rend AUCUNE
 * `<img>` et AUCUNE `<video>` : une tuile est un `<a>` au glyphe de son genre,
 * sous lequel son poids (et sa durée quand elle en a une) est écrit. C'est la
 * décision qui porte l'écran : « très faible consommation de données » se joue
 * ici, et une grille de 48 vignettes qui précharge est le contraire de la
 * mission. La cible dessine cette tuile-là — celle qui annonce « ↓ 420 Ko » —,
 * et cet écran n'en connaît pas d'autre, puisque rien n'y est jamais préchargé.
 *
 * LE CLS EST NUL PAR CONSTRUCTION, et pas par un `width`/`height` : chaque
 * tuile est un carré (`aspect-ratio:1`) dont la boîte est connue avant tout
 * réseau. Le § 8.5 demande des vignettes dimensionnées ; la règle est tenue
 * par un moyen plus fort que celui qu'elle nomme — il n'y a pas d'image à
 * dimensionner.
 *
 * UNE TUILE OUVRE LE MÊME PLEIN ÉCRAN QUE LE FIL (#4525, #5024 point 2, § 4
 * étape 3). Le tap sur une image ou une vidéo mène à l'état `?media=<pièce>`
 * de CETTE adresse — la tranche `?genre=&avant=` conservée, jamais `?autour=`,
 * qui n'a pas de sens ici : la pièce est cherchée dans la galerie SERVIE, pas
 * dans une tranche nommée par un message. La surimpression rendue est CELLE DU
 * FIL (`app/connecte/plein-vue.ts`), le site UNIQUE de son balisage — un
 * second visionneur écrit ici serait la jumelle que la charte interdit
 * (leçon 465). `gesteDePiece`, `aFiche` et `ficheDePiece` viennent du même
 * site, pour la même raison.
 *
 * UN VOCAL N'EST PAS UNE TUILE. La cible le dessine en lecteur pleine largeur,
 * avec sa durée et son Prisme (« Transcrit · yo → fr ») : il porte du TEXTE,
 * que la grille doit pouvoir servir. C'est le `<details>` du fil, au balisage
 * près (`app/connecte/fil-lignes.ts`), et sa transcription est rendue par le
 * site UNIQUE de ce bloc (`app/connecte/transcrit.ts`) — `preload="none"`,
 * donc zéro octet avant la pression. Il porte sa FICHE dans les mêmes
 * conditions que la ligne du fil : la transcription entière, en plein écran.
 *
 * LES PUCES FILTRENT VRAIMENT. La cible en dessine quatre ; elles y sont
 * inertes. Ici elles sont des liens vers la MÊME adresse avec `?genre=`, la
 * puce active se déclare (`aria-current="page"`), et une cinquième — « Tous » —
 * ouvre la vue sans filtre : sans elle, la première puce touchée serait un
 * piège dont on ne revient pas (charte règle 7, « un contrôle existe s'il a un
 * effet », et son corollaire : il doit avoir un retour).
 *
 * LA PORTE EST CELLE DU MEMBRE, et elle seule. L'invité lit sa conversation à
 * `/chat/:lien` — une adresse UNIQUE par décision du porteur (« aucun
 * `/chat/:lien/…` pour lire ») : lui ouvrir la galerie demanderait une seconde
 * adresse sous ce préfixe, ce que la directive du 2026-09-01 interdit. Rien
 * n'est donc rendu chez lui : l'en-tête de son fil ne porte pas le lien
 * (charte règle 7). C'est une décision produit à rouvrir, pas un oubli.
 */

export type EtatDesMedias = {
  /** Le segment de l'adresse — l'identifiant de base ou l'identifiant lisible, tel que le lecteur l'a reçu. */
  readonly cle: string;
  readonly titre: string;
  readonly galerie: Galerie;
  /** L'identifiant du message le plus ancien servi : la page précédente existe (curseur `?avant=`). */
  readonly plusAncien: string | null;
  /**
   * Le curseur `?avant=` DEMANDÉ — la tranche SERVIE. Sans lui, la tuile d'une
   * page d'historique renverrait la première page (le défaut du § 12.10.1 :
   * « la porte re-servait la tranche par défaut »). `null` sur la première
   * page — REQUIS, jamais optionnel : un champ qu'on peut omettre laisse un
   * hôte perdre la tranche EN SILENCE, ce qui est exactement le défaut que ce
   * champ existe pour empêcher.
   */
  readonly avant: string | null;
  /** `?media=<pièce>` — l'état plein écran, résolu contre `galerie.medias`. */
  readonly plein: string | null;
  /**
   * Ce qu'un module de participation doit savoir pour se charger — ici, UN
   * appel : `prendsLePleinEcran()`, qui donne à la surimpression servie le
   * voile, le piège à focus et Échap, comme sur le fil et la liste (défaut
   * trouvé en revue : Échap ne fermait rien ici, `data-retour` n'ayant aucun
   * lecteur). La galerie n'a ni composeur ni socket : son module
   * (`lib/realtime/plein.ts`) est le plus léger des neuf.
   */
  readonly tempsReel: TempsReel;
};

const enTete = ({ cle, titre, galerie }: EtatDesMedias): string =>
  '<header class="fil-tete">' +
  `<a class="retour" href="/chats/${echappe(encodeURIComponent(cle))}" aria-label="${echappe(MEDIAS.retour)}">${svgDuSprite('ph-caret-left')}</a>` +
  '<div class="titre">' +
  `<h1>${echappe(MEDIAS.titre)}</h1>` +
  `<p class="sous">${echappe(`${titre} · ${MEDIAS.elements(galerie.total)}`)}</p>` +
  '</div>' +
  '</header>';

const puce = ({ cle, libelle, genre, actif }: { readonly cle: string; readonly libelle: string; readonly genre: GenreDePiece | null; readonly actif: boolean }): string =>
  `<a class="puce" href="${echappe(adresseDesMedias(cle, genre))}"${actif ? ' aria-current="page"' : ''}>${echappe(libelle)}</a>`;

const puces = ({ cle, galerie }: EtatDesMedias): string =>
  `<nav class="puces filtres" aria-label="${echappe(MEDIAS.filtrer)}">` +
  puce({ cle, libelle: MEDIAS.tous, genre: null, actif: galerie.genre === null }) +
  GENRES_DE_PIECE.map((genre) =>
    puce({ cle, libelle: MEDIAS.parGenre[genre], genre, actif: galerie.genre === genre }),
  ).join('') +
  '</nav>';

/**
 * UNE TUILE — un lien vers le MÊME geste que la ligne du fil (`plein-vue.ts`,
 * `gesteDePiece`) : l'image et la vidéo mènent à l'état `?media=` de CETTE
 * adresse (la galerie, tranche conservée) ; un fichier ouvre son onglet, geste
 * nommé — `download` est IGNORÉ hors origine, et la passerelle est une autre
 * origine que le document, si bien que toucher une tuile SANS le nommer
 * NAVIGUERAIT l'onglet vers le fichier brut sans que rien ne l'annonce.
 */
const tuile = (piece: PieceJointe, meta: string, contexte: { readonly cle: string; readonly genre: GenreDePiece | null; readonly avant: string | null }): string => {
  const geste = gesteDePiece({ piece, meta, plein: adresseDuPleinDeLaGalerie({ ...contexte, piece: piece.id }) });
  return (
    `<a class="tuile" href="${echappe(geste.href)}"${geste.onglet ? ' target="_blank" rel="noopener"' : ''} aria-label="${echappe(geste.libelle)}">` +
    `<span class="vignette" aria-hidden="true">${svgDuSprite(formeDePiece(piece.genre).glyphe)}</span>` +
    `<span class="poids">${svgDuSprite('ph-arrow-down')}${echappe(meta)}</span>` +
    '</a>'
  );
};

/**
 * UN VOCAL — le `<details>` du fil : son `<summary>` EST l'affiche de lecture,
 * son contenu le média natif en `preload="none"`. Il s'ouvre SANS JavaScript,
 * et la piste jouée est celle de la langue SERVIE (cycle 128) : on entend ce
 * qu'on lit.
 */
const lecteur = (piece: PieceJointe, meta: string): string =>
  '<details class="lecteur">' +
  '<summary>' +
  `<span class="lire" aria-hidden="true">${svgDuSprite('ph-fill-play')}</span>` +
  `<span class="hors-ecran">${echappe(FIL.lire(piece.nom, meta))}</span>` +
  '<span class="rail" aria-hidden="true"></span>' +
  '<span class="etiquette">' +
  `<span class="nom-de-piece">${echappe(piece.nom)}</span>` +
  `<span class="poids">${echappe(meta)}</span>` +
  '</span>' +
  '</summary>' +
  `<audio controls preload="none" src="${echappe(piece.piste)}"></audio>` +
  '</details>';

const entree = (piece: PieceJointe, bloc: string): string =>
  `<li data-piece="${echappe(piece.id)}" data-genre="${piece.genre}">${bloc}</li>`;

const entreeDeTuile = ({ piece }: Media, contexte: { readonly cle: string; readonly genre: GenreDePiece | null; readonly avant: string | null }): string =>
  entree(piece, tuile(piece, metaDePiece(piece), contexte));

const entreeDeLecteur = ({ piece }: Media, contexte: { readonly cle: string; readonly genre: GenreDePiece | null; readonly avant: string | null }): string => {
  const fiche = aFiche(piece) ? ficheDePiece(adresseDuPleinDeLaGalerie({ ...contexte, piece: piece.id }), piece.nom) : '';
  return entree(piece, lecteur(piece, metaDePiece(piece)) + blocDeTranscription(piece, DOCUMENT_LANGUAGE) + fiche);
};

const rien = (galerie: Galerie): string =>
  galerie.genre === null
    ? carteVide({ glyphe: 'ph-stack', titre: MEDIAS.vide, phrase: MEDIAS.videPrecision })
    : carteVide({
        glyphe: 'ph-stack',
        titre: MEDIAS.videFiltre(MEDIAS.parGenre[galerie.genre]),
        phrase: MEDIAS.videFiltrePrecision,
      });

/**
 * DEUX LISTES, PARCE QUE LA CIBLE EN DESSINE DEUX : la grille de tuiles
 * carrées, puis les vocaux en lecteurs pleine largeur. Une liste unique où le
 * vocal aurait pris toute la rangée (`grid-column:1/-1`) laissait des TROUS
 * dans la grille — mesuré : une tuile seule sur sa rangée, deux colonnes vides
 * à côté — et `grid-auto-flow:dense` les aurait bouchés en désaccordant l'ordre
 * VISUEL de l'ordre du DOM, c'est-à-dire l'ordre du clavier. Chaque liste garde
 * son ordre chronologique, du plus récent au plus ancien.
 *
 * `inerte` — LE CONTENU EST STRICTEMENT LE MÊME, avec ou sans surimpression :
 * c'est ce que « grille inchangée » (§ critère de fin) veut dire. Seul
 * l'attribut change, comme `corpsDuFil` (`fil-vue.ts`) le fait pour le fil.
 */
const corps = (etat: EtatDesMedias, { inerte = false }: { readonly inerte?: boolean } = {}): string => {
  const { cle, galerie, plusAncien } = etat;
  const contexte = { cle, genre: galerie.genre, avant: etat.avant };
  const tuiles = galerie.medias.filter((media) => !sEcouteSurPlace(media.piece.genre));
  const lecteurs = galerie.medias.filter((media) => sEcouteSurPlace(media.piece.genre));

  return (
    `<main id="main-content" class="medias-ecran"${inerte ? ' inert' : ''} data-module="${echappe(etat.tempsReel.actifs.plein.url)}">` +
    enTete(etat) +
    puces(etat) +
    `<section class="galerie" aria-label="${echappe(MEDIAS.titre)}">` +
    (galerie.total === 0 ? rien(galerie) : '') +
    (tuiles.length === 0
      ? ''
      : `<ul class="grille" aria-label="${echappe(MEDIAS.grille(galerie.genre))}">${tuiles.map((media) => entreeDeTuile(media, contexte)).join('')}</ul>`) +
    (lecteurs.length === 0
      ? ''
      : `<ul class="lecteurs" aria-label="${echappe(MEDIAS.vocaux)}">${lecteurs.map((media) => entreeDeLecteur(media, contexte)).join('')}</ul>`) +
    (plusAncien === null
      ? ''
      : `<a class="plus-ancien action discrete" href="${echappe(adresseDesMedias(cle, galerie.genre, plusAncien))}">${echappe(MEDIAS.plusAnciens)}</a>`) +
    '</section>' +
    '</main>'
  );
};

/**
 * LA SURIMPRESSION — la MÊME que le fil (`plein-vue.ts`), retour et lien « voir
 * dans la conversation » fournis par CET hôte. `retour` est l'adresse de la
 * galerie SERVIE (`?genre=&avant=`, jamais `?autour=`) : fermer — croix,
 * `data-retour`, ou retour arrière — rend la grille inchangée, filtre et page
 * conservés.
 */
const dessus = (etat: EtatDesMedias): string => {
  const plein = pieceEnPlein(etat.galerie.medias, etat.plein);
  if (plein === null) return '';
  const { cle, galerie } = etat;
  return pleinEcran({
    piece: plein.piece,
    retour: adresseDesMedias(cle, galerie.genre, etat.avant),
    langueDuDocument: DOCUMENT_LANGUAGE,
    versLeMessage: {
      href: adresseDuRetourDuPlein(`/chats/${encodeURIComponent(cle)}`, plein.messageId),
      libelle: MEDIAS.voirDansLaConversation,
    },
  });
};

export const documentDesMedias = (etat: EtatDesMedias): string => {
  const surimpression = dessus(etat);
  return documentPleinEcran({
    titre: `${MEDIAS.titre} — ${etat.titre}`,
    description: `${etat.titre} · ${MEDIAS.elements(etat.galerie.total)}`,
    // LA SURIMPRESSION AVANT LA GRILLE, et la grille INERTE derrière elle — la
    // même règle que le fil (`fil-vue.ts`, `documentDuFil`), pour les deux
    // mêmes raisons : le CLS d'abord (rendue après un corps déjà arrivé, une
    // surimpression grandirait le document sous les yeux du lecteur), l'accès
    // ensuite (sans JavaScript il n'y a ni Échap ni piège à focus, et `inert`
    // est ce que le navigateur donne gratuitement).
    corps: surimpression + corps(etat, { inerte: surimpression !== '' }),
    // Échap doit fermer la surimpression ICI comme sur le fil (§ ci-dessus) :
    // le chargeur est le MÊME que celui du fil (`chargeur.ts`), le module visé
    // est le SEUL que la galerie exécute (`lib/realtime/plein.ts`).
    script: CHARGEUR_DE_PARTICIPATION,
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_MEDIAS + (surimpression === '' ? '' : FEUILLE_DU_PLEIN),
  });
};
