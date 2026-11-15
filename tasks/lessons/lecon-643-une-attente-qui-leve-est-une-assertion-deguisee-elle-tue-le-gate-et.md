## Leçon 643 — une attente qui LÈVE est une assertion déguisée : elle tue le gate et emporte le verdict qu'on avait écrit

2026-09-20, #7176 (`check-post-comments.mjs`). Quatre passages ont été nécessaires pour un seul défaut, et les trois premiers ont échoué pour la même raison de fond : **le gate mourait au lieu de parler**.

### Le rouge muet

`waitForSelector`, `waitForFunction`, `locator.click` **lèvent** au dépassement. Poser une attente, c'est donc poser un verdict — un verdict MUET, qui court-circuite celui qu'on a écrit trois lignes plus bas :

```
uncaughtException : page.waitForFunction: Timeout 15000ms exceeded.
```

Ce rouge n'apprend rien : ni quelle attente, ni ce que la page montrait. Et il emporte les **106 assertions suivantes**, qui n'ont jamais été jouées.

Le même fichier portait déjà la bonne forme, vingt lignes plus bas, avec son doc-comment : *« Le dépassement de délai est AVALÉ volontairement : c'est le `check` qui suit qui juge, et qui dit alors OÙ le focus a atterri — un `timeout` de Playwright ne l'aurait pas dit. »* Dès que les trois attentes ont rendu la main, le gate a nommé la cause au passage suivant.

### Ce que la cause était vraiment

`EditForm` prend le focus et place le curseur **à la fin** dans un EFFET, qui court après la peinture. `page.fill` sélectionne tout PUIS tape : quand l'effet s'intercale entre les deux, il défait la sélection et la frappe **s'ajoute**. Le corps du PATCH partait doublé — et seul le schéma SOMBRE tombait, parce qu'il passe en second, sur une machine déjà chargée.

### Les trois faux faits, et pourquoi chacun semblait juste

| ce que j'attendais | pourquoi ça ne fermait pas la course |
|---|---|
| `waitForTimeout(400)` | un délai n'est pas un fait — il parie sur la vitesse de la machine |
| deux lectures identiques du texte | « stable » peut se confirmer sur l'ANCIEN état : rien ne prouve que le repeint a eu lieu |
| « le champ porte une valeur » | il la porte dès le PREMIER rendu, avant que l'effet n'ait couru |

Le fait juste était le **curseur déjà posé** — après lui, plus rien ne défait la sélection.

> **Avant de choisir un fait à attendre, demander ce qui le PRODUIT.** Un état présent au premier rendu ne dit rien des effets qui suivent ; une valeur stable ne dit rien du changement qui n'a pas encore eu lieu. Le fait utile est celui qui vient APRÈS la cause qu'on veut laisser passer.

**Corollaire, quand la course ne se reproduit pas en local** : un test y est vert des deux côtés du diff, donc il ne prouve rien. On double alors la protection — ici l'attente ferme la fenêtre, et vider le champ avant de le remplir fait qu'un reste de fenêtre ne coûte rien (sur un champ VIDE, il n'y a plus rien à quoi la frappe puisse s'ajouter).

**Corollaire d'outillage** : `gh run view --job … --log` ne rend RIEN tant que le run entier est `in_progress` (« logs will be available when it is complete »). Deux de mes quatre passages ont été poussés sans log, à l'aveugle. Attendre la fin du run coûte quelques minutes ; raisonner sans le log en a coûté deux.
