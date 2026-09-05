import { PARAM_DU_PLEIN } from './adresses-du-fil';
import type { Message, PieceJointe } from './fil';
import { GENRES_DE_PIECE, type GenreDePiece } from './formes';

/**
 * LA GALERIE D'UNE CONVERSATION — une PROJECTION du fil, jamais une seconde
 * lecture.
 *
 * ## Pourquoi le fil, et pas `GET /conversations/:id/attachments`
 *
 * La passerelle a une route faite pour cet écran, et elle ne peut pas le
 * servir. Elle rend SEPT clés — `id`, `fileName`, `mimeType`, `fileSize`,
 * `fileUrl`, `thumbnailUrl`, `duration` (`messageAttachmentMinimalSchema`) —,
 * un jeu GELÉ côté serveur par
 * `__tests__/unit/routes/attachments/conversation-attachments-served-keys.test.ts`,
 * dont le doc-comment (`routes/attachments/metadata.ts:214-240`) dit que la
 * transcription et les traductions y sont « CHARGÉES, jamais servies ». Il lui
 * manque donc les TROIS choses sans lesquelles cet écran ne tient pas ses
 * promesses :
 *
 *   1. **La PROTECTION.** Aucun des trois drapeaux (`isViewOnce`, `isBlurred`,
 *      `expiresAt`) n'est servi par cette route. Une grille bâtie sur elle
 *      rendrait l'URL entière d'une photo à VUE UNIQUE — le défaut du cycle
 *      125 du `CLAUDE.md`, rejoué sur un écran neuf. Ici, la garde est
 *      HÉRITÉE et ne se contourne pas par oubli : `message()` rend
 *      `pieces: []` sur un message protégé ou supprimé, donc la galerie n'a
 *      rien à projeter.
 *   2. **La TRANSCRIPTION**, que le critère de fin de l'écran exige au Prisme,
 *      avec sa langue déclarée.
 *   3. Le Prisme lui-même — la PISTE élue par la langue du texte servi
 *      (cycle 128), qui vit dans `translations`.
 *
 * Le prix payé est la PROFONDEUR : la galerie couvre la fenêtre de messages que
 * la passerelle a servie, et l'on remonte plus loin par le même curseur que le
 * fil (`?avant=`). C'est un prix assumé et DIT à l'écran (« Médias plus
 * anciens »), là où l'autre route aurait échangé la profondeur contre une fuite
 * de contenu protégé. Élargir le minimal servi est une décision de la
 * passerelle, pas un contournement de la v3 (issue compagnon).
 *
 * ## Ce module ne lit RIEN de la passerelle
 *
 * Il ne fait aucun appel : `lib/api/fil.ts` en est le seul lecteur, et la
 * galerie est une fonction PURE de ce qu'il a rendu. C'est ce qui la rend
 * gageable sans réseau, et c'est ce qui garantit qu'une pièce vue dans la
 * galerie et la même pièce vue dans le fil sont le MÊME objet — même URL, même
 * poids, même transcription, même piste.
 */

/** Une pièce, et ce que la galerie sait d'elle en plus : d'où elle vient dans le fil. */
export type Media = {
  readonly piece: PieceJointe;
  readonly messageId: string;
  readonly auteur: string;
  readonly quand: string | null;
};

export type Galerie = {
  readonly medias: readonly Media[];
  /** Le genre DEMANDÉ — `null` quand la galerie sert tout. */
  readonly genre: GenreDePiece | null;
  /** Ce qui est SERVI, après filtre — jamais un total que la passerelle n'a pas donné. */
  readonly total: number;
  /** Le compte par genre AVANT filtre : ce que les puces ouvrent. */
  readonly comptes: Readonly<Record<GenreDePiece, number>>;
};

const AUCUN: Readonly<Record<GenreDePiece, number>> = Object.freeze(
  Object.fromEntries(GENRES_DE_PIECE.map((genre) => [genre, 0])) as Record<GenreDePiece, number>,
);

