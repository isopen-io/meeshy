## Leçon 111 — un fichier d'état PARTAGÉ entre routines ne s'écrit que par la routine qui le possède (2026-08-11, routine messaging, cycle 78)

Ce cycle a écrit `tasks/lane-cursor.md` en finalisation, par mimétisme avec les cycles
précédents. Ce fichier est l'état de la routine **Android** (`lane=…`, `android_streak=…`,
sa source de vérité déclarée dans `tasks/android-parity-ios-debt-agent-prompt.md`). Pendant le
même run, cette routine l'a avancé de `streak 2` à `streak 3` : le merge de `main` a conflité,
et une résolution distraite (« garder HEAD ») aurait effacé le compteur d'une autre routine.

Deux règles :

1. **Avant d'écrire un fichier de tâches, chercher qui le DÉCLARE comme sa source de vérité.**
   Un `rg` sur le nom du fichier dans `tasks/` répond en une commande. Écrire dedans « parce
   que le cycle précédent l'a fait » n'est pas une raison — il faut vérifier que le cycle
   précédent était la même routine.
2. **Sur conflit dans un fichier qu'on ne possède pas : prendre `--theirs`, sans discussion**,
   et retirer sa propre écriture plutôt que tenter une fusion des deux états. Un compteur de
   streak n'a pas de fusion sensée.

Corollaire, valable au-delà des fichiers d'état : quand plusieurs routines tournent en
parallèle sur le même dépôt, `git merge origin/main` en fin de cycle n'est pas une formalité —
c'est le moment où l'on découvre ce que les autres ont fait. Ce cycle y a découvert que la PR
#2860 avait livré, en parallèle, la moitié du lot qu'il documentait comme « reste ouvert » :
il a fallu corriger la note AVANT de merger, sinon `todo.md` sortait du cycle avec une
affirmation fausse.
