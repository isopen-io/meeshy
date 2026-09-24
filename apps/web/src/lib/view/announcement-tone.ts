import type { FriendActionOutcome } from '@/lib/api/friend-actions';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **CE QUE VAUT L'ISSUE D'UN GESTE — UNE loi, pour les DEUX surfaces**
 * (revue #7083, défaut majeur 3).
 *
 * `/u/` et « Découvrir » servent les MÊMES gestes, les MÊMES clés d'annonce
 * et le MÊME hook ; ils rendaient pourtant deux produits, et c'est cet écart
 * que la revue a relevé (dimension 6 : même geste, même mot, même couleur de
 * contexte sur les deux surfaces). Écrire `'error'` en dur des deux côtés
 * aurait reproduit la forme du défaut un cran plus bas — deux littéraux qui
 * divergent au premier réglage de l'un des deux.
 *
 * **POURQUOI CETTE LOI EST ICI ET PURE, et pas en ligne dans les écrans** :
 * sous fixtures, AUCUN geste ne peut échouer — `fixtureBlockUser` rend
 * toujours `ok` (`fixtures-friends.ts:170-175`), et le seul refus que le
 * corpus sache produire (`createDirectConversation` sans direct existant,
 * `api/conversations.ts:233`) n'atteint aucune personne dont la fiche offre
 * « Écrire ». Un témoin d'écran sur l'encre d'un échec ne peut donc pas
 * s'écrire aujourd'hui. Extraire la décision la rend mesurable pour ce
 * qu'elle EST — une correspondance totale, `outcome` → encre — plutôt que de
 * la laisser en deux littéraux qu'aucun témoin ne regarde.
 *
 * **`offline` est un ÉCHEC, pas une nuance** : rien n'est parti. Le lecteur
 * doit le lire comme un refus, sinon il croit son geste passé.
 */
export const announcementToneOf = (outcome: FriendActionOutcome): AnnouncementTone =>
  outcome === 'done' ? 'neutral' : 'error';
