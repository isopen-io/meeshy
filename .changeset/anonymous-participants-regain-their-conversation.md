---
"@meeshy/gateway": patch
---

Les participants anonymes venus par lien de partage se voyaient refuser l'accès à leur propre conversation, et demander un nouveau lien magique ou un nouveau lien de réinitialisation ne révoquait jamais le précédent.

Quatre lectures gardaient un état « pas encore » par une égalité à `null` sur une colonne
qu'aucun créateur n'écrit. Sur le connecteur MongoDB de Prisma, un champ optionnel absent du `create`
n'est pas écrit dans le document : le filtre `{ champ: null }` — une égalité — ne l'apparie pas. C'est
le piège qui avait déjà vidé feed / reels / stories en production (post-mortem en tête de
`services/posts/softDelete.ts`) et fait no-op 100 % des bascules média d'appel
(`CallService.initiateCall`).

- **`canAccessConversation` refusait tous les anonymes.** Aucun des neuf créateurs de `Participant`
  n'écrit `bannedAt` ; `{ bannedAt: null }` n'appariait donc que les rares lignes qu'un
  débannissement avait remises à zéro. Comme seul un contexte d'auth anonyme porte un
  `participantId`, cette porte était fermée à tout arrivant par lien de partage — 403
  « Unauthorized access to this conversation » sur la lecture des messages, l'envoi, les fils, les
  statistiques et la liste des participants. La garde reste en place et reste porteuse : un
  bannissement écrit bien `isActive: false`, mais une restauration de compte rallume `isActive` sans
  regarder `bannedAt`.
- **`PasswordResetService.revokeExistingTokens` et son jumeau magic-link n'atteignaient aucun
  jeton.** `create` ne renseigne pas `usedAt`, donc la colonne est absente de tout jeton encore
  vierge — soit exactement ceux que la révocation existe pour annuler. Chaque demande laissait la
  précédente valide jusqu'à son expiration, et `revokedReason: 'NEW_REQUEST'` n'a jamais été écrit.
- **Le rattachement d'un lien de tracking à son message n'écrivait rien.** La réécriture crée le
  lien avec un `messageId` encore indisponible, donc omis ; le filtre `{ messageId: null }` du
  rattachement post-envoi ne retrouvait pas le lien qu'elle venait de créer.
- **Le compteur `activeTokens` du balayage des jetons périmés rendait toujours 0.**

Le prédicat de lecture porte désormais un nom et couvre les DEUX états « pas encore » — colonne
absente et colonne explicitement nulle : `unsetOrNull(champ)` (`utils/prisma-unset.ts`), pendant côté
lecture du `LIVE_MESSAGE_MARK` côté écriture. Contrairement à une discipline d'écriture, il répare
aussi les lignes DÉJÀ en base.

Les témoins de ces quatre clauses les jugent maintenant en les APPLIQUANT à des documents
(`__tests__/helpers/mongo-where.ts`, qui honore la règle « absent ≠ null ») au lieu de les comparer à
une copie de la clause attendue — un double ordinaire rend ce qu'on lui dit de rendre, et c'est
ainsi que ce piège avait traversé des suites vertes.
