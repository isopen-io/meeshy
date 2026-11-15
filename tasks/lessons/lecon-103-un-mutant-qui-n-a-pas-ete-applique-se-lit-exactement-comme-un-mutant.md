## Leçon 103 — un mutant qui n'a pas été appliqué se lit EXACTEMENT comme un mutant survivant (2026-08-11, routine messaging, cycle 76)

Le RED se prouvait par mutation : `sed` sur le fichier, relance des témoins, restauration.
Trois mutants lancés, **deux annoncés survivants** — donc deux règles porteuses
apparemment non couvertes. La conclusion naturelle était « mes témoins ne discriminent
pas, il faut les renforcer ».

C'était faux. Les deux `sed` avaient une indentation de motif erronée (8 espaces là où le
code en a 4, les lignes vivant dans une closure). Ils n'ont RIEN remplacé. Les témoins
tournaient contre le code d'origine et passaient.

1. **« N passed » après une mutation n'est une information que si la mutation a eu lieu.**
   `sed`/`perl -pi` échouent SILENCIEUSEMENT sur un motif non trouvé : code de sortie 0,
   fichier inchangé. Un mutant se VÉRIFIE avant de se juger — `git diff --stat` sur le
   fichier muté, et mutation par NUMÉRO DE LIGNE (`sed -i '148s|.*|...|'`) après
   localisation au `grep -n`. Refait ainsi, tous les mutants sont tombés du premier coup.
2. **Le faux négatif pousse à SUR-tester, pas à sous-tester** — c'est ce qui le rend
   coûteux sans avoir l'air dangereux. On ajoute des témoins redondants pour une règle
   déjà couverte et on ne découvre jamais que l'instrument de preuve était cassé. « Mon
   témoin nommé pour CETTE règle ne tombe pas alors qu'il devrait » est un signal sur le
   HARNAIS avant d'être un signal sur le témoin.
