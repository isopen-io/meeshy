## Leçon 414 — Un commit par CHEMINS filtre les fichiers, jamais les LIGNES : il peut emporter une MOITIÉ

**Le fait (2026-09-01).** J'ai committé `ec6d641497` avec une liste de 22 chemins
que j'avais vérifiée deux fois : aucun fichier d'une voisine, aucun `pbxproj`.
La liste était juste **au niveau du fichier** et fausse au niveau du CONTENU —
`MeeshyComposerHost.swift` et `ComposerStoryCanvasTests.swift` portaient aussi
le WIP d'une session voisine sur son #4751. Mon commit a emporté 28 lignes que
je n'ai pas écrites, dont un appel à `ComposerSurfaceRouting.armsCameraOnAppear`
**dont la définition vivait dans son `ComposerSurfaceRules.swift` non
committé**. `git grep "func armsCameraOnAppear" ec6d641497` rendait zéro :
`dev` n'a pas compilé jusqu'à son commit suivant.

**Ce que ma vérification ne pouvait pas voir.** Elle répondait à « ce fichier
est-il de mon territoire ? » — la bonne question dans un arbre où chacun a ses
fichiers. Elle ne répond à rien dans un arbre où **trois périmètres se croisent
sur le même hôte**. Et vérifier au DÉMARRAGE ne suffisait pas non plus : le
fichier était propre quand j'ai commencé, la voisine l'a édité pendant que je
mesurais mes gates.

> **Ce qu'un commit par chemins peut emporter n'est pas seulement « du code qui
> n'est pas le mien » : c'est une MOITIÉ de quelque chose.** Le fichier voisin
> qu'on ne nomme pas est exactement celui qui rendait le hunk compilable — par
> construction, puisqu'on ne l'a pas nommé. Un demi-changement casse la
> compilation là où un changement entier, même étranger, ne l'aurait pas fait.

**Le geste.** Lire `git diff -- <mes chemins>` **juste avant** le commit, pas la
liste des chemins. Toute ligne que je ne reconnais pas ⇒ stager par hunks
(`git apply --cached`) et committer SANS chemins. C'est le seul filtre qui
opère à la granularité où le problème existe.

Corollaire d'attribution : **toutes nos sessions committent sous la même
identité git**, donc `--author` ne sépare rien. Seule l'empreinte de FICHIERS
attribue un commit à une session — c'est ainsi que la voisine a corrigé une
attribution qui lui était tombée dessus par erreur.

Voisines : `feedback_git_commit_takes_whole_index_not_just_your_add`,
`reference_git_commit_paths_overrides_the_staged_blob`,
`reference_explicit_paths_means_files_not_a_directory` — les trois disent que
les chemins ne protègent pas de l'INDEX. Celle-ci dit qu'ils ne protègent pas
non plus de l'ARBRE, et pour une raison de granularité, pas de mécanisme.
