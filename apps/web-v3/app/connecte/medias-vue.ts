import { svgDuSprite } from '@/app/actifs-inlines';
import { DOCUMENT_LANGUAGE } from '@/app/document-language';
import { echappe } from '@/app/socle';
import { adresseDuPlein } from '@/lib/api/adresses-du-fil';
import { formeDePiece, GENRES_DE_PIECE, sEcouteSurPlace, type GenreDePiece } from '@/lib/api/formes';
import type { Fil, PieceJointe } from '@/lib/api/fil';
import { adresseDesMedias, type Galerie, type Media } from '@/lib/api/medias';
import { FIL } from '@/lib/contenu/fil';
import { MEDIAS } from '@/lib/contenu/medias';
import { metaDePiece } from '@/lib/poids';

import { FEUILLE_CONNECTEE } from './feuille';
import { FEUILLE_DU_FIL } from './fil-feuille';
import { documentPleinEcran } from './fil-vue';
import { FEUILLE_DES_MEDIAS } from './medias-feuille';
import { FEUILLE_DU_PLEIN } from './plein-feuille';
import { pieceEnPlein, pleinEcran } from './plein-vue';
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
  /**
   * Le fil SERVI, dont `galerie` est une projection — c'est en son sein que
   * `?media=` se résout (`pieceEnPlein()`), sans une requête de plus : la
   * route l'a déjà en main (`fil()`, `app/chats/[cle]/medias/route.ts`).
   */
  readonly fil: Fil;
  /** `?media=<pièce>` — la pièce ouverte en plein écran, ou `null` hors de cet état. */
  readonly plein: string | null;
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
 * UNE TUILE — CE QUE LE TAP OUVRE VIENT DE LA MÊME TABLE que la ligne du fil
 * (`FORME_PAR_GENRE.ouvre`, `lib/api/formes.ts`) : la galerie n'écrit pas sa
 * propre règle, elle lit celle du fil, sous peine des DEUX gestes homonymes
 * que la première version de cet écran a laissés diverger (image touchée dans
 * le fil ⇒ plein écran ; la MÊME pièce touchée ici ⇒ onglet vers le fichier
 * brut, sans cadre ni retour).
 *
 *   • `ouvre === 'plein'` (image, vidéo, audio) ⇒ le MÊME état de la MÊME
 *     adresse hôte que le fil (`adresseDuPlein`, `?autour=&media=`), ici
 *     l'adresse de la galerie elle-même (`adresseDesMedias`, filtre gardé) :
 *     la surimpression s'ouvre SANS quitter la grille, SANS onglet, SANS le
 *     moindre octet de plus — `documentDesMedias` la sert plus bas ;
 *   • `ouvre === 'fichier'` (le reste) ⇒ le fichier SERVI, DANS UN ONGLET
 *     (`fileUrl`, résolu par `lib/api/fil.ts`, jamais reconstruit ici) :
 *     `download` est ignoré hors origine — et la passerelle est une autre
 *     origine que le document —, si bien que toucher la tuile NAVIGUERAIT
 *     l'onglet vers le fichier brut sans l'annoncer.
 *
 * Les deux gestes ont deux noms parce qu'ils font deux choses
 * (`FIL.pleinEcran` / `FIL.telecharger`), exactement comme sur l'affiche du
 * fil.
 */
