## Leçon 126 — la leçon 132 s'est reproduite en pire : le `git fetch` d'ouverture ne protège de rien, seul celui d'AVANT-CHAQUE-ITEM protège (2026-08-12, routine messaging, cycle 88)

Le cycle 87 avait perdu UN correctif à une session concurrente et en avait tiré la leçon 121, dont
le point 2 disait déjà : « `git fetch origin main` AVANT d'écrire, pas seulement avant de merger.
À refaire aussi en cours de route sur les cycles longs. » Le cycle 88 a ouvert par un `git fetch`
propre — `origin/main` valait exactement HEAD, aucune collision en vue — puis a travaillé trois
heures sans en refaire un. Pendant ce temps, `claude/keen-hamilton-...` (session
`013bGFApHREf7fPySWkrZZ5Y`) livrait la PR #2884 : **les trois mêmes correctifs**, plus deux autres
de la même liste. Découvert au `mergeable_state: "dirty"` de ma propre PR, après six commits et une
CI complète.

1. **Un `fetch` d'ouverture ne dit rien de l'avenir.** Il atteste qu'à l'instant T personne n'avait
   commencé — pas que personne ne commencera. Sur un cycle de plusieurs heures, c'est l'information
   la moins utile du lot. La vérification qui protège est celle qu'on fait **juste avant d'écrire
   chaque item**, et **juste avant d'ouvrir la PR**.
2. **Le coût croît avec la qualité du travail.** Trois correctifs RED-prouvés, 654 suites vertes,
   une PR de 200 lignes, une CI complète de 13 minutes : tout cela était déjà sur `main`, écrit par
   quelqu'un d'autre, avant que ma CI ne finisse. Plus la routine travaille proprement, plus une
   collision non détectée coûte cher.
3. **Le salvage se fait test par test, arbitrage par arbitrage** (leçon 121.3–121.5). Ici : trois
   implémentations quasi identiques → main partout ; deux de mes tests affirmaient MES arbitrages
   (cible canonique rendue, clé de cache normalisée) que main a tranchés autrement → supprimés, pas
   « défendus » ; un seul test m'a survécu, le cas capitalisé (`'FR'`) que la couverture de main ne
   portait pas. **Un cycle entier pour un test.**
4. **Ce qu'il reste à construire.** Tant qu'aucun mécanisme d'exclusion n'existe, la seule défense
   praticable est procédurale et doit vivre dans la tête de cycle, pas dans une leçon qu'on relit
   après coup : *avant d'écrire l'item N, `git fetch origin main && git log --oneline -15 origin/main`
   et chercher le mot-clé de l'item.* Une seconde de commande contre trois heures de travail.

---
