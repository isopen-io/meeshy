## Leçon 69 — Restaurer une sonde avec `git checkout <fichier>`, c'est jeter tout ce qui n'est pas commité (2026-08-10, routine messaging, cycle 49b)

Pour prouver qu'un test neuf est bien celui qui attrape le défaut, on neutralise le correctif et on
relance (leçon du cycle 45b). Le geste demande donc de **modifier puis restaurer** un fichier de
production. `git checkout -- <fichier>` restaure depuis **HEAD**, pas depuis l'état d'avant la
sonde : sur un fichier qui porte le travail non commité du cycle, il ne défait pas la sonde, **il
défait le cycle**. Dix éditions perdues d'un coup, silencieusement — la commande ne dit rien, et le
fichier a l'air « propre ».

La restauration d'une sonde se fait par **copie** (`cp <fichier> /tmp/x.bak` avant, `cp /tmp/x.bak
<fichier>` après) ou en committant avant de sonder. `git checkout` sur un fichier de travail n'est
jamais la bonne restauration, même quand la sonde est un `sed` d'une seule ligne.

**Signal de rattrapage** : après toute restauration, `grep` une des expressions ajoutées par le
cycle. Ici `grep -n "visibleNotificationsWhere" <fichier>` a rendu zéro ligne, ce qui a montré la
perte en dix secondes au lieu de la laisser sortir en échec de compilation quinze minutes plus tard.
