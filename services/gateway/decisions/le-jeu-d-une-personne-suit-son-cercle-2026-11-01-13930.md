## 2026-11-01 : le jeu d'une personne n'est jamais plus visible que ce que son cercle permet

**Statut** : Accepté (lot `jeu-suit-le-cercle`, #13930 — chantier « Cercles de proximité et mode Sang », milestone #215)

**Contexte** : `GameProfileService.viewerKind` classait le lecteur par `amitieAcceptee` (booléen), et `GameStandingService` servait la Flamme, les points et la Gloire à tout ami. La spec (RG-25, RG-28, GAM-01, GAM-02) dit : Ami voit le niveau, la nomination (titres) et le rang ; Proche et au-dessus voient en plus les étincelles et la gloire ; visibilité servie = minimum(réglage du jeu, droits du cercle).

**Décision** :
1. **Le lecteur est classé par la loi** : `GameProfileService.viewerReach(viewer, targetId)` lit `niveauEffectif` (`friendship.ts`) puis `resolveRelationAccess` sur `game.basic` (Ami) et `game.sparksGlory` (Proche). `kind = 'friend'` ssi `game.basic` ouvre ; `sparksGlory` ssi `game.sparksGlory` ouvre. Soi et ADMIN/BIGBOSS voient tout, le blocage ferme. Aucune comparaison de niveaux hors de la loi.
2. **Le minimum est l'effet de la classe** : un réglage `friends` s'ouvre à Ami+, `everyone` au public, `me` à personne ; le réglage ne fait que RESTREINDRE ce que le cercle accorde (`canViewShowcase` et `capShowcaseVisibility` ne changent pas). Sous Ami, le lecteur est public : il ne reçoit que ce que le membre a ouvert à tous.
3. **Étincelles et gloire à Proche+** : `points`, `sparks`, `sparksLifetime`, `glory` sont ABSENTS (jamais nuls) pour un Ami. Soi et ADMIN les reçoivent.
4. **Défaut appliqué, la spec étant muette** : la Flamme et le nombre de trophées restent à Ami+ (#9541) ; les « titres » sont les trophées de la vitrine, qui suit son réglage, donc Ami+. À confirmer par le porteur si GAM-01 (« c'est tout ce que voit un Ami du jeu ») doit aussi les retirer à l'Ami.
5. **Aucun changement du wire** : valeurs `everyone|friends|me` et `UserGameProfileResponse` inchangées. Un ancien client lit des clés absentes comme aujourd'hui pour un non-ami.
6. **Hors périmètre, dit** : la ligue Amis (`LeagueService.acceptedFriends`, toléré par la garde #13927) lit encore « demande acceptée » et montre aux amis les points de la semaine ; sa convergence et sa règle vis-à-vis de Proche sont une issue de suivi.
