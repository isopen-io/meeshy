## Un compte qui lit en anonyme assume la corrélation de présence avec son invité (2026-10-09, #9725)

### Contexte

Depuis #9724, l'invité web d'un lien ouvre sa socket anonyme, comme iOS (`MessageSocketManager.connectAnonymous`). Quand un COMPTE choisit de lire une conversation en anonyme (#8816, #8726), sa socket de compte se ferme et celle de l'invité s'ouvre au même instant. L'invité annonce alors « est dans la conversation » (`conversation:viewing-start`, `ConversationViewingHandler`).

Un ami du compte, membre de la même conversation, peut donc faire le lien : le compte passe hors ligne au moment où « Emma » apparaît dans le fil, et l'inverse au retour. L'auditeur adversarial l'a relevé sur #9724, et iOS émet le même signal.

### Décision du porteur

**Le risque est accepté.** Lire en anonyme depuis un compte est un choix délibéré de l'utilisateur, qui garde la main sur ce qu'il expose. Il peut se déconnecter de son compte avant d'ouvrir le lien, l'ouvrir depuis un autre navigateur ou appareil, ou couper l'affichage de sa présence dans ses préférences.

Aucune présence n'est donc masquée ni retardée pour l'invité tenu par un compte. Le comportement est le même sur le web et sur iOS.

### Conséquences

- Rien ne change dans le code : ce fichier consigne un comportement existant, pour qu'il se lise comme un choix et non comme un oubli.
- Ce que la lecture anonyme garantit : l'invité ne transporte ni le jeton ni l'identifiant du compte (#8816, D-181 web). Le serveur ne relie pas les deux identités.
- Ce qu'elle ne garantit PAS : l'impossibilité, pour un observateur du fil, de déduire le lien à partir des horaires de présence.
- Toute évolution (annonce retardée, présence masquée pour l'invité tenu par un compte) passe par une nouvelle décision du porteur.