const tuile = (media: Media, meta: string, cle: string, genreFiltre: GenreDePiece | null): string => {
  const { piece, messageId } = media;
  const enPlein = formeDePiece(piece.genre).ouvre === 'plein';
  const href = enPlein ? adresseDuPlein(adresseDesMedias(cle, genreFiltre), messageId, piece.id) : piece.url;
  const libelle = enPlein ? FIL.pleinEcran(piece.nom, meta) : FIL.telecharger(piece.nom, meta);
  return (
    `<a class="tuile" href="${echappe(href)}"${enPlein ? '' : ' target="_blank" rel="noopener"'} aria-label="${echappe(libelle)}">` +
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

const entreeDeTuile = (media: Media, cle: string, genreFiltre: GenreDePiece | null): string =>
  entree(media.piece, tuile(media, metaDePiece(media.piece), cle, genreFiltre));

const entreeDeLecteur = ({ piece }: Media): string =>
  entree(piece, lecteur(piece, metaDePiece(piece)) + blocDeTranscription(piece, DOCUMENT_LANGUAGE));

/**
 * L'ÉTAT VIDE DIT LA VÉRITÉ SUR SA PORTÉE. La galerie ne connaît que la
 * fenêtre que la passerelle vient de servir (50 messages, `PAR_PAGE`) : quand
 * cette fenêtre est vide mais qu'une page PLUS ANCIENNE existe
 * (`plusAncien !== null`), affirmer « Aucun média partagé » — ou, sous filtre,
 * conseiller « un autre type » — ment sur la raison réelle, qui est la
 * PROFONDEUR. Le lien qui remonte devient alors l'ACTION PRINCIPALE de la
 * carte, jamais un lien orphelin sous une phrase qui le contredit.
 * « Aucun média partagé » ne reste vrai QUE quand la galerie a vu toute la
 * conversation (`plusAncien === null`).
 */
const rien = ({ galerie, cle, plusAncien }: { readonly galerie: Galerie; readonly cle: string; readonly plusAncien: string | null }): string => {
  if (plusAncien !== null) {
    return carteVide({
      glyphe: 'ph-stack',
      titre: galerie.genre === null ? MEDIAS.videTranche : MEDIAS.videFiltre(MEDIAS.parGenre[galerie.genre]),
      phrase: galerie.genre === null ? MEDIAS.videTranchePrecision : MEDIAS.videFiltreTranchePrecision,
      action: { libelle: MEDIAS.plusAnciens, href: adresseDesMedias(cle, galerie.genre, plusAncien) },
    });
  }
  return galerie.genre === null
    ? carteVide({ glyphe: 'ph-stack', titre: MEDIAS.vide, phrase: MEDIAS.videPrecision })
    : carteVide({
        glyphe: 'ph-stack',
        titre: MEDIAS.videFiltre(MEDIAS.parGenre[galerie.genre]),
        phrase: MEDIAS.videFiltrePrecision,
      });
};

/**
 * DEUX LISTES, PARCE QUE LA CIBLE EN DESSINE DEUX : la grille de tuiles
 * carrées, puis les vocaux en lecteurs pleine largeur. Une liste unique où le
 * vocal aurait pris toute la rangée (`grid-column:1/-1`) laissait des TROUS
 * dans la grille — mesuré : une tuile seule sur sa rangée, deux colonnes vides
 * à côté — et `grid-auto-flow:dense` les aurait bouchés en désaccordant l'ordre
 * VISUEL de l'ordre du DOM, c'est-à-dire l'ordre du clavier. Chaque liste garde
 * son ordre chronologique, du plus récent au plus ancien.
 */
const corps = (etat: EtatDesMedias, { inerte }: { readonly inerte: boolean }): string => {
  const { cle, galerie, plusAncien } = etat;
  const tuiles = galerie.medias.filter((media) => !sEcouteSurPlace(media.piece.genre));
  const lecteurs = galerie.medias.filter((media) => sEcouteSurPlace(media.piece.genre));
  // Vide, la carte PORTE déjà « Médias plus anciens » comme action principale
  // (`rien()`) : un second lien identique sous elle serait une redite, jamais
  // un second accès.
  const videEtCourt = galerie.total === 0 && plusAncien !== null;

  return (
    `<main id="main-content" class="medias-ecran"${inerte ? ' inert' : ''}>` +
    enTete(etat) +
    puces(etat) +
    `<section class="galerie" aria-label="${echappe(MEDIAS.titre)}">` +
    (galerie.total === 0 ? rien({ galerie, cle, plusAncien }) : '') +
    (tuiles.length === 0
      ? ''
      : `<ul class="grille" aria-label="${echappe(MEDIAS.grille(galerie.genre))}">${tuiles.map((media) => entreeDeTuile(media, cle, galerie.genre)).join('')}</ul>`) +
    (lecteurs.length === 0
      ? ''
      : `<ul class="lecteurs" aria-label="${echappe(MEDIAS.vocaux)}">${lecteurs.map(entreeDeLecteur).join('')}</ul>`) +
    (plusAncien === null || videEtCourt
      ? ''
      : `<a class="plus-ancien action discrete" href="${echappe(adresseDesMedias(cle, galerie.genre, plusAncien))}">${echappe(MEDIAS.plusAnciens)}</a>`) +
    '</section>' +
    '</main>'
  );
};

/**
 * LE PLEIN ÉCRAN DE LA GALERIE — le MÊME état de la MÊME adresse hôte que
 * celui du fil (`documentDuFil`, `fil-vue.ts`), résolu contre le `Fil` que la
 * route a déjà en main : aucune requête de plus, aucun second balisage
 * (§ 12.10.1). La galerie n'ouvre plus jamais le fichier brut dans un onglet
 * pour un genre que la table dit `plein`.
 */
export const documentDesMedias = (etat: EtatDesMedias): string => {
  const plein = pieceEnPlein(etat.fil, etat.plein);
  const dessus = plein === null
    ? ''
    : pleinEcran({ plein, adresse: adresseDesMedias(etat.cle, etat.galerie.genre), langueDuDocument: DOCUMENT_LANGUAGE });

  return documentPleinEcran({
    titre: `${MEDIAS.titre} — ${etat.titre}`,
    description: `${etat.titre} · ${MEDIAS.elements(etat.galerie.total)}`,
    // LA SURIMPRESSION AVANT LA GRILLE, et la grille INERTE derrière elle — la
    // même règle que le fil (`documentDuFil`), pour les deux mêmes raisons :
    // l'ordre (CLS) et l'accès (`inert` sans JavaScript).
    corps: dessus + corps(etat, { inerte: dessus !== '' }),
    feuille: FEUILLE_CONNECTEE + FEUILLE_DU_FIL + FEUILLE_DES_MEDIAS + (dessus === '' ? '' : FEUILLE_DU_PLEIN),
  });
};
