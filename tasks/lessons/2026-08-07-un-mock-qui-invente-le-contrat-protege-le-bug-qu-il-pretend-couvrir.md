## 2026-08-07 — Un mock qui invente le contrat protège le bug qu'il prétend couvrir

La file de renvoi web supprimait un message dont l'envoi venait d'échouer. Trois défauts,
une racine unique : **les tests avaient été écrits contre un `sendMessage` imaginaire.**

**Leçons :**
1. **Mocker l'échec comme une rejection quand le vrai service résout toujours = tester du
   code mort.** `mockRejectedValue(new Error(...))` faisait passer les deux tests d'échec,
   mais `meeshySocketIOService.sendMessage` ne rejette sur AUCUN chemin — socket absent,
   ACK expiré, file pleine, échec de chiffrement, erreur serveur résolvent tous
   `{ success: false }`. Le seul comportement réel n'était couvert par rien, et le `catch`
   « testé » était inatteignable. Règle : avant de mocker une dépendance, lire ses `return`
   ET ses `throw` réels ; un mock est une affirmation sur le contrat, pas une commodité.
2. **Une promesse résolue ne prouve pas la livraison.** `await send(...)` suivi d'un
   `remove()` inconditionnel traite un accusé négatif comme un succès. Pour toute API qui
   encode l'échec dans la VALEUR plutôt que par une exception, `try/catch` est la mauvaise
   forme : router sur le champ.
3. **Une garde lue impérativement dans un effet ne peut être évaluée qu'au mauvais moment.**
   Le hook dépendait de `isOnline` mais gardait sur `getConnectionDiagnostics().isConnected`
   — non réactif. `online` précède le handshake Socket.IO de plusieurs secondes, donc la
   garde échouait toujours et rien ne relançait l'effet. Règle : ce sur quoi on garde doit
   être ce dont on dépend. Une garde impérative doublant un état déjà réactif est un bug.
4. **Deux chemins pour la même intention divergent en silence.** Le renvoi MANUEL lisait
   `result?.success ?? false` ; l'AUTOMATIQUE l'ignorait. Comme le trou de parité
   iOS/web du cycle précédent (`SyncWatermark`) : quand un comportement existe en deux
   exemplaires, comparer les deux AVANT de conclure à un arbitrage de design.
5. **Vérifier chaque correctif par mutation, séparément.** Retirer D1/D2/D3 un à un a donné
   4/2/1 rouges — et surtout, le premier jet de D3 était incomplet : le cleanup libérait
   encore le jeton, un run neuf repartait sur un instantané pas encore purgé → doublon.
   Trouvé par le test, pas à la relecture.
