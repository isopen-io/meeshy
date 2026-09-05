/**
 * LA COPIE DE L'HISTORIQUE DES APPELS — ce que l'écran DIT, et son
 * iconographie.
 *
 * Contrairement à `lib/contenu/notifs.ts`, il n'existe ICI aucun texte composé
 * par la passerelle à projeter tel quel : `GET /calls/history`
 * (`services/gateway/src/services/callHistory.ts`) ne sert que des données —
 * une direction, une durée, un nom — jamais une phrase. Toute la mise en mots
 * vit donc dans ce fichier, un seul site pour les deux peintres possibles
 * (aujourd'hui la vue serveur seule ; l'écran n'a pas de module de
 * participation, § 7 de la spécification).
 */

/**
 * LA DIRECTION D'UN APPEL — le même vocabulaire que le contrat REST
 * (`CallDirection`, `services/gateway/src/services/callHistory.ts:14`) :
 * dérivée SERVEUR, jamais recalculée ici (`lib/api/appels.ts` la LIT, elle ne
 * la déduit pas).
 */
export type Direction = 'incoming' | 'outgoing' | 'missed';

export const APPELS = {
  titre: 'Appels',
  sous: 'Historique',
  retour: 'Retour à l’accueil',
  liste: 'Vos appels, du plus récent au plus ancien',
  manque: 'Manqué',
  entrant: 'entrant',
  audio: 'Audio',
  video: 'Vidéo',
  vide: 'Aucun appel',
  videPrecision: 'Vos appels passés et reçus apparaîtront ici.',
  plusAnciens: 'Appels plus anciens',
  panne: 'Vos appels n’ont pas pu être chargés',
  pannePrecision: 'La connexion au service a échoué. Réessayez dans un instant.',
  /**
   * LE REPLI D'UNE LIGNE SANS NOM — ni `conversationTitle` (un groupe qui
   * n'en a pas), ni `peer` nommé. Une ligne sans nom ne se rend pas anonyme :
   * elle dit « Conversation », jamais une chaîne vide qui romprait la mise en
   * page ou une inférence qui prétendrait savoir qui a appelé.
   */
  sansNom: 'Conversation',
  /**
   * UN SORTANT JAMAIS DÉCROCHÉ (`status:'rejected'`/`'failed'`, `nonAbouti`
   * de `lib/api/appels.ts`) — la MÊME ligne que `direction:'missed'` aurait
   * dit « Manqué · entrant » ; celle-ci ne l'est pas (c'est le lecteur qui a
   * composé), donc `duree()` rend `''` en silence sans ce mot. Un seul terme
   * pour les deux statuts : rien ici ne prétend distinguer un refus d'un
   * échec réseau, que `endReason` seul saurait dire.
   */
  nonAbouti: 'Non abouti',
} as const;

/**
 * LA DURÉE, EN TOUTES LETTRES — jamais pour un appel manqué (`dureeSec: 0`
 * n'a rien à dire : « 0 min » raconterait un appel qui n'a pas eu lieu). Sous
 * la minute, en secondes ; à partir d'elle, arrondie à la minute la plus
 * proche — la même granularité que la cible (« 12 min », « 41 min »).
 */
export const duree = (sec: number): string => {
  if (sec <= 0) return '';
  if (sec < 60) return `${sec} s`;
  return `${Math.round(sec / 60)} min`;
};

/**
 * LE GLYPHE D'UNE LIGNE — la VIDÉO PRIME SUR LA DIRECTION, comme la cible le
 * montre (une tuile indigo, jamais rouge ni verte, pour « Équipe Lagos »). Les
 * quatre symboles existent déjà dans `packages/icons/sprite.svg` : aucun
 * glyphe à ajouter.
 */
export const glypheDeLAppel = (direction: Direction, video: boolean): string => {
  if (video) return 'ph-video-camera';
  if (direction === 'missed') return 'ph-phone-x';
  if (direction === 'incoming') return 'ph-phone-incoming';
  return 'ph-phone';
};

/**
 * LA TEINTE D'UNE TUILE — trois classes, jamais une quatrième : un appel
 * MANQUÉ reste rouge même s'il était vidéo (l'urgence prime), sinon la vidéo
 * l'emporte sur l'audio répondu (indigo avant vert), exactement l'ordre que
 * `glypheDeLAppel` applique à son icône.
 */
export const classeDeLaTuile = (direction: Direction, video: boolean): 'manque' | 'video' | 'repondu' =>
  direction === 'missed' ? 'manque' : video ? 'video' : 'repondu';
