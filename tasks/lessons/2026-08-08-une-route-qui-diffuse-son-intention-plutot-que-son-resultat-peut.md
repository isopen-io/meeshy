## 2026-08-08 — Une route qui diffuse son INTENTION plutôt que son RÉSULTAT peut mentir sans trace

`POST /user-preferences/reorder` répondait `200` et diffusait le nouvel ordre à tous les
appareils de l'utilisateur alors que son `updateMany` ne matchait aucun document (pas de
ligne `UserConversationPreferences` tant que la conversation n'a jamais été personnalisée).

**Leçons :**
1. **`updateMany` est un no-op silencieux, pas une écriture.** Il ne lève pas, ne renvoie
   pas 404, et son `count` n'est presque jamais lu. Chaque fois qu'un `updateMany` porte
   une intention utilisateur (et non un nettoyage de masse), la question est : « que se
   passe-t-il si la ligne n'existe pas encore ? ». Si la réponse est « le client croit que
   si », c'est un `upsert`.
2. **Diffuser l'entrée de la requête au lieu du résultat de l'écriture rend le mensonge
   invisible.** `broadcast(..., { updates })` reprenait le body ; aucune divergence entre
   ce qui était promis et ce qui était persisté ne pouvait apparaître. Règle : le payload
   d'une diffusion se construit à partir de ce que la base a RENVOYÉ, jamais de ce que
   l'appelant a DEMANDÉ. Corollaire du même invariant que la leçon 2026-08-07 #2.
3. **Un `200` optimiste est un contrat, pas une politesse.** Les deux clients ne restaurent
   leur instantané que sur erreur. Toute route qu'un client commite optimistement doit
   répondre en erreur ce qu'elle n'a pas fait — sinon la divergence est cohérente entre
   appareils, donc indétectable à l'usage, et ne se révèle qu'au refetch.
4. **Passer d'`updateMany` à `upsert` transforme une absence d'autorisation inoffensive en
   faille.** Aucune route de préférences ne vérifie l'appartenance ; tant que l'écriture
   ne matchait rien, ça ne coûtait rien. Règle : tout changement qui rend une écriture
   effective oblige à re-auditer les gardes que l'inefficacité masquait.
5. **Un test dont le NOM cite l'implémentation (« via updateMany ») verrouille le défaut.**
   Celui-ci assertait l'appel plutôt que l'effet, contre un mock qui n'écrit pas : « écrit »
   et « pas écrit » y étaient indiscernables. Troisième récidive de la même racine
   (cycle 10 store gelé, cycle 11 versions codées en dur) — le double doit APPLIQUER ses
   écritures, et l'assertion passer par l'API publique de lecture.
