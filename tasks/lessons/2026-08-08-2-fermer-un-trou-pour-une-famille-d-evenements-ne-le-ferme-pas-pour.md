## 2026-08-08 (2) — Fermer un trou pour UNE famille d'événements ne le ferme pas pour ses voisines

Le cycle 13 avait créé `broadcastMessageMutation` pour que les cinq routes REST d'édition/
suppression atteignent les participants hors ligne. Son docstring promet qu'« un sixième
transport ne peut plus rouvrir le trou ». Le trou n'a pas été rouvert pour les messages —
il n'avait jamais été fermé pour les **réactions** : cinq des sept écrivains de réaction
(4 routes REST + le chemin d'agent) n'émettaient que vers la room.

**Leçons :**
1. **Un correctif « point unique » ne protège que la famille d'événements qu'il nomme.**
   `broadcastMessageMutation` couvre `edited`/`deleted` ; réactions, épinglages, accusés
   vivent à côté avec les mêmes deux/trois audiences et personne ne les y avait rattachés.
   Règle : après avoir créé un diffuseur unique, énumérer immédiatement les AUTRES types
   d'événements qui traversent les mêmes audiences et vérifier chacun — le point unique est
   un gabarit à appliquer, pas une barrière qui s'étend toute seule.
2. **Récidive de la leçon 2026-08-07 #1, et cette fois le commentaire menteur était dans le
   correctif précédent.** `enqueueOfflineMessageMutation` affirme être « the REST-side
   counterpart of the guarantee `MessageHandler` gives edits/deletes **and `ReactionHandler`
   gives reactions** ». Écrit en fermant le trou des messages, il énonçait pour les réactions
   une garantie que personne n'avait vérifiée. Corollaire neuf : **une phrase écrite pour
   documenter un correctif est le pire endroit où placer une affirmation non vérifiée** — elle
   hérite de la crédibilité du travail qu'elle accompagne.
3. **Le détenteur d'une capacité unique est le meilleur indicateur des sites qui en manquent.**
   `_enqueueOfflineReactionEvent` était `private` dans `ReactionHandler` : aucun autre écrivain
   ne POUVAIT l'appeler. Règle de repérage : une méthode privée qui implémente une obligation
   PRODUIT (et non un détail interne) est un défaut par construction pour tout autre transport
   du même effet — chercher les autres écrivains AVANT de la rendre partageable.
4. **Le `dedupKey` fait partie du comportement, pas du réglage.** Extraire l'implémentation
   sans lui aurait produit un correctif qui passe les tests « une réaction arrive » et perd
   toujours le deuxième réacteur, `RedisDeliveryQueue` dédoublonnant par (messageId, eventType).
   Une constante d'infrastructure qu'un seul appelant règle correctement est une leçon déjà
   apprise en attente d'être perdue au refactor : la déplacer AVEC le code, testée.
5. **`void promesse` peut tuer le processus sous Node 22** (`--unhandled-rejections=throw` par
   défaut). Un canal best-effort dont tout le contrat est de ne jamais nuire doit attacher un
   `.catch`, même quand l'implémentation actuelle avale déjà ses erreurs — l'implémentation
   actuelle n'est pas le contrat de l'interface.
