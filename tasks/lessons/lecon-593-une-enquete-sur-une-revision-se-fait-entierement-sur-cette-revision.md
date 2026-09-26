## Leçon 593 — Une enquête sur une RÉVISION se fait entièrement sur cette révision : un arbre propre n'est pas un arbre à jour

**Mesuré le 2026-09-12, #6201.** J'ai publié deux affirmations fausses — « aucun
appelant » et « aucun témoin » — dont la première inversait la conclusion d'une
issue de sécurité en « urgence abaissée ». Un pair les a démenties en une passe.

La cause n'est ni un oubli ni une requête trop étroite :

```bash
git show origin/dev:services/.../agent-illustration.ts   # ← la BONNE révision
grep -rn "resolveAgentIllustration" services apps packages  # ← le DISQUE
```

Le worktree était **en retard de douze commits** ; l'appelant et la suite de
tests n'y existaient pas encore. J'ai donc lu le fichier sur `origin/dev` et
cherché ses consommateurs sur un état antérieur.

> **Mélanger `git show <rev>:<chemin>` et `grep` sur l'arbre de travail produit
> une conclusion fausse ET COHÉRENTE : le fichier existe, ses appelants « non »,
> et rien dans la sortie ne signale l'incohérence.** La parade est `git grep
> <rev>` (ou un `fetch` puis mise à jour AVANT d'enquêter), et elle coûte le même
> temps.

**Le piège qui a rendu l'erreur invisible** : `git status` était propre, et
`git rev-parse HEAD` affichait un sha d'apparence fraîche — celui de mon dernier
push, une heure plus tôt. Ni l'un ni l'autre ne dit la distance au distant.

> **Un arbre propre n'est pas un arbre à jour.** La seule mesure qui le dit est
> `git rev-list --count HEAD..origin/dev` après un `fetch`.

Même famille, en miroir : le pair m'avait attribué le lot en lisant la PRÉSENCE
du commit dans mon arbre plutôt que son INTRODUCTION (`git branch -r --contains`
croisé avec `--ancestry-path`). **Présence et provenance sont deux questions ;
révision et arbre de travail sont deux substrats.** Les confondre donne chaque
fois une réponse cohérente et fausse.
