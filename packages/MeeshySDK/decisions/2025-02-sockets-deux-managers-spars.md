## 2025-02: Sockets - Deux managers spars
**Statut**: Accept
**Contexte**: Messages et feed social ont des cycles de vie diffrents
**Decision**: `MessageSocketManager` (messages temps rel) et `SocialSocketManager` (posts, stories, statuts) comme singletons spars
**Alternatives rejet**: Manager unique (reconnexion d'un type affecte l'autre), trois+ managers (fragmentation excessive)
**Cons**: Code dupliqu (connexion, reconnexion, auth), mais reconnexion indpendante
