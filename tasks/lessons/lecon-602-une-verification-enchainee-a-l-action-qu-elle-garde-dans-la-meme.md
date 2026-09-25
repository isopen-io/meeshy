## Leçon 602 — Une vérification enchaînée à l'action qu'elle garde, dans la même commande, n'est pas une garde : c'est un journal (2026-09-13)

**Cas.** Libérer de l'espace en retirant les worktrees « finis ». Pour
`v2_meeshy-claude` — propre, tête dans `dev`, aucun commit hors `dev` — la
commande était `lsof -a -d cwd | grep v2_meeshy-claude; git worktree remove
v2_meeshy-claude`. Le `lsof` a AFFICHÉ trois processus vivants (`zsh`, `gh`,
`sort`) : une autre session Claude, suspendue depuis 49 minutes dans un
`gh api graphql --paginate`, avait son répertoire courant là. Le worktree a
été retiré dans la même seconde, parce que `;` n'attend le verdict de personne.
Rien n'était perdu dans git ; le répertoire a été recréé aussitôt au même
chemin, sur la même branche.

1. **« Propre et absorbé » ne dit rien de l'OCCUPATION.** Les trois critères
   qui prouvent qu'on ne perd aucun travail (`status --porcelain` vide, zéro
   commit hors `dev`, branche poussée) ne disent pas si une session vivante a
   son répertoire courant dedans. C'est un quatrième critère, d'une autre
   nature : un fait de PROCESSUS, pas de dépôt.
2. **La forme opérante** : la vérification est un appel, sa lecture est un
   temps, l'action destructive est un AUTRE appel. Si l'on tient à une seule
   commande, la garde CONDITIONNE l'action
   (`[ -z "$(lsof -a -d cwd | grep …)" ] && git worktree remove …`), elle ne la
   précède jamais par `;`.
3. **Le trailer de session ne désigne pas l'occupant d'un worktree** : la tête
   de `v2_meeshy-claude` portait le trailer d'un pair (c'était la tête de
   `dev`), et ce pair a répondu que ce worktree n'était pas le sien. Un commit
   dit qui l'a ÉCRIT ; seul `lsof` dit qui est LÀ.
