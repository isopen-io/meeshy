## Leçon 131 — la leçon 137 s'est reproduite une TROISIÈME fois : le grain du `fetch` doit être celui de l'ITEM, pas celui du cycle (2026-08-12, routine messaging, cycle 90)

**Contexte.** Le cycle 90 a ouvert par `git fetch origin main` (`f96478ff`), lu la tête, et attaqué
les trois défauts restants du pipeline de traduction. Une heure plus tard, RED prouvé et GREEN
obtenu sur les trois, le `fetch` d'avant-PR a rapporté `ee547fa8` : **une session parallèle
(`claude/keen-hamilton-sr0nsc`, PR #2890) avait livré les trois MÊMES défauts**, plus la moitié WS
de la priorité 3, et était déjà sur `main`.

C'est la troisième occurrence (leçons 132, 137, celle-ci). Et cette fois la consigne de la tête
était explicite — « `git fetch` AVANT d'écrire CHAQUE item » — et elle a quand même échoué.

**Pourquoi elle a échoué : le mot « item » n'a pas de grain défini.** La tête présentait la
priorité 2 comme UN bloc de trois défauts d'un même fichier. Je l'ai traitée comme un item, donc
un `fetch`, donc une heure de fenêtre aveugle. La session parallèle, elle, a livré ce bloc en une
passe. Deux lectures honnêtes du même mot, un doublon intégral.

**La règle praticable, cette fois mesurable :**

> `git fetch origin main && git log --oneline -5 origin/main` **avant chaque `Write`/`Edit` de
> production, et de toute façon si plus de ~15 min se sont écoulées depuis le dernier fetch.**
> Un bloc de trois correctifs, ce sont TROIS fetchs, pas un.

Le coût d'un `fetch` est de deux secondes. Le coût d'un doublon a été, cette fois encore, une
heure d'implémentation et de tests entièrement jetée.

**Le salvage a été intégralement négatif — et c'est le résultat normal.** Les 10 tests écrits
passaient tous contre l'implémentation de `main`, ce qui prouve que les deux sessions avaient la
même lecture du défaut ; mais les 7 tests de la session parallèle couvraient strictement plus
(forme canonique, retry partiel, erreur nommant les langues manquantes, double livraison). **Rien
n'a survécu.** Ne pas chercher à sauver par principe : comparer les couvertures, et si l'autre
version domine, jeter sans regret. Ce qui se garde, c'est la LEÇON, pas le code.

**Deux points où la version parallèle était objectivement meilleure — à retenir comme motifs :**

1. **Un plafond FIFO doit être renégocié quand sa clé gagne une dimension.** Passer
   `latestRetranslationTask` de `messageId` à `(messageId, langue)` multiplie le nombre d'entrées
   par le nombre de langues. À plafond constant (5000), l'éviction couvrait N fois moins de
   MESSAGES — et une entrée évincée se lit « jamais retraduit », donc « jamais périmé » : **le
   garde se désarmait tout seul sous charge.** J'avais fait la mise à l'échelle de la clé sans
   toucher au plafond. Règle : toute clé qui gagne une dimension oblige à relire son plafond.
2. **Un retry après succès partiel ne doit redemander que ce qui manque.** Re-pousser les N langues
   quand N−1 sont revenues duplique le travail du worker pool ML — exactement l'incident que le
   deadman sans retry des pipelines voix documente déjà.


---
