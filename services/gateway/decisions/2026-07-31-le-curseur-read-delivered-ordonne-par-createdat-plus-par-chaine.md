## 2026-07-31 : Le curseur read/delivered ordonne par `createdAt`, plus par chaine ObjectId

**Statut** : Accept
**Contexte** : La garde de fraicheur atomique de `MessageReadStatusService._advanceCursor` (et son jumeau `isStaleCursorMessageId` du chemin mark-unread, `routes/conversations/messages.ts`) comparait deux ObjectId MongoDB par ordre **lexicographique de chaine hex** comme proxy de chronologie. Un ObjectId n'encode la date de creation qu'a la **seconde** (4 premiers octets) ; les 5 octets suivants sont un aleatoire **par process**. Deux messages crees dans la meme seconde sur des process gateway **differents** (scale horizontal) trient donc par chaine dans un ordre **sans rapport** avec la vraie recence. Consequence : la double coche de l'auteur pouvait se figer sur un message anterieur, voire **reculer** le curseur vers un message plus ancien (resurrection de non-lus) — transitoire, self-healing au prochain recu d'une seconde ulterieure, mais reel.

**Decision** :
- Deux champs `ConversationReadCursor.lastReadMessageCreatedAt` / `lastDeliveredMessageCreatedAt` (`DateTime?`) memorisent le `createdAt` du message pointe. La garde ordonne desormais par ce `createdAt` (precision milliseconde, stable inter-process) via `buildCursorFreshnessGuard` (fonction pure, exportee et testee en isolation). L'ordre ObjectId n'est conserve qu'en **repli** pour les curseurs legacy (`createdAt` null tant qu'une avance ne l'a pas renseigne) et pour un message introuvable (supprime entre l'envoi et le recu).
- Le pair `(id, createdAt)` doit rester coherent chez **tous** les ecrivains du curseur : le chemin mark-unread (`upsert`) ecrit maintenant `lastReadMessageCreatedAt` en meme temps que `lastReadMessageId`. Un `createdAt` laisse perime aurait fausse la garde et rejete des avances de lecture legitimes.

**Alternatives rejetees** :
- **Comparer sur `lastReadAt`/`lastDeliveredAt` (temps de traitement serveur)** : ce n'est pas le temps du message ; deux recus traites a des instants proches ne refletent pas l'ordre des messages.
- **Lire l'etat courant puis decider en memoire** : reintroduit le TOCTOU que la garde atomique dans le WHERE de l'`updateMany` ferme deja (deux appels concurrents liraient le meme curseur non avance).
- **Ajouter un departage ObjectId a `createdAt` egal (meme milliseconde)** : rejete pour la simplicite ; une egalite stricte au milliseconde inter-process est bien plus rare que la collision a la seconde d'aujourd'hui, et se resout au recu suivant (stall transitoire, jamais un recul).

**Consequences** :
- Additif MongoDB : les curseurs existants ont `createdAt` null et empruntent le repli ObjectId jusqu'a leur premiere avance, qui renseigne le champ. Aucune migration/backfill.
- Une lecture `message.findUnique({ select: { createdAt } })` supplementaire par avance de curseur (chemin d'ecriture d'arriere-plan, requete par `_id` — la moins couteuse). Acceptable.

**Tests** : +5 `MessageReadStatusService.test.ts` (helper pur + inversion meme-seconde inter-process : ni recul ni stall), +2 `messages-routes.test.ts` (staleness mark-unread ordonnee par createdAt + ecriture coherente du pair). Suite gateway complete verte (565 suites).
