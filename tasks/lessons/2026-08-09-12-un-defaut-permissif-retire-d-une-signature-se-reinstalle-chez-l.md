## 2026-08-09 (12) — Un défaut permissif retiré d'une signature se réinstalle chez l'appelant

**Contexte** — Cycle 32. Le cycle 31 avait rendu `visibility` requis sur
`createStoryCommentNotificationsBatch`, en écrivant que « la faute appartient au build ». Son unique
appelant passait `post.visibility ?? 'PUBLIC'`. Le défaut n'avait pas disparu : il avait changé
d'étage, là où plus rien ne le regarde. Même motif deux fois dans `routes/posts/interactions.ts`,
avec un cast en prime — `(post as { visibility?: string }).visibility ?? 'PUBLIC'` — alors que la
tranche ACL autoritative était chargée **trois lignes plus haut** pour la garde d'interaction.

**Règle** — rendre un paramètre requis n'est pas fini tant que ses appelants n'ont pas été lus. Un
`?? <valeur permissive>` au point d'appel restaure exactement ce qu'on vient de retirer, et il
échappe à tout : au type (la valeur est fournie), au test (le comportement ne change pas), à la
relecture (il est dans un autre fichier). Chercher le motif `?? '<défaut>'` sur le nom du paramètre
dans tout le dépôt fait partie du correctif.

**Corollaire — un cast au point d'appel est l'aveu qu'on devine une valeur qu'on possède ailleurs.**
`(post as { visibility?: string })` disait que la forme rendue par `likePost` n'était pas sûre de
porter le champ. La réponse n'est pas de choisir un défaut pour ce cas, c'est de lire la valeur là
où elle est certaine — ici `postAcl`, déjà en main. Un cast qui rend un champ optionnel est un
signal de provenance douteuse, pas un problème de typage.

**Corollaire — la requiredness protège les harnais pour les ARITÉS, pas pour les objets.** Le cycle
31 a conclu qu'elle ne protège pas la suite (tsconfig exclut `__tests__`, ts-jest en diagnostics
lâches). C'est vrai pour un paramètre-objet (`TS2345` est dans `ignoreCodes`), faux pour un
paramètre positionnel : `TS2554` (mauvais nombre d'arguments) n'y est pas, et le build a désigné
lui-même les deux harnais de `SocialEventsHandler` qui omettaient l'audience. Le choix entre
signature positionnelle et paramètre-objet décide donc aussi de qui surveille les tests.
