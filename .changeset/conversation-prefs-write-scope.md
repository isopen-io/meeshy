---
"@meeshy/gateway": patch
---

`PUT /user-preferences/conversations/:conversationId` écrivait une ligne
`UserConversationPreferences` à partir de **deux identifiants fournis par
l'appelant**, sans vérifier ni l'un ni l'autre.

**Fuite inter-locataires (`categoryId`).** `UserConversationCategory` est une
table par utilisateur et privée. La route acceptait n'importe quel `categoryId`,
puis renvoyait la ligne avec `include: { category: true }` : le corps du `200` —
et toutes les lectures ultérieures, qui font la même jointure — rendaient le
`name`, la `color` et l'`icon` de la catégorie d'un **autre utilisateur**. Les
noms de catégorie sont des libellés écrits par l'utilisateur ; c'est une lecture
inter-locataires. Les six routes de `me/preferences/categories.ts` restreignent
pourtant chaque accès à `{ id, userId }` — ce `PUT` était le seul écrivain de
`categoryId` à ne pas le faire. Répond désormais `404 Category not found`, comme
ses routes sœurs, ce qui ne confirme pas l'existence de la catégorie.

**Écriture hors périmètre (`conversationId`).** L'écriture étant un `upsert`,
tout appelant authentifié pouvait créer des lignes de préférences contre des ids
de conversation arbitraires et faire diffuser `USER_PREFERENCES_UPDATED` pour
elles. Répond désormais `403 Not a member of this conversation`, avec le prédicat
déjà utilisé par `GET /conversations` et par les trois routes de
`user-deletions.ts` — aucun accès légitime n'est restreint.

Les deux contrôles vivent dans `writeConversationPreferences`, au même endroit
que l'incrément de `version` et la diffusion : la ligne n'est atteignable que par
cette fonction, donc c'est le seul endroit qu'un futur écrivain ne peut pas
oublier. `reorderConversationPreferences` filtrait déjà sur l'appartenance ;
c'est cette asymétrie qui a rendu le trou visible.

`POST /user-preferences/reorder` borne enfin son lot (`maxItems: 200`) : le
filtre d'appartenance ne s'applique qu'après le parsing et la déduplication.
