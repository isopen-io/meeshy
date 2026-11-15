## Leçon 121 — deux sessions de la même routine peuvent écrire le même correctif en parallèle ; la tête instruite ne réserve rien (2026-08-12, routine messaging, cycle 87)

Le cycle 86 a légué une « Priorité 1 » nommée et argumentée. Deux sessions l'ont lue et l'ont
implémentée **en même temps** : celle-ci (`claude/keen-hamilton-tpltop`) et
`claude/keen-hamilton-8m3aqm`, qui a mergé la sienne sur `main` pendant que celle-ci finissait la
vérification. Les deux ont convergé au nom de méthode près — `retractTypingIn`, même signature à id
déjà normalisé, même ordre, même refus de re-résoudre la conversation. Découvert seulement au
`git fetch` final, après trois commits.

1. **Une tête instruite est une file de lecture, pas un verrou.** Elle dit quoi faire ensuite, elle
   ne dit à personne que quelqu'un d'autre l'a commencé. Tant qu'il n'existe pas de mécanisme
   d'exclusion, l'ordre de priorité est un aimant à collisions : plusieurs sessions démarrent par
   l'item 1.
2. **`git fetch origin main` AVANT d'écrire, pas seulement avant de merger.** Le coût est d'une
   seconde ; le coût de l'omission est un correctif entier à jeter. À refaire aussi en cours de
   route sur les cycles longs.
3. **Quand la collision est constatée, la version mergée gagne — sans rejouer les arbitrages.**
   Ici main avait fait deux choix différents des miens (dépendance optionnelle plutôt que requise ;
   `try/catch` au point d'appel plutôt que dans la retraction). Tous deux défendables. Les
   re-litiger aurait produit du churn sur du code déjà revu et mergé, pour une préférence.
4. **Ce qui doit survivre, c'est ce que l'autre n'avait pas.** Mes trois tests de `retractTypingIn`
   (main n'en avait aucun : sa couverture passait entièrement par `ConversationHandler`) et deux
   garanties de coût qu'il n'affirmait pas. Un merge « je prends tout de main » les aurait perdus ;
   un merge « je garde tout de moi » aurait écrasé son travail. Le tri se fait test par test.
5. **Un test à moi affirmait un contrat que la version retenue ne tient pas** (« la retraction ne
   rejette jamais » — vrai chez moi, faux chez main qui garde chez l'appelant). Le garder tel quel
   l'aurait rendu rouge ; le supprimer aurait perdu la couverture. **Le réécrire pour affirmer ce
   que la version retenue garantit vraiment** (l'ordre untrack-avant-I/O) est la seule issue qui ne
   perd rien. Un test importé d'une implémentation concurrente doit être relu contre CELLE qui reste.

---
