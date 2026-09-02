import type { GenreDePiece } from '@/lib/api/formes';

/**
 * LA COPIE DE LA GALERIE — ce que l'écran des médias DIT, hors de ce qu'il
 * compose. Elle vit sous `lib/` comme celle du fil : le serveur la lit pour
 * composer le document (`app/connecte/medias-vue.ts`) et l'en-tête du fil y
 * prend le nom de sa destination (`app/connecte/fil-vue.ts`) — deux lecteurs,
 * une phrase.
 *
 * Les libellés des puces sont ceux de la cible (`cible/media.png` : « Images »,
 * « Vidéos », « Audio », « Fichiers ») ; ils sont indexés par le genre de
 * `lib/api/formes.ts`, la table qui dit déjà quel bloc chaque genre demande —
 * jamais par une seconde liste de genres.
 */
const PAR_GENRE: Readonly<Record<GenreDePiece, string>> = {
  image: 'Images',
  video: 'Vidéos',
  audio: 'Audio',
  fichier: 'Fichiers',
};

/** L'ordre de la galerie, écrit UNE fois : les deux listes le portent dans leur nom. */
const ORDRE = 'du plus récent au plus ancien';

export const MEDIAS = {
  titre: 'Médias partagés',
  retour: 'Retour à la conversation',
  /** Le sous-titre : la conversation, puis ce qui est SERVI — jamais un total qu'on n'a pas mesuré. */
  elements: (nombre: number): string => (nombre === 1 ? '1 élément' : `${nombre} éléments`),
  filtrer: 'Filtrer par type',
  tous: 'Tous',
  parGenre: PAR_GENRE,
  /**
   * Le nom de la GRILLE dit ce qu'elle contient VRAIMENT : sous un filtre, elle
   * ne porte qu'un genre, et annoncer « photos, vidéos et fichiers » à un
   * lecteur d'écran qui n'y trouvera que des images serait faux.
   */
  grille: (genre: GenreDePiece | null): string =>
    `${genre === null ? 'Photos, vidéos et fichiers' : PAR_GENRE[genre]}, ${ORDRE}`,
  /** La cible dessine les vocaux SOUS la grille, en lecteurs pleine largeur : ils portent du texte. */
  vocaux: `Messages vocaux, ${ORDRE}`,
  vide: 'Aucun média partagé',
  videPrecision: 'Les photos, vidéos, vocaux et fichiers échangés ici se retrouveront sur cet écran.',
  videFiltre: (libelle: string): string => `Aucun média dans « ${libelle} »`,
  videFiltrePrecision: 'Essayez un autre type, ou revenez à « Tous ».',
  plusAnciens: 'Médias plus anciens',
} as const;
