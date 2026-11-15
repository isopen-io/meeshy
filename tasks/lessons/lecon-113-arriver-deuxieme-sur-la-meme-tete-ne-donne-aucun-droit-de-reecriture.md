## Leçon 113 — arriver deuxième sur la même tête ne donne aucun droit de réécriture (2026-08-11, routine messaging, cycle 78)

Ce cycle a écrit, testé et fait passer la CI sur une correction de la page delta tronquée.
Pendant la CI, une session parallèle a mergé la PR #2863 : même défaut, correction plus simple et
mieux instrumentée. Le merge a conflité sur les quatre fichiers.

La tentation est de « fusionner intelligemment » — garder sa propre mécanique en résolution de
conflit. C'est un piège à trois détentes :

1. **Deux mécanismes pour une règle ne se superposent pas.** Leur contrat testé disait « le
   curseur n'avance pas » ; le mien avançait pour paginer. Garder les deux, c'est faire échouer
   leurs témoins — donc les retirer — donc écraser leur travail en prétendant l'intégrer.
2. **Le code déjà mergé a une propriété que le mien n'a pas : il est sur `main`.** Il a été revu,
   il a passé sa CI, d'autres branches partent déjà de lui. Le remplacer par une variante lors
   d'une résolution de merge est une décision d'architecture prise dans le pire endroit possible.
3. **Ce qu'on jette, on le documente.** Le récit, les deux bornes trouvées (reprise sous le
   groupe du haut, résidu des égalités) et le coût mesuré de l'escalade systématique valent plus
   que le code retiré : ils deviennent une tête instruite CONTRE le comportement en place.

Règle : quand `main` a déjà fermé la tête qu'on instruit, on prend `main`, on retire sa propre
plomberie devenue sans consommateur, et on convertit son travail en instruction. On ne se sert
pas d'un conflit comme d'un droit de veto.

Corollaire de cadence : **relire `main` avant d'OUVRIR une tête, pas seulement avant de merger.**
Une tête écrite dans `todo.md` n'est pas une réservation ; trois routines lisent la même liste.
