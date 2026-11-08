/**
 * Combien de créations de notification un éventail laisse en vol à la fois
 * (#10819, élargi par #17081).
 *
 * **Cette borne arbitre un COÛT, pas un site d'appel** — et c'est tout l'objet
 * de ce fichier. Le coût vient de `createNotification` →
 * `computeConversationUnreadBadge`, qui dit son prix à voix haute : « 2 requêtes
 * + une par conversation NON MUETTE du destinataire ». Chaque création lit en
 * plus une quinzaine de lignes.
 *
 * La mesure qui l'a fixée (production, 2026-10-16) : un message dans Meeshy
 * Global (375 membres) lançait 370 `createMessageNotification` À LA FOIS.
 * Pendant 10 à 14 s, la file Prisma et la boucle d'événements (retard max
 * mesuré : 20 s) faisaient attendre TOUTES les routes de la passerelle —
 * `/receipts`, `mark-as-received`, `messages?after=`, jusqu'aux préflights
 * OPTIONS.
 *
 * Seize créations en vol, c'est quelques centaines de lectures au plus dans la
 * file ; un groupe ordinaire part toujours d'un seul coup, et le débit d'un
 * grand groupe se remesure en production (p95 des routes, retard de boucle)
 * avant d'ajuster ce chiffre.
 *
 * **Pourquoi la constante a QUITTÉ `messageNotificationFanOut.ts` (#17081).**
 * Elle y vivait parce que c'est le site qui avait eu la mesure, et #10819 avait
 * nommé son lot « l'éventail `new_message` » — un nom qui décrit le site mesuré,
 * jamais la propriété. Le lot de MENTIONS paie le même prix par destinataire,
 * plus quatre lectures parallèles, jusqu'à `MAX_MENTIONS_PER_MESSAGE = 50`, et
 * il est resté un `Promise.all` nu : une annonce qui nomme l'équipe lâchait 2 500
 * à 5 000 lectures d'un coup, trois fois le débit jugé fatal. Logée chez le
 * SERVICE qui porte le coût, la borne est au même endroit que ce qu'elle borne —
 * et le prochain éventail la trouvera sans avoir à lire l'historique du premier.
 *
 * Un seul chiffre pour un seul coût : deux bornes divergentes seraient deux lois.
 */
export const MESSAGE_FANOUT_CONCURRENCY = 16;
