## Leçon 321 — `issue_write(method: "update")` REMPLACE le corps ; pour ne changer qu'un état, ne passer QUE l'état

**Contexte.** En fermant l'issue #4015 (vérifiée déjà livrée), j'ai appelé la mise à
jour avec `state: "closed"` **et** un `body`. L'API n'a pas fusionné : elle a
**écrasé le corps rédigé par le porteur** par ma reformulation.

**Ce que ça détruit.** Le corps d'une issue est la formulation du BESOIN par celui
qui l'a posé — le critère de fin, le périmètre, les mots choisis. Le réécrire depuis
le titre et la description du milestone produit un texte plausible et FAUX : il a
l'air d'être l'original, et plus rien ne signale l'écart. C'est la même famille que
« inventer une valeur de repli crédible » : le dégât n'est pas la perte, c'est la
substitution silencieuse.

**La règle.** Un appel de mise à jour est un `PATCH` dont chaque champ fourni ÉCRASE.
Donc : **ne passer que les champs qu'on veut réellement changer.** Fermer une issue =
`state` + `state_reason`, rien d'autre. Ce qu'on a à dire va dans un COMMENTAIRE, qui
ajoute au lieu de remplacer. Vaut pour toute API de mise à jour partielle — issue, PR,
milestone, champ de projet.

**Récupération.** GitHub garde l'historique d'édition du corps (menu « … » →
*Edited*), donc l'original est restaurable par un humain — mais pas par moi, et pas
par l'API dont je dispose. **Signaler la bévue à l'endroit où elle a eu lieu** (un
commentaire sur l'issue touchée) fait partie du correctif : sans ça, personne ne sait
qu'il faut aller regarder l'historique.

---
