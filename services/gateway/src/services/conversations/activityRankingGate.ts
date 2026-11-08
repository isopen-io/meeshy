/**
 * **QUI PEUT ÊTRE CLASSÉ PAR L'ACTIVITÉ DE TOUTE LA CONVERSATION** — #17139.
 *
 * `ConversationMessageStats.participantStats` agrège la vie ENTIÈRE d'une
 * conversation : par personne, son volume écrit et la date de son dernier
 * message. #17076 a cessé de SERVIR ces chiffres à un lecteur dont l'historique
 * est planchéisé. Deux surfaces continuaient de s'en servir pour **ORDONNER**
 * une liste qu'elles lui servent :
 *
 * - le listing « top » des participants (`loadMostActiveParticipants`), que tout
 *   membre ordinaire d'une grande conversation reçoit ;
 * - les suggestions de mention, dès qu'il tape `@`.
 *
 * ─── Pourquoi un ORDRE est une fuite ────────────────────────────────────────
 *
 * Le dépôt a déjà tranché cette famille, pour la présence, et l'a écrite dans
 * son `CLAUDE.md` : *« une SÉLECTION ou un ORDRE qui dépend de la présence
 * révèle autant que le champ »* — trier `isOnline: 'desc'` puis masquer le champ
 * laissait lire la présence dans la POSITION.
 *
 * Ici le lecteur a les deux moitiés de la soustraction, et il peut les demander
 * lui-même : le rang d'un auteur sur toute la vie (cette liste) et son volume
 * post-plancher (`GET …/stats`, désormais borné). Un auteur haut dans l'un et au
 * plancher dans l'autre a beaucoup écrit AVANT l'arrivée du lecteur. Le plancher
 * retire le chiffre exact ; sans cette porte, il ne retirait pas le fait.
 *
 * ─── Ce que la porte COÛTE, et c'est écrit parce que ça se décide ────────────
 *
 * Un lecteur planchéisé perd le CLASSEMENT PAR ACTIVITÉ, pas la liste. Les deux
 * surfaces retombent sur l'ordre qu'elles tiennent déjà en second — l'ANCIENNETÉ
 * pour le listing, le LIBELLÉ pour les suggestions — et la dégradation est
 * gratuite : il suffit de ne pas charger la carte d'activité, sans une branche
 * de tri de plus. Un classement qu'on ne peut pas servir honnêtement vaut moins
 * qu'un ordre stable qui ne prétend rien.
 *
 * Classer sur la fenêtre PROPRE du lecteur serait plus riche, et c'est écarté :
 * il faudrait replier ses messages à chaque frappe d'un `@`.
 */
export function mayRankByConversationActivity(readerHistoryFloor: Date | null): boolean {
  return readerHistoryFloor === null;
}
