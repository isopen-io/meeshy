## Leçon 120 — dans un clone superficiel, « en avance / en retard » est une fiction, et `merge-base` le dit (2026-08-12, routine messaging, cycle 86)

Au démarrage, `git log --oneline origin/main..HEAD` annonçait 334 commits d'avance et 340 de retard,
avec un `origin/main` daté de trois jours plus tôt portant des numéros de PR INFÉRIEURS à ceux de la
branche. Tout invitait à conclure à une divergence à réconcilier — et donc à un merge inutile et
risqué. La branche et `main` étaient en réalité **le même commit**.

1. **Le signal qui tranche est `git merge-base HEAD origin/main` qui ÉCHOUE** (aucun ancêtre commun).
   Deux branches d'un même dépôt en ont toujours un : son absence ne dit pas « divergence », elle dit
   « historique tronqué ». Confirmer avec `git rev-parse --is-shallow-repository` et
   `wc -l .git/shallow`.
2. **Le piège d'écriture** : `git merge-base A B | xargs git log -1` sur une sortie VIDE exécute
   `git log -1` sans révision, donc affiche HEAD — et fabrique la preuve rassurante que HEAD est
   l'ancêtre commun. Ne jamais piper un `merge-base` dans `xargs` sans garde.
3. **L'autorité est le distant, pas le ref local.** `git ls-remote --heads origin main` a répondu en
   une commande que `main` valait exactement HEAD. Un `git fetch` ordinaire n'avait pas corrigé le
   ref local greffé ; `git update-ref` sur le sha du distant, si.
4. Corollaire : une routine qui commence par « où en est ma branche ? » doit poser cette question au
   DISTANT tant qu'elle n'a pas vérifié la profondeur du clone.
