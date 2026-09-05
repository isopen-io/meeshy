import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import type { Fil, PieceJointe } from '@/lib/api/fil';
import { formeDePiece, sEcouteSurPlace, sOuvreEnPlein } from '@/lib/api/formes';
import { FIL } from '@/lib/contenu/fil';
import { metaDePiece } from '@/lib/poids';

import { blocDeTranscription } from './transcrit';

/**
 * LE PLEIN ÉCRAN D'UN MÉDIA — la troisième chose qu'un chat offre et que le fil
 * n'offrait pas (§ 12.10.1) : une image s'agrandit, une vidéo se joue, un vocal
 * donne sa FICHE, c'est-à-dire sa transcription entière avec son original.
 *
 * C'EST UN ÉTAT DE L'ADRESSE HÔTE, PAS UNE ADRESSE À LUI (`?media=<pièce>`,
 * `lib/api/adresses-du-fil.ts`). Trois conséquences, et c'est pour elles que la
 * forme a été choisie — la même que le porteur a tranchée pour le profil d'un
 * participant (§ 12.10.3 point 2) :
 *
 *   1. on OUVRE et on FERME par un `<a href>`, donc **sans un octet de
 *      JavaScript** (§ 12.10.6) : le geste marche à `javaScriptEnabled:false`,
 *      comme tout ce que cet écran offre ;
 *   2. il n'y a qu'UN site de rendu. Une surimpression peinte par le module
 *      aurait été un SECOND balisage du même objet — la jumelle que la charte
 *      interdit, et celle que `FORME_PAR_GENRE` a déjà coûtée une fois à cet
 *      écran (leçon 465) ;
 *   3. aucun motif de budget n'est ajouté : un état de la même adresse est
 *      servi par le même document, sous les plafonds de `/chats/*` et
 *      `/chat/*` (4 requêtes avant le premier pixel, LCP ≤ 2,2 s, CLS ≤ 0,05),
 *      opposés tels quels.
 *
 * CE QUI S'OUVRE VIENT DE LA TABLE DES FORMES, jamais d'un `if` par genre : un
 * genre dont `ouvre` ne vaut pas `plein` (un PDF, une archive) n'a pas de plein
 * écran, et `?media=<son id>` ne rend RIEN — un cadre vide serait un contrôle
 * sans effet (charte règle 7). Le `<video>` et l'`<audio>` restent en
 * `preload="none"` : la surimpression MONTRE, elle ne dépense pas les octets à
 * la place du lecteur — sauf l'image, qui EST ce que le geste a demandé.
 *
 * LA PISTE JOUÉE EST CELLE DE LA LANGUE SERVIE (`piece.piste`, cycle 128) : on
 * entend ce qu'on lit, dans la surimpression comme dans la ligne.
 *
 * DEUX HÔTES, UN SITE (§ 4 étape 1, issue #4525 / #5024 point 2). Le fil
 * (`fil-vue.ts`) et la galerie (`medias-vue.ts`) ouvrent tous deux ce module :
 * ni l'un ni l'autre n'écrit son propre `<dialog class="plein">`. Ce qui les
 * distingue — la tranche d'où l'on part, l'adresse de retour — est fourni par
 * l'HÔTE (`retour`), jamais recomposé ici : `plein-vue.ts` n'importe donc
 * aucune adresse `?autour=` ou `?genre=`, et ne sait rien de la porte qui l'a
 * appelé. C'est ce qui le rend AGNOSTIQUE : un troisième hôte n'aurait qu'à
 * fournir sa propre adresse de retour pour recevoir la même surimpression.
 *
 * `gesteDePiece`, `aFiche` et `ficheDePiece` vivaient dans `app/connecte/
 * fil-lignes.ts`, en `const` NON exportées : seule la ligne du fil les lisait.
 * La galerie en est le second lecteur (§ 3.1 (B) : une règle remonte dès sa
 * SECONDE surface) — les recopier aurait fait deux façons de dire ce qu'un tap
 * sur une pièce ouvre, et deux façons de décider qu'un vocal a une fiche.
 */

