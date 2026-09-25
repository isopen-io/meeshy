## Leçon 122 — un rollback « inconditionnel » qui écrit `undefined` dans React Query ne défait rien (2026-08-12, routine messaging, cycle 88)

**Contexte.** Deux mutations de réaction gardaient leur rollback derrière `if (context?.previousData)`,
ce qui laissait vivre l'état FABRIQUÉ par `onMutate` sur un cache vide. Le correctif évident —
retirer le garde et appeler `setQueryData(key, context?.previousData)` — a laissé les tests
**ROUGES**.

**La leçon.** `setQueryData(key, undefined)` est un **no-op** : React Query interprète `undefined`
comme « ne rien changer » (même règle que pour un updater qui renvoie `undefined`). Restaurer
l'ABSENCE de donnée n'est pas une écriture, c'est un `removeQueries`. Un instantané optimiste a donc
deux états de restauration, pas un :

| `previousData` | Restauration correcte |
|---|---|
| une valeur | `setQueryData(key, previousData)` |
| `undefined` | `removeQueries({ queryKey, exact: true })` |

**Généralisation.** Chaque fois qu'un rollback prétend « remettre exactement l'état d'avant », se
demander si « l'état d'avant » pouvait être *rien*. Beaucoup d'API traitent l'absence comme une
non-instruction plutôt que comme une valeur ; le cas vide est alors le seul que le rollback ne
couvre pas — et c'est précisément celui où `onMutate` a inventé le plus.

**Ce qui l'a attrapé.** Le test RED écrit AVANT le correctif, et surtout re-lancé APRÈS : sans lui,
le rollback inconditionnel aurait été committé comme une correction, avec sa jolie explication, sans
rien corriger du tout. Un correctif qui semble évident mérite quand même son passage au vert.

---
