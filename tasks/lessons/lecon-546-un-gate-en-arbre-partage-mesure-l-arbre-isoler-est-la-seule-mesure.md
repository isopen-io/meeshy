## Leçon 546 — Un gate en arbre PARTAGÉ mesure l'arbre ; isoler est la seule mesure

**Contexte** (#5409, même lot). Le build de l'app a échoué sur des fichiers que
je n'avais pas touchés. `lsof` sur le verrou `build.db` a nommé le détenteur :
une AUTRE session travaillait dans le même arbre, avec 8 fichiers du composer en
vol — dont une signature de fonction à moitié changée.

**Ce qu'il ne faut pas faire** : tuer son processus, ni committer le
`project.pbxproj` (il porte les références de ses fichiers neufs, non
committés — la CI casserait sur des chemins absents).

**Ce qui mesure** : `git worktree add` depuis `HEAD`, y copier SES SEULS fichiers
modifiés, régénérer le projet, compiler et tester là. Le verdict porte alors sur
le diff, pas sur l'arbre.

**Deux pièges pratiques mesurés dans la foulée :**
- un build iOS complet dépasse la limite d'un job de fond (`BUILD INTERRUPTED`,
  exit 144) — relancer en avant-plan par tranches, le cache est chaud et chaque
  passe avance ;
- ne PAS committer `project.pbxproj` est SÛR ici, et c'est vérifiable : les
  workflows iOS lancent `xcodegen generate` avant de builder, et `meeshy.sh`
  régénère sur dérive constatée.
