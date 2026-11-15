## Leçon 345 — une mesure qui rend `[]` doit prouver qu'elle BALAIE, et `grep` ne le prouve pas toujours

**Contexte (2026-08-30, boucle d'intégration, #4389).** Il fallait savoir si Android
consommait `conversation:deleted` quelque part en production, pour décider si sa jumelle montante
avait un lecteur. La mesure :

```
grep -rn "conversationDeleted" apps/android --include='*.kt' | grep -v "/test/"
  → trois lignes, toutes dans MessageSocketManager.kt (déclaration, exposition, listen)
```

Conclusion apparente : **le flow existe, personne ne le lit.** Ce qui aurait été un défaut plus
large que l'issue traitée — la descendante elle-même n'arrivant nulle part — et une issue était
en préparation.

Elle était fausse. `git grep` sur le même dépôt, le même motif :

```
git grep -n "conversationDeleted" -- 'apps/android/**/src/main/**'
  → …/ConversationListViewModel.kt:432:  messageSocketManager.conversationDeleted.collect { … }
```

Le consommateur existait, à l'endroit le plus évident. `grep` ne le rendait pas — et il ne rendait
pas non plus `class ConversationListViewModel` dans ce fichier, alors que la ligne 238 la porte.
Un fichier dont `grep` rate des lignes ne se signale par rien : il rend un résultat PARTIEL, pas
une erreur.

> **Le danger n'est pas qu'un outil échoue, c'est qu'il échoue en rendant une liste PLAUSIBLE.**
> Trois lignes trouvées, toutes cohérentes entre elles, toutes dans le fichier qu'on attendait —
> rien dans ce résultat ne dit qu'il en manque une quatrième. Une absence mesurée est une
> AFFIRMATION UNIVERSELLE (« aucun site ne fait X »), et le dépôt sait déjà qu'elles se vérifient
> plus durement que les affirmations d'existence : c'est la leçon 261 sur les énumérations de
> sites, et la règle « une garde négative dont le balayage rend `[]` reste verte ».

**La parade, et elle est mécanique** : avant de conclure d'un `[]`, demander à l'outil de prouver
qu'il VOIT. Chercher dans le même périmètre quelque chose dont on SAIT qu'il est là — ici,
`class ConversationListViewModel`, qu'un fichier nommé `ConversationListViewModel.kt` porte
forcément. Si ce témoin de contrôle ne sort pas, l'outil est en cause, pas le dépôt.

C'est exactement ce que les gardes du dépôt font déjà pour elles-mêmes, et la symétrie mérite
d'être dite : `api-path-literal-guard` porte un `it('trouve plus d'un millier de fichiers source')`,
`sparse-fieldset-single-law-guard` un `it('parcourt plus de cent fichiers de route')`. **Ce qu'on
exige d'une garde automatisée, on se le doit à soi-même en ligne de commande.**

**Sur ce dépôt, préférer `git grep`** : il lit l'index plutôt que le système de fichiers, respecte
`.gitignore` (donc ne rend jamais un faux positif venu de `node_modules` ou d'un artefact de
build), et n'a pas eu ce comportement sur les fichiers où `grep` l'a eu.

### Corollaire du même cycle : un double qui ÉNUMÈRE ses membres est un inventaire à tenir

Le même lot a fait rougir le CI Android **deux fois de suite**, sur des suites sans rapport avec
lui — `io.mockk.MockKException`. Un ViewModel avait gagné une collecte de flow ; chaque suite qui
le construit tient SON propre double du socket, qui stubbe ses membres un par un.

La panne ne ressemble pas à « il manque un stub » : elle ressemble à « dix comportements sans
rapport ont cassé », et elle ne se déclare qu'une suite à la fois — corriger le fichier que le CI
nomme ne dit rien des autres. **Le geste juste n'est pas de réparer ce que le CI montre, mais de
demander tous les doubles du module d'un coup** (`git grep -l 'mockk<MessageSocketManager>'` :
trois, dont deux que le premier run n'avait pas nommés).

Même famille que le « double PARTIEL d'un module » du `CLAUDE.md` du gateway, un étage plus haut :
là un double perdait ce que le module GAGNAIT, ici il perd ce que son COLLABORATEUR gagne. Dans les
deux cas, le double est un inventaire, et un inventaire ne prévient jamais qu'il est en retard.
