/**
 * Les noms de la présence « regarde la conversation » (#8892, #9061) — une
 * PARTIE des deux cartes de `event-names.ts`, qui les répandent : la carte
 * reste ce qu'on écoute et ce qu'on émet, ces objets n'en sont pas une seconde
 * écriture.
 *
 * Ils vivent à part pour la même raison que les adresses d'API vivent dans
 * `api/endpoints/<groupe>.ts` (#7716) : le web les lit dès sa première peinture
 * (`lib/api/conversation-viewing.ts`), et y importer `SERVER_EVENTS` tirait la
 * carte ENTIÈRE, 2,55 Ko gzip pour sept noms (#9966).
 */

export const VIEWING_SERVER_EVENTS = {
  /** Un pair a ouvert la conversation (#8892) — `ViewingEvent`. */
  VIEWING_START: 'viewing:start',
  /** Un pair a quitté la conversation, ou l'a mise en arrière-plan (#8892). */
  VIEWING_STOP: 'viewing:stop',
  /** Réponse au seul émetteur d'un `viewing:start` : les pairs déjà présents. */
  VIEWING_SNAPSHOT: 'viewing:snapshot',
  /** Un pair ICI regarde, écoute ou agit dans la conversation (#9061) — `ViewingEvent`. */
  VIEWING_ACTIVITY: 'viewing:activity',
} as const;

export const VIEWING_CLIENT_EVENTS = {
  /** L'écran de la conversation est ouvert et au premier plan (#8892). */
  VIEWING_START: 'viewing:start',
  VIEWING_STOP: 'viewing:stop',
  /** L'utilisateur ICI fait défiler, lit un média, écrit ou réagit (#9061). */
  VIEWING_ACTIVITY: 'viewing:activity',
} as const;
