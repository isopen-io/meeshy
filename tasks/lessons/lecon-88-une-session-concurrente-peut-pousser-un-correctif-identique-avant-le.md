## Leçon 88 — Une session concurrente peut pousser un correctif IDENTIQUE avant le tien : re-vérifier `gh pr list`/`git branch -r` juste avant de pousser, pas seulement à l'Étape 0 (2026-08-10, routine android-ios-parity, itération 30)

Choisi un run d'archivage pur (`PROGRESS.md` de la lane Android à 1688 lignes, au-delà du seuil de
~1500 documenté par l'itération précédente elle-même). Analyse, découpage et vérification de contenu
menés entièrement en amont — jusqu'à `git add` inclus — avant de brancher/committer. Au moment de
committer, le HEAD du worktree avait déjà changé de branche et portait déjà un commit que je n'avais
pas émis, avec un message quasi identique au mien et un contenu **octet pour octet identique** à mon
propre diff (vérifié par `diff` sur les deux fichiers). `gh pr list --state open` (déjà vide à
l'Étape 0, quelques minutes plus tôt) montrait désormais une PR fraîchement ouverte pour cette
branche. `ps aux` a confirmé une dizaine de processus `claude --dangerously-skip-permissions`
concurrents sur la machine — cet environnement multiplexe plusieurs sessions sur le **même worktree**
(pas seulement sur le repo), au point qu'une autre session peut committer/pousser dans le répertoire
de travail qu'on croyait exclusif, entre deux appels d'outils.

**Ce n'était pas un défaut à arbitrer (cf. Cycle 45b §3 ci-dessous) mais une redondance MÉCANIQUE
totale** — même fichier, même découpage, même message quasi mot pour mot, parce que la tâche
(archiver au même seuil documenté) ne laisse quasiment aucun degré de liberté à deux agents lisant
la même note. Ouvrir une seconde PR aurait produit exactly le doublon documenté par
`feedback_routine_prs_duplicate_same_fix` (mémoire projet) — sans même le mérite d'un correctif
alternatif à comparer. **Le bon geste a été d'adopter la PR déjà ouverte comme livrable de CE run**
(vérifier son diff/CI/mergeabilité, la merger, nettoyer les branches locales orphelines) plutôt que
de pousser une branche concurrente ou de recommencer le travail.

**Règle** : sur ce repo multi-worktree/multi-session, `git status`/`gh pr list --state open` à
l'Étape 0 ne garantit RIEN sur l'état au moment de pousser — re-vérifier les deux, juste avant
`git push`/`gh pr create`, pour une tâche à faible liberté de forme (hygiène, migration mécanique,
renommage) où une collision de contenu identique est plausible. Si une PR identique existe déjà :
ne pas la dupliquer — l'auditer et la conclure (merge si verte, sinon comprendre pourquoi et agir en
conséquence), exactement comme s'il s'agissait de la sienne.