/** Une pièce et le message d'où elle vient — le strict nécessaire pour l'ouvrir et pour fermer sur lui. */
export type PieceEnPlein = { readonly piece: PieceJointe; readonly messageId: string };

/** Toutes les pièces d'un fil, aplaties — ce que `pieceEnPlein` cherche, côté fil. */
export const piecesDuFil = (fil: Fil): readonly PieceEnPlein[] =>
  fil.messages.flatMap((message) => message.pieces.map((piece) => ({ piece, messageId: message.id })));

/**
 * LA PIÈCE QUE L'ADRESSE NOMME, cherchée dans ce qui est SERVI — jamais
 * demandée à la passerelle : la surimpression n'ajoute aucune requête. Une
 * pièce hors de ce qui est candidat (une tranche, une galerie filtrée), celle
 * d'un message protégé ou d'un genre sans plein écran ne rend rien.
 */
export const pieceEnPlein = (candidats: readonly PieceEnPlein[], demande: string | null): PieceEnPlein | null => {
  if (demande === null || demande === '') return null;
  return candidats.find(({ piece }) => piece.id === demande && sOuvreEnPlein(piece.genre)) ?? null;
};

/** CE QUE LE TAP FAIT — l'adresse, le nom du geste, et s'il quitte le document. */
export type GesteDePiece = { readonly href: string; readonly libelle: string; readonly onglet: boolean };

/**
 * CE QUE LE TAP OUVRE, table à l'appui — jamais un `if` par genre. L'hôte
 * fournit `plein`, l'adresse à suivre quand le genre s'ouvre en plein écran
 * (composée par LUI : `adresseDuPlein` pour le fil, `adresseDuPleinDeLaGalerie`
 * pour la galerie) ; le fichier, lui, reste `piece.url` — la même URL pour les
 * deux hôtes, puisqu'elle vient du fil.
 */
export const gesteDePiece = ({
  piece,
  meta,
  plein,
}: {
  readonly piece: PieceJointe;
  readonly meta: string;
  readonly plein: string;
}): GesteDePiece =>
  formeDePiece(piece.genre).ouvre === 'plein'
    ? { href: plein, libelle: FIL.pleinEcran(piece.nom, meta), onglet: false }
    : { href: piece.url, libelle: FIL.telecharger(piece.nom, meta), onglet: true };

/**
 * ELLE N'EXISTE QUE S'IL Y A UNE FICHE À LIRE. La transcription arrive APRÈS
 * l'envoi — Whisper, puis NLLB, puis le TTS (§ Audio Pipeline) — et une puce
 * qui ne livre pas ce que son nom promet est un contrôle sans effet (charte
 * règle 7).
 */
export const aFiche = (piece: PieceJointe): boolean => sEcouteSurPlace(piece.genre) && piece.transcription !== null;

export const ficheDePiece = (href: string, nom: string): string =>
  `<a class="fiche" href="${echappe(href)}" aria-label="${echappe(FIL.fiche(nom))}">${svgDuSprite('ph-file-text')}${echappe(FIL.ficheCourt)}</a>`;

/**
 * LA SCÈNE — ce que le genre montre, et lui seul. `lecteur` nomme la balise
 * native (`lib/api/formes.ts`) : il n'y a pas de comparaison de genre écrite
 * ici, donc pas d'endroit où un genre neuf serait oublié.
 *
 * LA BOÎTE EST PORTÉE PAR TOUTES LES BALISES, pas par la seule image. Un
 * `<video preload="none">` n'a AUCUNE métadonnée avant la pression : sans
 * `width`/`height` et sans règle de feuille, le navigateur retombe sur ses
 * 300 × 150 par défaut — le « plein écran » d'une vidéo était alors plus PETIT
 * que son affiche dans le fil (294 × 165 mesurés). Les dimensions sont servies
 * par la passerelle quand elle les a (`lib/api/fil.ts`) ; sans elles, c'est la
 * feuille qui donne le rapport (`video.media-plein:not([width])`).
 */
