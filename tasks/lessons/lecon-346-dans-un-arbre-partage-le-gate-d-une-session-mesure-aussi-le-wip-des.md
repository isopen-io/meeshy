## Leçon 346 — dans un arbre PARTAGÉ, le gate d'une session mesure aussi le WIP des autres

**Le fait.** Trois passes de gate consécutives échouées sur `ConversationMediaDoorTests.swift`, un fichier que
je n'ai pas touché, pour un défaut que je n'ai pas introduit : une session voisine venait de rendre
`ComposerSeed.payload` optionnel et n'avait pas encore mis son test à jour. `build-for-testing` compile le
BUNDLE ENTIER — le WIP de n'importe qui bloque le gate de tout le monde.

Ce n'est pas la première fois de la journée : plus tôt, un `MeeshyObjectID` introuvable venait d'un fichier
producteur créé sept minutes APRÈS le début de mon build, et deux builds concurrents ont rendu
`database is locked` (le workspace force `DerivedData` sur `apps/ios/Build`, donc aucun
`-derivedDataPath` ne les sépare).

> **Un échec de gate n'est pas une preuve que le lot en cours est fautif.** Avant de corriger, lire les
> chemins des erreurs : s'ils désignent des fichiers absents de son propre diff, c'est un fait sur
> l'ARBRE, pas sur le lot. `git status --short` et `git diff --stat -- <fichier>` répondent en deux
> commandes, et évitent de « corriger » le travail d'autrui.

**Ce qu'on fait alors, dans l'ordre :**

1. **Ne pas toucher.** Réparer le fichier d'un autre, c'est écraser un état intermédiaire dont on ignore
   la destination — et le mélanger à son propre commit.
2. **Le dire.** `SendMessage` vers la session voisine (`ListAgents` la nomme) : ce qui casse, où, et les
   corrections possibles selon SON intention. Le coût est d'une minute ; l'alternative est que chacun
   redécouvre l'erreur.
3. **Sérialiser ses builds.** Attendre qu'aucun `xcodebuild` ne tourne, puis retenter sur verrou de base —
   patiemment, un build voisin dure une dizaine de minutes.
4. **Committer par CHEMINS**, jamais `git commit -a`. C'est ce qui a permis de livrer huit lots dans la
   journée sans jamais emporter le WIP d'autrui.

**Le corollaire qui compte pour la suite.** La directive « UN worktree, UNE branche » (2026-08-27) a été
prise parce que les worktrees parallèles faisaient PERDRE du travail au merge. Elle échange ce risque
contre celui-ci : des gates qui se gênent. C'est le bon échange — un gate bloqué se voit et se relance,
un hunk perdu au merge ne se voit pas. Mais il faut le savoir, sans quoi on passe la journée à débuguer
le travail des autres en croyant débuguer le sien.
