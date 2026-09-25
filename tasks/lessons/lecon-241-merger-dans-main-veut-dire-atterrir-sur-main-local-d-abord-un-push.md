## Leçon 241 — « Merger dans main » veut dire atterrir sur `main` LOCAL d'abord ; un push `HEAD:main` détaché ne compte pas (2026-08-22, fluidité des listes iOS)

J'avais fusionné `feat/ios-list-scroll-fluidity` depuis un worktree DÉTACHÉ sur `origin/main`
et poussé `HEAD:main` — technique « single-push » apprise sur les lots de PR. Le merge était
dans `origin/main`, la CI verte, le worktree supprimé. Au retour : « Tu es sur la branche
main ? » puis « Il faut merger sur local main d'abord ». La branche `main` LOCALE du dépôt
était restée vingt-cinq commits en arrière, sans le merge. Pour celui qui bascule, stashe et
lit `git log` sur cette branche-là, le travail n'était **pas mergé**.

**La règle.** Un merge de feature suit ce circuit, dans cet ordre :

```bash
git fetch origin main:main          # avance rapide SANS checkout — valable si `main`
                                    # n'est checkout nulle part ET n'a aucun commit propre
git worktree add ../v2_meeshy-main main   # si le dépôt principal porte le WIP d'une autre
                                          # session : on ne le déplace JAMAIS
git -C ../v2_meeshy-main merge --no-ff feat/… -m "merge: …"
git -C ../v2_meeshy-main push origin main
git worktree remove ../v2_meeshy-main     # depuis le dépôt principal, pas depuis le cwd retiré
```

Puis la preuve : `git rev-parse refs/heads/main` == `git rev-parse refs/remotes/origin/main`.

**Deux pièges mécaniques rencontrés en le faisant.** `git worktree remove` du répertoire
courant fait échouer tout ce qui suit dans la même ligne (« Unable to read current working
directory ») — retirer depuis le dépôt principal. Et `git rev-parse --short main origin/main`
rend « Needed a single revision » ici : passer par les refs complètes ou deux appels.

Le single-push détaché reste juste pour les LOTS de PR (consigne du 2026-07-21) ; il se
termine simplement par `git fetch origin main:main` pour que la branche locale rattrape
ce qu'on vient de pousser.
