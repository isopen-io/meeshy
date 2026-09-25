## Leçon 567 — Un rapport de validation se lit par la présence de ce qu'il DEVAIT produire, jamais par l'absence d'erreur

2026-09-11, iOS (#6040). Mon script de validation lance onze suites. La tâche
de fond s'est annoncée « completed (exit code 0) » ; j'ai ouvert son fichier de
sortie, lu `RC build=0`, et annoncé au porteur que le découpage était validé.

Le fichier contenait, une fois complet : `RC test=65`, **trois échecs**.

Deux défauts se sont additionnés, et le second est le mien :

1. le script se termine par un `grep` de résumé, **donc il rend le code de
   sortie du `grep`**, jamais celui des tests. `exit 0` ne disait rien de ce
   qu'il enveloppait ;
2. j'ai conclu VERT sur deux lignes, alors que onze suites avaient été
   demandées. **Aucune des onze lignes `Executed N tests` n'était là.**

> Le premier défaut est une ligne de shell. Le second est une manière de lire,
> et c'est celle qui coûte : **on ne vérifie pas qu'un rapport ne contient pas
> d'erreur, on vérifie qu'il contient les mesures qu'on a demandées.** Onze
> suites ⇒ onze lignes `Executed`. Zéro ligne n'est pas « rien à signaler »,
> c'est « rien n'a été mesuré ».

Jumelle exacte de la série C (« un chiffre absurde dans un rapport est plus
souvent l'outil de lecture que la mesure ») et de la mémoire « un code de
sortie lu sans son journal est non lu » — ici dans l'autre sens : un journal lu
sans son code, et tronqué de surcroît. Les deux se ferment de la même façon :
faire dire au script COMBIEN de mesures il attendait, et comparer.

Corollaire pour les scripts : terminer par `exit $RC_TEST`, jamais par la
commande d'affichage.
