## Leçon 377 — Une lecture TRONQUÉE se comporte comme une lecture complète, et ne le dit pas

**Contexte (2026-08-31, #4611).** J'ai voulu savoir si un paramètre était
alimenté en production :

```bash
grep -rn "draftId:" --include='*.swift' apps/ios/Meeshy \
  | grep -v "MeeshyComposerHost.swift" | head -8
```

Les huit lignes rendues venaient toutes de `StoryViewModel+*`. J'en ai conclu
« aucun des quatre sites de montage ne passe `draftId` », je l'ai écrit dans un
doc-comment de production, dans l'inventaire d'une garde, et dans un message de
commit.

**C'était faux.** `StoryTrayActions.swift:194` passe
`draftId: viewModel.pendingDraftId` — la ligne était la vingtième, coupée par le
`head -8`.

> **`head` ne dit pas qu'il coupe.** Une liste tronquée a exactement la forme
> d'une liste complète : rien dans la sortie ne distingue « voici tout » de
> « voici les huit premiers ». La conclusion tirée dessus est une conclusion
> tirée d'un échantillon, présentée comme un relevé.

### Ce qui l'a rattrapé

Une garde de source d'un AUTRE fichier — `StoryTrayWiringGuardTests` — qui
épinglait précisément le maillon que je croyais absent. Elle n'est pas tombée
dans ma passe ciblée de huit classes ; il a fallu la suite **complète**. C'est
la deuxième fois de la journée que le signal vient de là.

### La règle

1. **`head` sert à REGARDER, jamais à CONCLURE.** Avant d'écrire une phrase de
   la forme « aucun site ne… » / « il n'y en a que N », relancer sans `head`, ou
   compter d'abord (`| wc -l`) et n'accepter la troncature que si le compte tient
   dans la fenêtre.
2. Une affirmation d'ABSENCE se mesure sur l'ensemble, jamais sur un préfixe :
   c'est le seul cas où la sortie complète est obligatoire.
3. Et la corriger ne suffit pas à la retirer : ici la phrase fausse avait déjà
   été recopiée à **trois** endroits — un doc-comment de production, un
   inventaire de garde, un message de commit. **Une conclusion se propage plus
   vite qu'elle ne se vérifie.**

Voir [[reference_a_deduced_value_is_not_a_read_value]],
[[reference_targeted_test_runs_miss_sibling_guards]].

**Récidive le 2026-09-01, autre outil, même forme.** Pour savoir si les rappels
de `ComposerSceneSurface` étaient tous alimentés, j'ai lu le site de montage sur
une fenêtre FIXE de 9 000 caractères et conclu que quatre ne l'étaient pas — en
les nommant. Le site en fait 13 562 : les quatre étaient passés dans le tiers
tronqué. **Le compte réel est 18 sur 18.**

Ce n'était plus `head`, c'était `src[start:start+9000]` — et c'est bien la même
leçon : une borne choisie par commodité rend un résultat *plausible*, faux, et
d'autant plus convaincant qu'il nomme des choses précises. Le correctif est le
même à chaque fois : **borner sur la STRUCTURE, jamais sur une taille.** Le site
se lit désormais jusqu'à sa parenthèse ÉQUILIBRÉE, et la garde permanente qui en
est née (`ComposerCallbackWiringGuardTests`) porte la raison dans son
doc-comment, pour que la prochaine fenêtre commode ne soit pas réintroduite.

---
