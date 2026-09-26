## Leçon 100 — Un plafond serveur silencieux transforme une pagination en perte de données, et le tri de la route décide s'il est récupérable (2026-08-11, routine messaging, cycle 76)

Le catch-up delta demandait `limit=500` à `GET /conversations?updatedSince=`. La route
répond `Math.min(limit, 100)` sans jamais le dire — ni champ « tronqué », ni erreur, ni
`hasMore` fiable sur ce chemin. Écrit naïvement, le client fusionne les 100 lignes reçues,
avance son watermark au max des `updatedAt` REÇUS, et enjambe définitivement le reste.

Ce qui rend le défaut irrécupérable n'est pas la troncature, c'est **l'orthogonalité du
tri et du filtre** : la route filtre sur `updatedAt` et trie sur `lastMessageAt`. Si elle
triait sur son propre filtre, les lignes coupées seraient exactement « les plus
anciennes » et le watermark suivant les rattraperait tout seul — la troncature ne coûterait
qu'un tour de plus. Avec deux clés distinctes, les lignes coupées sont arbitraires, et
n'importe quel watermark calculé sur ce qui a été reçu passe par-dessus.

1. **Avant d'écrire un client de pagination delta, lire le `Math.min` de la route.** Le
   `limit` qu'on demande n'est pas celui qu'on obtient, et rien dans la réponse ne le
   signale. Ici, iOS demandait 500 depuis toujours ; personne ne l'avait rapproché du
   plafond de 100 écrit trois fichiers plus loin.
2. **La question qui tranche est : « le tri de la route est-il sa clé de filtre ? »**
   Même clé ⇒ la troncature est un simple report, sûre par construction. Clés distinctes
   ⇒ la troncature est une perte, et le client DOIT la détecter. C'est une propriété de
   la ROUTE, pas du client — elle se vérifie dans le `orderBy`, pas dans le hook.
3. **Une page pleine est la seule preuve d'incomplétude disponible**, et elle suffit :
   `length >= limitDemandée` ⇒ ne pas faire confiance au delta, escalader vers la
   relecture complète. Le coût de l'escalade est payé exactement quand elle est justifiée.
4. **Le mensonge et le défaut sont deux choses distinctes.** Corriger `500 → 100` rend le
   code honnête et ne répare rien ; c'est la détection qui répare. Réparer d'abord ce qui
   perd des données, l'hygiène ensuite — sinon on livre un correctif qui se lit comme un
   correctif et n'en est pas un.
