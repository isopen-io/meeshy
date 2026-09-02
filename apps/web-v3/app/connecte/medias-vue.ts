import { svgDuSprite } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { echappe } from '@/app/socle';
import { formeDePiece, GENRES_DE_PIECE, type GenreDePiece } from '@/lib/api/formes';
import type { PieceJointe } from '@/lib/api/fil';
import { adresseDesMedias, type Galerie, type Media } from '@/lib/api/medias';
import { FIL } from '@/lib/contenu/fil';
import { MEDIAS } from '@/lib/contenu/medias';
import { metaDePiece } from '@/lib/poids';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_MEDIAS } from './medias-feuille';
import { blocDeTranscription } from './transcrit';
import { carteVide } from './vue';

/**
 * LA GALERIE DES MÉDIAS D'UNE CONVERSATION (`cible/media.png`, issue #4525) —
 * on la parcourt, on l'ouvre, et **le poids de chaque pièce est annoncé avant
 * qu'un octet ne parte**.
 *
 * ZÉRO OCTET DE MÉDIA À L'OUVERTURE. La grille ne rend AUCUNE `<img>` et
 * AUCUNE `<video>` : une tuile est un `<a>` au glyphe de son genre, sous lequel
 * son poids (et sa durée quand elle en a une) est écrit. C'est la décision qui
 * porte l'écran : « très faible consommation de données » se joue ici, et une
 * grille de 48 vignettes qui précharge est le contraire de la mission. La cible
 * dessine cette tuile-là — celle qui annonce « ↓ 420 Ko » —, et cet écran
 * n'en connaît pas d'autre, puisque rien n'y est jamais préchargé.
 *
 * LE CLS EST NUL PAR CONSTRUCTION, et pas par un `width`/`height` : chaque
 * tuile est un carré (`aspect-ratio:1`) dont la boîte est connue avant tout
 * réseau. Le § 8.5 demande des vignettes dimensionnées ; la règle est tenue
 * par un moyen plus fort que celui qu'elle nomme — il n'y a pas d'image à
 * dimensionner.
 *
 * UN VOCAL N'EST PAS UNE TUILE. La cible le dessine en lecteur pleine largeur,
 * avec sa durée et son Prisme (« Transcrit · yo → fr ») : il porte du TEXTE,
 * que la grille doit pouvoir servir. C'est le `<details>` du fil, au balisage
 * près (`app/connecte/fil-lignes.ts`), et sa transcription est rendue par le
 * site UNIQUE de ce bloc (`app/connecte/transcrit.ts`) — `preload="none"`,
 * donc zéro octet avant la pression.
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
 * UNE TUILE — un lien vers le fichier SERVI, avec le geste nommé et le poids
 * écrit. `fileUrl` est résolu par `lib/api/fil.ts` (`urlDePiece`), jamais
 * reconstruit ici : une signature `?exp=&sig=` viendra un jour dans cette même
 * valeur (§ 5.1).
 *
 * Le lien OUVRE UN ONGLET : `download` est IGNORÉ hors origine — et la
 * passerelle est une autre origine que le document —, si bien que toucher une
 * tuile NAVIGUERAIT l'onglet vers le fichier brut, et la galerie serait perdue.
 * Le geste est donc NOMMÉ dans le nom accessible, exactement comme sur l'affiche
 * du fil.
 */
const tuile = (piece: PieceJointe, meta: string): string =>
  `<a class="tuile" href="${echappe(piece.url)}" target="_blank" rel="noopener" aria-label="${echappe(FIL.telecharger(piece.nom, meta))}">` +
  `<span class="vignette" aria-hidden="true">${svgDuSprite(formeDePiece(piece.genre).glyphe)}</span>` +
  `<span class="poids">${svgDuSprite('ph-arrow-down')}${echappe(meta)}</span>` +
  '</a>';

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

/**
 * CE QUI S'ÉCOUTE SUR PLACE, et ce qui s'ouvre. La règle DÉRIVE de la table des
 * formes (`lib/api/formes.ts`) : seul un genre dont le lecteur natif est
 * `audio` tient dans une ligne — une `<video>` demanderait une boîte que la
 * grille ne peut pas montrer sans octets, et un `<audio>` replié n'en coûte
 * aucun. Un vocal porte de plus du TEXTE (sa transcription), que la cible
 * dessine sous lui : une tuile carrée ne saurait pas le rendre.
 */
const sEcouteSurPlace = (piece: PieceJointe): boolean => formeDePiece(piece.genre).lecteur === 'audio';

const entree = (piece: PieceJointe, bloc: string): string =>
  `<li data-piece="${echappe(piece.id)}" data-genre="${piece.genre}">${bloc}</li>`;

const entreeDeTuile = ({ piece }: Media): string => entree(piece, tuile(piece, metaDePiece(piece)));

const entreeDeLecteur = ({ piece }: Media): string =>
  entree(piece, lecteur(piece, metaDePiece(piece)) + blocDeTranscription(piece, DOCUMENT_LANGUAGE));

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
 */
const corps = (etat: EtatDesMedias): string => {
  const { cle, galerie, plusAncien } = etat;
  const tuiles = galerie.medias.filter((media) => !sEcouteSurPlace(media.piece));
  const lecteurs = galerie.medias.filter((media) => sEcouteSurPlace(media.piece));

  return (
    '<main id="main-content" class="medias-ecran">' +
    enTete(etat) +
    puces(etat) +
    `<section class="galerie" aria-label="${echappe(MEDIAS.titre)}">` +
    (galerie.total === 0 ? rien(galerie) : '') +
    (tuiles.length === 0
      ? ''
      : `<ul class="grille" aria-label="${echappe(MEDIAS.grille(galerie.genre))}">${tuiles.map(entreeDeTuile).join('')}</ul>`) +
    (lecteurs.length === 0
      ? ''
      : `<ul class="lecteurs" aria-label="${echappe(MEDIAS.vocaux)}">${lecteurs.map(entreeDeLecteur).join('')}</ul>`) +
    (plusAncien === null
      ? ''
      : `<a class="plus-ancien action discrete" href="${echappe(adresseDesMedias(cle, galerie.genre, plusAncien))}">${echappe(MEDIAS.plusAnciens)}</a>`) +
    '</section>' +
    '</main>'
  );
};

export const documentDesMedias = (etat: EtatDesMedias): string =>
  documentPleinEcran({
    titre: `${MEDIAS.titre} — ${etat.titre}`,
    description: `${etat.titre} · ${MEDIAS.elements(etat.galerie.total)}`,
    corps: corps(etat),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_MEDIAS,
  });