/**
 * Le genre demandé par l'adresse, lu contre la TABLE des genres — jamais contre
 * une seconde liste, et jamais normalisé : `?genre=AUDIO` n'est pas une valeur
 * de la table, donc la galerie sert tout plutôt que d'inventer une intention.
 */
export const genreDemande = (brut: string | null): GenreDePiece | null =>
  GENRES_DE_PIECE.find((genre) => genre === brut) ?? null;

const compte = (medias: readonly Media[]): Readonly<Record<GenreDePiece, number>> =>
  medias.reduce<Record<GenreDePiece, number>>(
    (somme, media) => ({ ...somme, [media.piece.genre]: somme[media.piece.genre] + 1 }),
    { ...AUCUN },
  );

/**
 * La galerie, du plus RÉCENT au plus ancien — l'ordre de la cible. Le fil est
 * servi dans l'ordre de LECTURE (du plus ancien au plus récent, `lib/api/fil.ts`
 * le retourne) ; une galerie se parcourt dans l'autre sens.
 */
export const galerie = ({
  messages,
  genre,
}: {
  readonly messages: readonly Message[];
  readonly genre: GenreDePiece | null;
}): Galerie => {
  const tous: readonly Media[] = [...messages]
    .reverse()
    .flatMap((message) =>
      message.pieces.map((piece) => ({
        piece,
        messageId: message.id,
        auteur: message.auteur,
        quand: message.ecritA,
      })),
    );
  const medias = genre === null ? tous : tous.filter((media) => media.piece.genre === genre);

  return { medias, genre, total: medias.length, comptes: compte(tous) };
};

/**
 * L'ADRESSE DE LA GALERIE — l'autre moitié de `genreDemande`.
 *
 * Elle vit ici, avec la lecture du paramètre, parce que les deux écrivent le
 * MÊME `?genre=` : séparées, elles auraient fini par ne plus s'accorder sur son
 * nom. Elle est lue par la vue (`app/connecte/medias-vue.ts`, ses puces et son
 * « plus anciens ») ET par l'en-tête du FIL, qui y mène — et si elle vivait
 * dans la vue, cet en-tête fermerait un cycle d'imports.
 *
 * `avant` est le même curseur que celui du fil : la galerie remonte le fil, pas
 * une seconde collection.
 */
export const adresseDesMedias = (
  cle: string,
  genre: GenreDePiece | null = null,
  avant: string | null = null,
): string => {
  const parametres = [
    ...(genre === null ? [] : [`genre=${genre}`]),
    ...(avant === null ? [] : [`avant=${encodeURIComponent(avant)}`]),
  ];
  const base = `/chats/${encodeURIComponent(cle)}/medias`;
  return parametres.length === 0 ? base : `${base}?${parametres.join('&')}`;
};

/**
 * L'ADRESSE DU PLEIN ÉCRAN DE LA GALERIE — la tranche servie (`?genre=&avant=`,
 * `adresseDesMedias`), PLUS `?media=<pièce>`. Le NOM du paramètre vient
 * d'`adresses-du-fil.ts` (`PARAM_DU_PLEIN`) : c'est le SEUL site qui le
 * déclare, celui que `pleinDemande` (`app/connecte/fil-porte.ts`) relit pour
 * les deux portes du fil ET pour cette route — un second nom aurait ouvert la
 * même surimpression sous deux adresses différentes.
 *
 * `autour=` N'ENTRE PAS ICI : la pièce est cherchée dans la galerie SERVIE
 * (`?genre=&avant=`), pas dans une tranche nommée par un message — la galerie
 * n'a pas la notion de tranche autour d'un message, elle a celle de PAGE.
 */
export const adresseDuPleinDeLaGalerie = ({
  cle,
  genre,
  avant,
  piece,
}: {
  readonly cle: string;
  readonly genre: GenreDePiece | null;
  readonly avant: string | null;
  readonly piece: string;
}): string => {
  const base = adresseDesMedias(cle, genre, avant);
  return `${base}${base.includes('?') ? '&' : '?'}${PARAM_DU_PLEIN}=${encodeURIComponent(piece)}`;
};
