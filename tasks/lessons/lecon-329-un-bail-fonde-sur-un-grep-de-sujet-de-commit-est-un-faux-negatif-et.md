## Leçon 329 — un bail fondé sur un grep de SUJET de commit est un faux négatif, et il fait réimplémenter du travail déjà livré

**Contexte (2026-08-30, lot 6 de la boucle de livraison API).** Avant de réserver
#4146 — un bail périmé depuis plus de deux heures — j'ai vérifié les deux
conditions de reprise, dont « personne n'a livré cette issue » :

```bash
git log --oneline origin/dev --grep "#4146"     # -> vide
```

Vide. J'en ai conclu que rien n'avait été livré, j'ai repris le bail et lancé un
agent pour implémenter les huit critères.

**Les huit critères étaient déjà livrés**, par `ab56f758` (l'extraction) et
`a54c9255` (la garde et les plafonds) — deux commits qui citent `#4146` dans les
**commentaires de code** et dans les **docstrings de test**, et jamais dans leur
sujet. L'agent l'a découvert en LISANT son territoire plutôt qu'en faisant
confiance à mon brief : il a rendu une vérification (16 suites, 441 témoins verts,
`git diff` vide) au lieu d'une implémentation.

> **`git log --grep` interroge le MESSAGE du commit, pas ce que le commit FAIT.**
> Un dépôt qui n'impose pas le numéro d'issue dans le sujet rend cette recherche
> silencieusement incomplète — et son échec a exactement la forme d'un succès :
> une liste vide se lit « personne n'a travaillé dessus », jamais « ma question
> était mal posée ».

C'est la forme du cycle 107 (« un balayage qui cherche UN idiome mesure sa
popularité, pas une propriété ») appliquée à l'historique plutôt qu'au code, et
celle de la leçon 261 (« une énumération porte DEUX affirmations ») appliquée à
un grep : `git log --grep "#n"` prouve « ces commits nomment #n dans leur sujet »,
jamais « ce sont les commits qui livrent #n ».

**Ce qui l'attrape, et c'est bon marché** : chercher dans le CONTENU des diffs,
pas dans les sujets —

```bash
git log --oneline -S"#4146" origin/dev          # le numero entre/sort d'un diff
git log --oneline --all --grep "#4146" --regexp-ignore-case   # sujet ET corps
grep -rn "#4146" services/gateway/src --include=*.ts | head  # l'arbre, tout simplement
```

Le troisième est le plus sûr et le plus rapide : **un lot qui livre une issue en
laisse la trace dans les fichiers, même quand il ne la laisse pas dans l'historique.**

**Deux corollaires de manœuvre.**

- **Un bail dit ce que je vais ÉCRIRE, jamais ce qui reste à faire.** La bonne
  réponse à « le territoire est déjà dans l'état cible » n'est pas de trouver
  quelque chose à écrire : c'est de rendre une VÉRIFICATION, de le dire, et de
  poser `to-integrate` sur les commits qui portaient déjà le travail. Écrire une
  ligne de plus sur du code correct et testé aurait été du bruit — et un lot qui
  ne rend rien parce qu'il n'y avait rien à rendre est un lot réussi.
- **Prouver le ROUGE reste dû, même quand on n'implémente rien.** L'agent a
  injecté temporairement la garde naïve que le témoin de décision interdit
  (`comments.ts`, critère 5), constaté **2 témoins rouges**, et reverté dans le
  même geste. Sans cette mutation, « les témoins sont verts » n'aurait attesté
  que leur existence. C'est la seule mesure qui distingue un témoin d'une
  décoration — et elle vaut autant pour un lot de vérification que pour un lot
  d'écriture.
