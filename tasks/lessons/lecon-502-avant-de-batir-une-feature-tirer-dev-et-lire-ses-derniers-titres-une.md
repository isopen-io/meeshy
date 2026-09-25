## Leçon 502 — Avant de bâtir une feature, tirer `dev` et lire ses derniers titres : une session voisine l'a peut-être LIVRÉE pendant l'analyse

**Date** : 2026-09-04 · **Contexte** : finalisation de `feat/web-v3-surimpressions` (#5073, le socle
de la feuille « nouveau lien » sans consommateur) · **Coût** : ~500 lignes écrites puis JETÉES
(vue, feuille, porte, 15 témoins — tous verts), et un porteur obligé d'écrire « pull dev encore
pour t'aligner correctement ».

J'ai mesuré le manque (grep des quatre exports : zéro consommateur), lu l'issue #5071, posé les
témoins RED, implémenté GREEN, committé — un TDD impeccable sur un travail qui existait déjà.
`651a41b010 feat(web-v3): la feuille « nouveau lien »` était sur `origin/dev` AVANT que je pose ma
première ligne, avec en plus le correctif Échap et un témoin navigateur de 173 lignes que je n'avais
pas. Mon `git fetch` datait du début de l'analyse ; la livraison voisine est arrivée pendant.

> **Dans un dépôt à sessions parallèles, la question « quelqu'un l'a-t-il déjà fait ? » se pose au
> moment d'ÉCRIRE, pas au moment d'ANALYSER.** L'analyse peut durer une heure ; la fenêtre de
> péremption d'un `fetch` se mesure en minutes. Et le signal ne coûte rien à lire : les TITRES des
> derniers commits de `origin/dev` nomment leurs features.

Le réflexe, avant le premier fichier d'une feature (pas d'un correctif local) :

```sh
git fetch origin && git log --oneline HEAD..origin/dev | head -20   # quelqu'un a-t-il livré MON lot ?
```

Et à l'arbitrage du doublon : **celle qui est SUR dev gagne**, sauf delta mesuré — comparer
feature par feature avant de jeter (ici : leur version avait Échap + e2e ; la mienne n'apportait
que l'horloge injectée, que leur témoin n'exigeait pas car il encadre l'horloge réelle par
`avant = Date.now()` — une assertion RELATIVE, qui n'est pas une bombe datée). Jeter la sienne
n'est pas un échec : c'est le geste qui évite la troisième implémentation divergente.

Parenté : « PR routine doublons » (`feedback_routine_prs_duplicate_same_fix`), « deux PR vertes
même fonction » — même famille, mais ici le doublon naît en MINUTES entre sessions vivantes, pas
en jours entre PR.


---
