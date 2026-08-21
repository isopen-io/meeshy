# Routine calling (audio/vidéo) — Vagues 136-137, poussées mais PAS mergées

Branche `claude/upbeat-dirac-7r1rjt`, poussée sur `origin` (2 commits, HEAD `735cbd11`,
base `origin/main@468e9fc1` — vérifié `git merge-base --is-ancestor` avant de commencer,
Vague 135 déjà mergée). Détail complet dans `tasks/calls-fonctionnel-todo.md` (Vagues 136 et 137).

## Blocage rencontré

Le serveur MCP `github` de cette session n'exposait aucun outil malgré ses instructions
chargées en tout début de session (`ToolSearch` épuisé sur une dizaine de requêtes —
`create_pull_request`, `get_me`, `list_pull_requests`, `pull_request_review_write`, etc. —
aucune ne résout). Pas d'accès `gh` CLI ni API directe autorisé dans cette session. Impossible
de créer la PR, de la surveiller en CI, ou de la merger sur `main` — malgré un push réussi
(`git push` fonctionne, c'est un accès Git normal, pas un accès à l'API GitHub).

## À reprendre dès qu'un outil GitHub fonctionne

1. Ouvrir la PR pour `claude/upbeat-dirac-7r1rjt` → `main` (les deux commits sont prêts,
   testés localement — voir le détail des suites dans `tasks/calls-fonctionnel-todo.md`).
2. Vérifier le CI vert.
3. `git fetch origin main` + merger `main` dans la branche à la main (jamais l'inverse) si
   `main` a avancé depuis `468e9fc1` — résoudre tout conflit sans écraser de travail d'autrui,
   revalider (tsc + suites calls) après le merge.
4. Merger la PR sur `main` (squash ou merge selon la convention déjà observée sur ce dépôt —
   voir l'historique `git log --oneline main` pour le style dominant), fermer la branche.

## Contenu des deux commits (déjà vert localement, voir détail Vague 136/137)

- **Vague 136** — `call:media-toggled` portait le mauvais espace d'identité (gateway +
  web) : un pair coupé son micro/caméra en appel de groupe ne mettait jamais à jour l'icône
  muet/caméra-coupée des autres participants. Gateway + shared + web + 2 fichiers de test.
- **Vague 137** — `canCallBack` (`CallSystemMessage`) manquait le garde `!isAnonymous` que
  porte déjà `canJoin`. Web + 1 fichier de test.

Gates passés localement : gateway `--testPathPatterns="[Cc]all"` 52/52 suites (1218 tests),
`--testPathPatterns="socketio"` 90/90 suites (2078 tests), `tsc --noEmit` gateway 0. Web
`--testPathPatterns="[Cc]all"` 54/54 suites (513 tests), `tsc --noEmit` 1768 erreurs
préexistantes identiques avant/après (0 nouvelle).
