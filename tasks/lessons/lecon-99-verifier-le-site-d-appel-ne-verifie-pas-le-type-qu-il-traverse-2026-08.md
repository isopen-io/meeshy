## Leçon 99 — vérifier le SITE d'appel ne vérifie pas le TYPE qu'il traverse (2026-08-11, routine messaging, cycle 74b)

Le cycle a branché `messageSocket.userUpdated` dans `ConversationSyncEngine`, en copiant le
voisin immédiat (`messageSocket.conversationUpdated`, dix lignes plus haut) qui compile. Ça a
quand même cassé `main` :

    error: value of type 'any MessageSocketProviding' has no member 'userUpdated'

`messageSocket` n'est pas un `MessageSocketManager` mais un `MessageSocketProviding` — un
PROTOCOLE, déclaré 735 lignes plus haut (`private let messageSocket: MessageSocketProviding`).
Le publisher existait bien sur la classe concrète ; il n'existait pas sur le protocole que ce
fichier-là traverse.

1. **Le voisin qui compile prouve que SON symbole est dans le protocole, pas que le vôtre y
   sera.** `conversationUpdated` compilait parce que quelqu'un l'avait ajouté au protocole en son
   temps. Copier la forme d'un appel copie sa syntaxe, jamais ses prérequis de type.
2. **Ajouter un membre à un protocole casse ses CONFORMANTS, pas seulement l'appelant.** Ici deux
   `MockMessageSocket` (SDK et app). Le réflexe `rg "(class|struct).*: *NomDuProtocole"` fait
   partie du correctif, pas d'une vérification optionnelle après coup.
3. **Une relecture attentive n'est pas une relecture typée.** La même passe a bien attrapé deux
   vrais défauts par lecture seule — un `try` à droite d'un ternaire (refusé par Swift) et une
   mutation de dictionnaire pendant son itération. Elle a raté celui-ci parce qu'elle vérifiait
   ce que le code FAIT sans vérifier ce que chaque symbole EST. **Sans toolchain, la question
   « quel est le TYPE de ce receveur ? » se pose explicitement, une commande par receveur
   nouvellement touché** — `rg "let messageSocket"` la répondait en une seconde.
4. **Le coût est asymétrique et connu d'avance** : `sdk-tests` ne tourne qu'APRÈS le merge dans
   cette routine (dispatch = 403), le job dure ~40 min, et une erreur de compilation tue le
   build AVANT que la moindre cible de test compile — donc les 12 témoins Swift du cycle n'ont
   rien prouvé du tout à la première passe. Un symbole nouveau traversant un protocole mérite sa
   vérification explicite avant le merge, pas après.
