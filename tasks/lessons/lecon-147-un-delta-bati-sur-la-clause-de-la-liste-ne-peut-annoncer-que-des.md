## Leçon 147 — Un delta bâti sur la clause de la LISTE ne peut annoncer que des arrivées

**Contexte** : cycle 111. `GET /conversations?updatedSince=` est le canal de rattrapage des deux
clients. Il réutilise le `whereClause` de la liste — conversation `isActive: true`, participant
actif sans `deletedForMe`. Quatre sorties de vue (fermeture, leave, ban, delete-for-me depuis un
autre appareil) ne pouvaient donc revenir dans aucune réponse. Les deux clients fusionnant en
upsert, la ligne restait affichée jusqu'à la réconciliation complète : 24 h de part et d'autre,
cliquable, sur une conversation où le serveur répond 403.

**La leçon** : les leçons 143 à 145 cherchaient toutes un dénombrement — combien de lecteurs
appliquent la règle sur combien. Ici le dénombrement ne pose même pas la bonne question : **la
clause qui décide ce qu'on SERT est exactement celle qui rend une DISPARITION inexprimable.** Ce
n'est pas un lecteur oublié, c'est un vocabulaire absent. Un endpoint delta dont le `where` est
recopié depuis la liste est un demi-canal par construction, et il le reste quel que soit le nombre
de ses appelants.

**Le réflexe** : devant un endpoint delta, ne pas demander « le filtre est-il correct ? ». Demander
**« quelle valeur de quel champ ferait SORTIR la ligne, et par quel canal le client l'apprend-il ? »**
Si la réponse est « aucun », le canal a besoin d'un second flux — pas d'un `where` amendé, qui
servirait des lignes que le client ne sait pas lire comme des départs.

**Corollaire — l'écriture qui ne bouge pas l'horodatage.** Un `leave` ou un `ban` n'écrit QUE la
ligne `Participant` ; `Conversation.updatedAt` ne bouge pas. Un stream de tombstones qui interroge
la CONVERSATION ne les verrait jamais, et son test passerait au vert sur le seul cas (la fermeture)
qui, lui, bump l'horodatage. Avant d'écrire une requête de disparition : chercher quelle TABLE
l'événement a réellement touchée. Le nom de l'entité affichée n'est pas une réponse.

**Corollaire — le filtre d'appartenance s'inverse pour une sortie.** Le stream « conversations
fermées » ne doit PAS filtrer sur un participant ACTIF : un banni porte `isActive: false`, et c'est
précisément lui qui doit voir la ligne partir. Recopier le filtre d'appartenance de la liste dans la
requête de tombstones cache la sortie à celui qu'elle concerne — un défaut qui se lit comme une
précaution.

**Corollaire de troncature (leçon 112, repayée sans remise)** : une liste de disparitions n'a AUCUN
curseur de reprise — il n'existe pas de « page suivante » de départs à demander. Quand elle déborde,
le seul geste est l'ESCALADE vers la relecture complète, et le débordement se prouve par une sonde
`cap + 1` : une fenêtre de très exactement `cap` tombstones est COMPLÈTE, et l'annoncer tronquée
relit toute la liste pour rien.

**Corollaire de posture (leçon 145, confirmée)** : une recherche de tombstones qui échoue rend
« je ne peux pas affirmer l'exhaustivité » (`truncated: true`, liste vide) et sert la liste. Faire
échouer la LISTE parce qu'on n'a pas su calculer une purge inverse le compromis : afficher les
conversations est le produit, en retirer une est une courtoisie.

**Corollaire de sérialisation (troisième instance dans ce dépôt)** : `fast-json-stringify` retire
tout champ absent du schéma de réponse. Un témoin de route ne peut pas voir ce trou — il lit l'objet
AVANT sérialisation. Tout champ neuf d'une enveloppe Fastify a besoin de SON témoin sur le schéma,
dans le paquet qui le déclare. Le schéma concerné documentait déjà l'incident `cursorPagination` en
commentaire ; la déclaration manquante n'en a pas moins failli être livrée.

---
