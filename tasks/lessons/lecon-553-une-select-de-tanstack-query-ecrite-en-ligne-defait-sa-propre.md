## Leçon 553 — Une `select` de TanStack Query écrite EN LIGNE défait sa propre mémoïsation

Le 2026-09-09, la revue-correction du branchement passerelle (D-26,
`apps/web-v3`) a trouvé `messagesQuery` recomposant `messages.map(decodeMessage)`
dans une lambda déclarée À L'INTÉRIEUR de la fabrique de requête. `useBaseQuery`
rappelle `getOptimisticResult(options)` à CHAQUE rendu, et
`QueryObserver#createResult` ne réutilise son résultat mémorisé que si
`options.select === this.#selectFn` — une comparaison par IDENTITÉ de fonction.
Une lambda écrite en ligne est une fonction NEUVE à chaque appel de la fabrique,
donc la comparaison échoue toujours : `select` se rejoue, redécode toute la
page, et rend une référence NEUVE même quand les données n'ont pas changé.

**Pourquoi ça ne tombait nulle part avant.** Le partage structurel de
TanStack (`replaceEqualDeep`) aurait dû absorber le coût — sauf que
`decodeMessage` fabrique une nouvelle instance de `Date` à chaque décodage
d'une chaîne ISO, et `replaceEqualDeep` compare les `Date` par IDENTITÉ. Sur
la source `fixtures`, `toDate` rend TOUJOURS la même instance (les fixtures
sont déjà des objets `Date`) : le défaut est invisible. Il ne se manifeste que
contre des données SERVIES en chaînes ISO — la source `gateway`, la seule que
le témoin visait. Un corpus qui ne peut pas faire échouer un test ne peut pas
le valider.

**La conséquence, en aval.** `threadData.messages` changeant d'identité à
chaque rendu défaisait tout `useMemo` qui en dépendait, et donc la
mémoïsation du fil VIRTUALISÉ à 60 images par seconde de défilement — un
défaut de fluidité (dimension 4) causé par un défaut de maintenabilité
(dimension 11), sur un motif qu'une trentaine d'écrans à venir répètera s'il
n'est pas nommé maintenant.

**La règle.** Toute `select` (ou tout comparateur, tout callback passé à un
hook qui mémoïse par IDENTITÉ) référencée depuis une fabrique de requête est
une fonction de MODULE, jamais une lambda en ligne — au même titre qu'un
`decodeConversations` déjà extrait avant elle. Le témoin qui le prouve compare
l'IDENTITÉ du résultat entre deux rendus consécutifs sans changement de
donnée, contre la source qui décode réellement (jamais contre des fixtures
déjà typées).

Détail : `apps/web-v3/decisions.md` § D-26 (revue-correction, point 1),
`apps/web-v3/src/lib/api/messages.ts`, `apps/web-v3/src/lib/api/messages.test.ts`.
