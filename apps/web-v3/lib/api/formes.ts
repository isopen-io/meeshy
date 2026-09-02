/**
 * LA FORME D'UNE PIÈCE JOINTE — le site UNIQUE de « ce genre, quel bloc ».
 *
 * La table vivait dans `app/connecte/fil-lignes.ts`, en `const` NON exportée :
 * seul le rendu SERVI la lisait. Quatre autres sites réécrivaient la même règle
 * en comparaisons littérales de genre — le peintre du temps réel
 * (`lib/realtime/fil-peinture.ts`, quatre endroits), « quel genre a une piste
 * traduite » (`lib/api/fil.ts`) et « quel genre a une durée » (`lib/poids.ts`).
 * Donner un lecteur à un genre neuf changeait donc la ligne SERVIE sans changer
 * la ligne PEINTE : le même message avait deux formes selon qu'il arrivait par
 * le document ou par le socket, et il fallait recharger pour voir son lecteur.
 * C'est la jumelle que la charte interdit, et la règle de placement § 3.1 (B)
 * fait remonter une règle dès sa SECONDE surface.
 *
 * TOUT DÉRIVE DE `lecteur` — il n'y a pas de second drapeau à tenir en phase :
 *
 *   • `lecteur === null` ⇒ le bloc est une AFFICHE (un lien vers le fichier) ;
 *   • `lecteur !== null` ⇒ le bloc est un LECTEUR (`<details>` ouvert au geste),
 *     et la pièce annonce sa DURÉE avec son poids ;
 *   • `lecteur === 'audio'` ⇒ et SEULEMENT lui — la piste change avec la langue
 *     servie (cycle 128). `transcriptTranslationTracks` normalise le format
 *     d'une piste en `audio/*` : rien dans la carte ne dit qu'une piste traduite
 *     serait une VIDÉO, et la servir à un `<video>` remplacerait l'image par du
 *     son.
 */

export type GenreDePiece = 'image' | 'audio' | 'video' | 'fichier';

export type FormeDePiece = {
  /** Le nom du symbole du sprite — un seul par genre, élu dans la feuille par `data-genre`. */
  readonly glyphe: string;
  /** Le lecteur natif que le genre demande, `null` quand la pièce ne se lit pas. */
  readonly lecteur: 'audio' | 'video' | null;
};

export const FORME_PAR_GENRE: Readonly<Record<GenreDePiece, FormeDePiece>> = {
  image: { glyphe: 'ph-image', lecteur: null },
  video: { glyphe: 'ph-video-camera', lecteur: 'video' },
  audio: { glyphe: 'ph-microphone', lecteur: 'audio' },
  fichier: { glyphe: 'ph-file', lecteur: null },
};

/** Les genres, dans l'ordre de la table — ce que les gabarits énumèrent, jamais une seconde liste. */
export const GENRES_DE_PIECE = Object.keys(FORME_PAR_GENRE) as readonly GenreDePiece[];

export const formeDePiece = (genre: GenreDePiece): FormeDePiece => FORME_PAR_GENRE[genre];

/** La pièce SE LIT : elle porte un lecteur natif, et annonce sa durée. */
export const seLit = (genre: GenreDePiece): boolean => FORME_PAR_GENRE[genre].lecteur !== null;

/** La piste JOUÉE suit la langue du texte servi — un vocal, et lui seul. */
export const pisteSuitLaLangue = (genre: GenreDePiece): boolean => FORME_PAR_GENRE[genre].lecteur === 'audio';

/**
 * DE QUEL GENRE EST UN FICHIER — la MÊME table, interrogée par son type MIME.
 *
 * La règle vivait en `const` privée dans `lib/api/fil.ts`, où elle n'avait
 * qu'un lecteur ; le média d'une story en est le second
 * (`lib/api/publication.ts` : un `PostMedia` porte le même `mimeType` qu'une
 * pièce jointe). La recopier aurait fait deux façons de décider qu'un
 * `audio/mp4` se lit — exactement la jumelle que la leçon 453 a déjà payée sur
 * cette table, et le § 3.1 (B) fait remonter une règle dès sa SECONDE surface.
 */
const GENRE_PAR_PREFIXE: readonly (readonly [string, GenreDePiece])[] = [
  ['image/', 'image'],
  ['audio/', 'audio'],
  ['video/', 'video'],
];

export const genreDeMime = (mime: string | null): GenreDePiece =>
  GENRE_PAR_PREFIXE.find(([prefixe]) => mime?.startsWith(prefixe))?.[1] ?? 'fichier';
