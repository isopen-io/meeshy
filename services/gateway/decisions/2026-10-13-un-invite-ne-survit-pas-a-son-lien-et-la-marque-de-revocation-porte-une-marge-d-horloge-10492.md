## Un invité ne survit pas à son lien, et la marque de révocation porte une marge d'horloge (2026-10-13, #10492)

### Contexte

#10470 ferme un gros lien de partage sans attendre l'éviction de ses invités : la révocation en attente s'écrit sur le lien (`ConversationShareLink.guestRevocationPendingAt`), la garde commune (`guestAccessEnd`) la lit, et le balayage horaire la reprend. L'audit adversarial a laissé deux réserves.

- **R4.** La marque est datée par la passerelle qui ferme ; `Participant.joinedAt` par celle qui admet (`@default(now())` est posé par le moteur Prisma, donc par la passerelle, jamais par la base). Deux passerelles dont les horloges dérivent peuvent dater un invité entré avant la fermeture APRÈS la marque : il échappait à la garde commune et à la révocation d'un lien rouvert.
- **R5.** Supprimer la ligne d'un lien emporte sa marque. `AccountPurgeService` supprimait les liens d'un compte sans révoquer leurs invités ; les portes tenaient un lien introuvable pour ouvert (« un lien retiré révoque ses invités ailleurs »), donc ces invités gardaient lecture, écriture et socket.

### Décision

1. **Une marge de dix secondes** (`GUEST_ADMISSION_CLOCK_MARGIN_MS`, `services/guestAccessEnd.ts`). Sous une marque posée, tout invité daté jusqu'à dix secondes après elle est tenu pour entré avant. `pendingRevocationAdmissionCutoff()` est le site unique : la garde commune et `runPendingGuestRevocation` (`admittedUntil`) retirent les mêmes invités.
2. **Un invité dont le lien n'existe plus est refusé** à ses six portes : par la garde commune (`linkMissing`) au REST, à la connexion socket, à la relecture du minuteur et au téléversement ; l'envoi par lien et le rafraîchissement de session le refusaient déjà. Un accès FINI se refuse partout en 410 `GUEST_ACCESS_REVOKED` — l'envoi par lien et le téléversement rendaient un 401, que le client rejoue ; le 401 reste celui d'un jeton que personne ne porte. Les lectures par route d'un INSCRIT entré par lien ne changent pas : il reste membre.
3. **Une suppression de liens révoque d'abord** (`socketio/deleteShareLinksRevokingGuests.ts`) : fermer et marquer, révoquer par `revokeShareLinkGuests`, supprimer les seuls liens révoqués. Un échec propage et laisse le lien fermé et marqué. La purge de compte passe par elle.
4. **Le balayage horaire relève les invités anonymes actifs d'un lien disparu**, lu par la colonne puis par la session embarquée, chaque lien absent étant relu seul avant toute révocation. Un **disjoncteur** (`MISSING_SHARE_LINKS_BREAKER`) arrête la passe sans rien révoquer quand la collection des liens est vide, quand plus de 20 liens manquent, ou quand plus de 3 liens manquent et qu'ils font plus de la moitié des liens tenus : une révocation ne se défait pas, et une base vide ou partielle rend chaque lien introuvable sans erreur. Le relevé tourne par identifiant.
5. **La reprise des marques tourne** : par identifiant, avec un curseur quand la fournée sature, pour qu'une fournée de liens en échec permanent n'affame pas les suivants.

### Alternatives écartées

- *Dater la marque par l'horloge de la base* (`$$NOW`) : `joinedAt` resterait daté par une passerelle, donc les deux dates ne seraient toujours pas sur la même horloge.
- *Un compteur de génération sur le lien, recopié sur l'invité à l'admission* : exact sans aucune hypothèse d'horloge, mais il ajoute un champ à deux modèles et touche l'écriture d'admission. À reprendre si la marge est mise en défaut.
- *Supprimer les liens d'un compte sans attendre la révocation, en se reposant sur le refus du lien introuvable* : les sockets déjà dans la room y resteraient jusqu'à la relecture du minuteur.

### Conséquences

- La marge couvre une dérive de dix secondes, pas davantage. Une dérive supérieure rouvre R4 dans le seul cas d'un lien rouvert pendant que sa révocation attend.
- Fail-closed assumé : un invité entré dans les dix secondes qui suivent la fermeture d'un lien rouvert aussitôt est retiré, et rentre par le lien.
- Un invité resté actif après la purge du compte qui avait créé son lien perd l'accès à la mise en service (410 `GUEST_ACCESS_REVOKED`). À mesurer avant la promotion : le nombre d'invités anonymes actifs dont `shareLinkId` ne désigne plus aucune ligne.
- Un lien dont la révocation échoue pendant une purge de compte reste en base, fermé et marqué, jusqu'au rejeu de la purge (#10021).
- Le disjoncteur laisse passer jusqu'à trois liens absents : une base partielle où trois liens au plus manquent révoque encore leurs invités.
- Restent bornés par la révocation différée et ses relances, non fermés ici : les gestes d'un invité déjà connecté qui ne repassent pas par la résolution de session (lectures par `messageReadAccess`, gestes socket).
