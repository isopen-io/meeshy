/**
 * **COMBIEN DE CRÉATIONS DE NOTIFICATION EN VOL À LA FOIS** — la borne, et la
 * mesure qui la justifie, pour TOUS les éventails (#10819, #17081).
 *
 * Mesuré en production le 2026-10-16 : un message dans Meeshy Global (375
 * membres) lançait 370 créations À LA FOIS, chacune d'une quinzaine de lectures
 * Prisma plus le badge non lu du destinataire — « 2 requêtes + une par
 * conversation NON MUETTE », dit `computeConversationUnreadBadge`, soit ~1 200
 * au total. Pendant 10 à 14 s, la file Prisma et la boucle d'événements (retard
 * max mesuré : 20 s) faisaient attendre TOUTES les routes de la passerelle —
 * `/receipts`, `mark-as-received`, `messages?after=`, jusqu'aux préflights
 * OPTIONS.
 *
 * ─── Pourquoi la borne vit ICI, et pas chez l'éventail qui l'a mesurée ───────
 *
 * Elle a d'abord été posée dans `messageNotificationFanOut`, le site qui AVAIT
 * la mesure. Mais le coût qu'elle borne n'est pas propre à `new_message` : il
 * est dans `createNotification`, que le lot de MENTIONS paie à l'identique —
 * plus quatre lectures par destinataire — et qui est resté un `Promise.all` NU
 * jusqu'à 50 mentionnés, soit trois fois le débit que #10819 a jugé fatal.
 *
 * **Une borne rangée chez le premier site qui l'a mesurée se lit comme la
 * propriété de ce site.** Elle est ici pour que le prochain éventail la trouve
 * en cherchant « combien en vol ? », et non en relisant l'histoire d'un voisin.
 *
 * Seize créations en vol, c'est quelques centaines de lectures au plus dans la
 * file — un groupe ordinaire part toujours d'un seul coup, et le débit d'un
 * grand groupe se remesure en production (p95 des routes, retard de boucle)
 * avant d'ajuster cette borne.
 */
export const NOTIFICATION_FANOUT_CONCURRENCY = 16;
