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
  /**
   * « Aucun média partagé » n'est vrai QUE si la galerie a vu toute la
   * conversation (`plusAncien === null`) : sinon, elle n'a vu qu'une TRANCHE
   * de 50 messages, et affirmer l'absence là où une page plus ancienne existe
   * ment sur le cas nominal de toute conversation active.
   */
  vide: 'Aucun média partagé',
  videPrecision: 'Les photos, vidéos, vocaux et fichiers échangés ici se retrouveront sur cet écran.',
  /** La vérité quand une page plus ancienne existe : la PROFONDEUR, pas l'absence. */
  videTranche: 'Aucun média dans cette tranche',
  videTranchePrecision: 'Les messages les plus récents n’en portent aucun — il y en a peut-être plus loin dans la conversation.',
  videFiltre: (libelle: string): string => `Aucun média dans « ${libelle} »`,
  videFiltrePrecision: 'Essayez un autre type, ou revenez à « Tous ».',
  /** Le même mensonge, sous filtre : la raison est la profondeur, pas le type. */
  videFiltreTranchePrecision: 'Les messages les plus récents n’en portent aucun de ce type — il y en a peut-être plus loin.',
  plusAnciens: 'Médias plus anciens',
} as const;
