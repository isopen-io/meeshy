---
"@meeshy/web": patch
---

Retire la clé `hasMore` dupliquée dans l'appel de fusion delta de la liste de conversations

Deux sessions parallèles ont livré la borne de fenêtre de `mergeConversationDelta` ; leur
réunion a laissé `hasMore` deux fois dans le même littéral d'options
(`use-conversations-delta-sync.ts`). Sans effet à l'exécution — les deux occurrences portent
la même valeur — mais c'est une erreur TypeScript (TS1117, « An object literal cannot have
multiple properties with the same name ») sur un chemin que le type-check du web traverse.
