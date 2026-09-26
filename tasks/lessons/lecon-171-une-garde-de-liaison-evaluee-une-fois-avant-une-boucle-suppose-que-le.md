## Leçon 171 — Une garde de liaison évaluée UNE fois avant une boucle suppose que le lien tient jusqu'au bout, alors que la file existe précisément parce qu'il a déjà lâché (2026-08-14, routine temps réel, cycle 20)

`SocketIOOrchestrator.processPendingMessages()` lisait `getSocket()` en tête de fonction, vérifiait
`connected`, puis parcourait toute la file d'envoi. Un seul contrôle pour N tentatives réseau
séquentielles, chacune pouvant durer jusqu'à 10 s d'attente d'ack.

**Le signal de reconnaissance** : une garde de ressource posée AVANT une boucle qui consomme cette
ressource à chaque tour n'est pas une garde, c'est un pari sur sa stabilité. Et le pari est ici
perdant par construction : **la file n'existe QUE parce que le lien a déjà lâché une fois**. Le
contexte qui déclenche la boucle est aussi celui qui la fait échouer. Chaque fois qu'une structure
de rattrapage (file hors ligne, backlog de retry, queue de reprise) est vidée par une boucle,
demander : « la condition qui a rempli cette file peut-elle revenir pendant que je la vide ? » La
réponse est presque toujours oui.

**L'aggravation qui rend le défaut coûteux** : la boucle retirait l'entrée de la file
(`shift()`) et annulait sa minuterie d'expiration AVANT de tenter l'envoi. Sur lien mort, l'appel
d'envoi rendait `{ success: false }` immédiatement, sans rien émettre — donc toute la file
s'effondrait en une rafale, **des échecs sans aucune tentative réelle**. La règle : ne retirer un
travail de sa file qu'une fois la ressource constatée disponible ; sinon un échec de ressource
devient un échec de travail, et le travail perd le budget que sa file lui donnait.

**La frontière à ne pas franchir** : remettre en file après une tentative RÉELLE (ack en erreur,
coupure survenue pendant l'attente) ferait tourner la boucle indéfiniment sur un lien vivant. La
distinction est « le lien était-il mort AVANT que je tente ? » — pas « ai-je échoué ? ».

**Corollaire d'ordre — une file qu'on peut doubler n'est pas une file.** Le chemin d'envoi direct
du même fichier ne regardait que la liaison, jamais le reliquat : un message tapé pendant le vidage
partait avant des messages plus anciens encore en attente. Sur une messagerie, l'inversion est
définitive — l'horodatage serveur est le seul ordre que porte le fil, et il entérine l'arrivée.
Dès qu'une boîte d'envoi existe, la règle est : **tant qu'elle contient quelque chose, on entre par
la queue**. La liaison ne décide plus que de la suite (attendre une reconnexion, ou relancer le
vidage sur-le-champ) — et cette relance n'est pas optionnelle, faute de quoi on échange une
inversion d'ordre contre un blocage.

**Corollaire `finally`** : une sortie anticipée ajoutée au milieu d'une fonction qui pose un verrou
booléen en tête (`isProcessingQueue = true`) doit s'accompagner du passage sous `try/finally`.
Un verrou de vidage laissé à `true` ne scelle pas un tour, il scelle la file pour la session.
