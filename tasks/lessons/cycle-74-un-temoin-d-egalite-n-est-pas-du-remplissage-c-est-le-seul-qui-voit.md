## Cycle 74 — Un témoin d'égalité n'est pas du remplissage : c'est le seul qui voit les faux verts

1. **Une valeur par défaut non déterministe dans un `init` rend TOUT `XCTAssertNotEqual` entre deux
   instances vacuoirement vert.** `MeeshyConversation.init` défaute `lastMessageAt` à `Date()`, et
   ce champ est replié dans `renderFingerprint` : deux instances construites séparément diffèrent
   toujours. Trois témoins `_changes` sont donc partis verts en verrouillant zéro comportement — ils
   auraient passé sur le code d'AVANT le correctif. **Avant d'écrire un témoin qui compare deux
   instances, lire les DÉFAUTS de l'init** : toute horloge, tout `UUID()`, tout compteur y suffit à
   fabriquer un faux vert.
2. **Corollaire de construction : dériver les variantes d'UNE fabrique paramétrée, jamais construire
   deux objets « pareils ».** « Pareils » est une intention ; « même fabrique, un seul paramètre qui
   change » est une garantie, et elle survit à l'ajout d'un futur champ non déterministe.
3. **Les témoins non-discriminants seuls sont ce qui attrape les faux verts des autres.** Ici, seuls
   les deux témoins d'ÉGALITÉ (stabilité du hash, indépendance à l'ordre d'insertion) pouvaient voir
   le problème — et ils l'ont vu, en CI, sur la première passe. Le cycle 73 notait déjà qu'ils
   « verrouillent ce qui ne doit PAS changer » ; ce cycle montre qu'ils verrouillent aussi la
   validité des témoins voisins.
4. **Un portillon de mémoïsation est un contrat, et un champ affiché mais non replié est un rendu
   MORT, pas une approximation.** `.equatable()` empêche SwiftUI d'appeler `body` : le champ oublié
   n'est pas « rafraîchi en retard », il n'est jamais rafraîchi. Toute évolution qui rend un champ
   VIVANT (le cycle 73 a rendu `lastMessageTranslations` re-émis en temps réel) doit rouvrir le hash
   qui le mémoïse — la mémoïsation reste sinon calibrée sur l'hypothèse d'avant.
5. **Hasher un dictionnaire : trier les clés, combiner chaque composant séparément.** `Dictionary`
   n'a pas d'ordre d'itération stable (hash non déterministe ⇒ portillon qui s'ouvre au hasard,
   c'est-à-dire un défaut MASQUÉ et non corrigé), et une concaténation `clé+valeur` confond
   `["a":"bc"]` et `["ab":"c"]`.
6. **Sans toolchain locale, le RED se prouve par inspection ET se dit comme tel.** Le raisonnement
   sur `keys.sorted().joined(",")` était juste et le témoin headline est passé ; ce que l'inspection
   ne pouvait PAS voir, c'est la validité du dispositif de test lui-même. **Une preuve par lecture
   couvre le code sous test, jamais le harnais qui l'exerce** — d'où l'obligation d'attendre la CI
   avant de conclure, et de ne jamais merger sur la seule foi de l'inspection.
