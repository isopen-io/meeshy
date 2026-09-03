import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { adresseDuRetourDuPlein } from '@/lib/api/adresses-du-fil';
import type { Fil, Message, PieceJointe } from '@/lib/api/fil';
import { formeDePiece, sOuvreEnPlein } from '@/lib/api/formes';
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
 */

export type PieceEnPlein = { readonly piece: PieceJointe; readonly message: Message };

/**
 * LA PIÈCE QUE L'ADRESSE NOMME, cherchée dans ce qui est SERVI — jamais
 * demandée à la passerelle : la surimpression n'ajoute aucune requête. Une
 * pièce hors de la tranche, celle d'un message protégé (dont `pieces` est vide
 * par construction, `lib/api/fil.ts`) ou d'un genre sans plein écran ne rend
 * rien.
 */
export const pieceEnPlein = (fil: Fil, demande: string | null): PieceEnPlein | null => {
  if (demande === null || demande === '') return null;
  return (
    fil.messages
      .flatMap((message) => message.pieces.map((piece) => ({ piece, message })))
      .find(({ piece }) => piece.id === demande && sOuvreEnPlein(piece.genre)) ?? null
  );
};

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
 * (`lib/realtime/plein-ecran.ts`) ; deux chemins, un seul effet : l'adresse
 * hôte, cadrée sur le message d'où la pièce vient.
 */
export const pleinEcran = ({
  plein,
  adresse,
  langueDuDocument,
}: {
  readonly plein: PieceEnPlein;
  readonly adresse: string;
  readonly langueDuDocument: string;
}): string => {
  const { piece, message } = plein;
  const meta = metaDePiece(piece);
  // LA MÊME TRANCHE, CADRÉE SUR LE MESSAGE : fermer rend la page d'où l'on
  // vient, pas le bas du fil (`adresseDuRetourDuPlein`). L'adresse nue rejetait
  // le lecteur sur les quarante derniers messages, la photo qu'il regardait
  // disparue de l'écran.
  const retour = adresseDuRetourDuPlein(adresse, message.id);
  const titre = piece.nom === '' ? FIL.pleinTitre : piece.nom;

  return (
    // `aria-modal` DIT ce que `inert` FAIT sur le `<main>` que la surimpression
    // recouvre (`fil-vue.ts`) : sans les deux, un lecteur d'écran continuait
    // d'annoncer un fil que rien ne montre.
    `<dialog class="plein" id="plein" open aria-modal="true" aria-labelledby="titre-du-plein" data-genre="${piece.genre}" data-retour="${echappe(retour)}">` +
    '<header>' +
    `<div class="titre"><h2 id="titre-du-plein">${echappe(titre)}</h2>` +
    `<p class="poids"${meta === '' ? ' hidden' : ''}>${echappe(meta)}</p></div>` +
    `<a class="fermer" href="${echappe(retour)}" aria-label="${echappe(FIL.fermer)}">${svgDuSprite('ph-x')}</a>` +
    '</header>' +
    `<div class="scene">${scene(piece)}</div>` +
    `<div class="fiche-texte">${blocDeTranscription(piece, langueDuDocument)}</div>` +
    // Le poids n'est PAS répété ici : l'en-tête de la surimpression l'annonce
    // trois lignes plus haut, et le redire faisait passer l'action primaire à
    // deux lignes. Le nom accessible du contrôle EST son texte visible — aucun
    // `aria-label` qui le remplacerait (WCAG 2.5.3).
    `<a class="action contour" href="${echappe(piece.url)}" target="_blank" rel="noopener">` +
    `${svgDuSprite('ph-arrow-down')}${echappe(FIL.telecharger(piece.nom))}</a>` +
    '</dialog>'
  );
};
