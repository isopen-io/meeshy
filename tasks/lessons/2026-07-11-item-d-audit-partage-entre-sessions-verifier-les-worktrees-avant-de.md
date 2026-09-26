## 2026-07-11 — Item d'audit partagé entre sessions : vérifier les WORKTREES avant de développer

En soldant « listeners #5 » de l'audit appels, j'ai réimplémenté (`62b111b80`) une feature déjà
développée EN MIEUX (avec `translated-segment` en plus) par une session parallèle dans
`.claude/worktrees/feat-calls-audit-5-9-remainders` (`2c3f75afa`, branche non mergée, worktree
verrouillé = session active). Mon check « existing work » s'était limité à `git status` + `git log`
sur main : les branches de worktree n'y apparaissent pas. Doublon reverté (`be30cca29`) pour que le
merge de la branche complète atterrisse sans conflit 15-fichiers entre deux implémentations.

**Règles** :
- Avant d'attaquer un item de backlog partagé (audit, tasks/*.md) : `git worktree list` +
  `git log --all --oneline --grep="<mots-clés de l'item>"` — pas seulement l'historique de main.
- Un worktree `locked` sous `.claude/worktrees/` = session active ; sa branche non mergée fait
  partie du « travail existant » au même titre que main.
- En cas de doublon découvert APRÈS push : garder l'implémentation surensemble, reverter l'autre
  immédiatement (avant que quiconque ne bâtisse dessus), et dire pourquoi dans le message du revert.