const boiteDePiece = (piece: PieceJointe): string =>
  piece.largeur === null || piece.hauteur === null ? '' : ` width="${piece.largeur}" height="${piece.hauteur}"`;

const scene = (piece: PieceJointe): string => {
  const balise = formeDePiece(piece.genre).lecteur;
  if (balise !== null) {
    return `<${balise} class="media-plein" controls preload="none"${boiteDePiece(piece)} src="${echappe(piece.piste)}"></${balise}>`;
  }
  return `<img class="media-plein" src="${echappe(piece.url)}" alt="${echappe(piece.nom)}"${boiteDePiece(piece)}/>`;
};

/**
 * LA SURIMPRESSION — PLEINE PAGE, donc SANS VOILE : rien ne dépasse d'un
 * visionneur qui remplit l'écran, et un voile qu'aucun pixel ne montre serait
 * une cible invisible recouvrant une cible visible (leçon 471). On ferme par la
 * CROIX — un `<a href>`, donc sans un octet de JavaScript — ou par Échap dès
 * que le module a élevé le `<dialog>` en modale
 * (`lib/realtime/plein-ecran.ts`) ; deux chemins, un seul effet : `retour`,
 * l'adresse hôte que L'APPELANT calcule — la tranche autour du message d'où la
 * pièce vient pour le fil, la galerie servie (`?genre=&avant=`) pour la
 * galerie.
 *
 * `versLeMessage`, quand l'hôte le fournit, mène « dans la conversation » : le
 * geste que le legacy offrait (`AttachmentGallery.tsx` › « Voir dans le
 * message »), repris ici pour la galerie SEULE — le fil, lui, EST déjà la
 * conversation (charte règle 11, un lien vers l'écran courant n'a pas d'effet).
 */
export const pleinEcran = ({
  piece,
  retour,
  langueDuDocument,
  versLeMessage = null,
}: {
  readonly piece: PieceJointe;
  readonly retour: string;
  readonly langueDuDocument: string;
  readonly versLeMessage?: { readonly href: string; readonly libelle: string } | null;
}): string => {
  const meta = metaDePiece(piece);
  const titre = piece.nom === '' ? FIL.pleinTitre : piece.nom;

  return (
    // `aria-modal` DIT ce que `inert` FAIT sur le `<main>` que la surimpression
    // recouvre (`fil-vue.ts`, `medias-vue.ts`) : sans les deux, un lecteur
    // d'écran continuait d'annoncer un fil (ou une galerie) que rien ne montre.
    `<dialog class="plein" id="plein" open aria-modal="true" aria-labelledby="titre-du-plein" data-genre="${piece.genre}" data-retour="${echappe(retour)}">` +
    '<header>' +
    `<div class="titre"><h2 id="titre-du-plein">${echappe(titre)}</h2>` +
    `<p class="poids"${meta === '' ? ' hidden' : ''}>${echappe(meta)}</p></div>` +
    `<a class="fermer" href="${echappe(retour)}" aria-label="${echappe(FIL.fermer)}">${svgDuSprite('ph-x')}</a>` +
    '</header>' +
    `<div class="scene">${scene(piece)}</div>` +
    `<div class="fiche-texte">${blocDeTranscription(piece, langueDuDocument)}</div>` +
    (versLeMessage === null
      ? ''
      : `<a class="action discrete" href="${echappe(versLeMessage.href)}">${echappe(versLeMessage.libelle)}</a>`) +
    // Le poids n'est PAS répété ici : l'en-tête de la surimpression l'annonce
    // trois lignes plus haut, et le redire faisait passer l'action primaire à
    // deux lignes. Le nom accessible du contrôle EST son texte visible — aucun
    // `aria-label` qui le remplacerait (WCAG 2.5.3).
    `<a class="action contour" href="${echappe(piece.url)}" target="_blank" rel="noopener">` +
    `${svgDuSprite('ph-arrow-down')}${echappe(FIL.telecharger(piece.nom))}</a>` +
    '</dialog>'
  );
};
