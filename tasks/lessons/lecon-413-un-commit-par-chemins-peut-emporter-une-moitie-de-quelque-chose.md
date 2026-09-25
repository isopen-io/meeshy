## Leçon 413 — Un commit par chemins peut emporter une MOITIÉ de quelque chose

2026-09-01, arbre partagé, trois sessions. Le commit `ec6d641497` nommait ses
fichiers — il ne nommait pas un répertoire, la leçon précédente était appliquée.
Il a pourtant laissé `dev` non compilable pendant ~40 minutes.

`MeeshyComposerHost.swift` portait, en plus des lignes de son auteur, le WIP
d'une session voisine : un APPEL à `ComposerSurfaceRouting.armsCameraOnAppear`.
La DÉFINITION de cette règle vivait dans `ComposerSurfaceRules.swift`, non
committé. Mesure : `git grep "func armsCameraOnAppear" ec6d641497` → zéro.

> **Un commit par chemins n'emporte pas seulement du code qui n'est pas le sien :
> il peut en emporter une MOITIÉ.** Le fichier voisin qu'on ne nomme pas est
> précisément celui qui rendait le hunk compilable.

C'est un cran plus fin que la leçon 397 (« explicite = les fichiers, jamais un
répertoire ») : ici la liste de fichiers était juste au sens de la règle, et le
défaut vient de ce qu'un fichier NOMMÉ contenait du code étranger dont la
dépendance vivait dans un fichier NON nommé. Emporter du code d'autrui est
visible à la relecture du diff ; emporter un fragment orphelin ne l'est pas —
le hunk se lit comme complet.

**Et l'attribution ne se fait PAS par l'auteur git.** Toutes les sessions
committent sous la même identité (`J. Charles N. M. <jcnm@sylorion.com>`) :
`git log --author` rend un journal qui mélange les trois. Seule l'EMPREINTE DE
FICHIERS sépare deux sessions — comparée aux périmètres que chacune a déclarés.
Le commit a d'abord été attribué à la mauvaise session, et la coordination
qu'il appelait serait partie à la mauvaise adresse.

**Ce qui l'a attrapé** : la session lésée a relu `git status` AVANT de committer
et a vu deux de ses fichiers disparus de la liste des modifiés. Sans cette
relecture, la panne aurait été imputée à son propre commit suivant.

**Pourquoi la vérification FAITE ne suffisait pas** (précision de l'auteur du
commit, qui l'a reprise). Il avait bien vérifié sa liste — **au niveau du
FICHIER** : « aucun fichier du voisin dans mes chemins », et c'était juste à ce
niveau. Le voisin n'était pas dans la liste des fichiers, il était dans le
CONTENU de l'un d'eux. Et vérifier au démarrage n'aurait rien donné : le fichier
était propre quand il a commencé, l'autre session l'a édité pendant que ses
gates tournaient.

> La granularité de la vérification doit être celle du risque. Le risque n'est
> pas « quel fichier je committe » — c'est « quelles LIGNES ce fichier porte au
> moment où je le committe ». Une vérification juste à la mauvaise granularité
> se lit comme une précaution accomplie.

### Comment l'éviter
1. Stager par hunks (`git apply --cached`) et committer SANS chemins — le seul
   geste qui ne peut pas emporter les lignes d'autrui.
2. À défaut : avant de committer un fichier partagé, `git diff -- <fichier>` et
   lire chaque hunk. Un hunk qu'on ne reconnaît pas appelle son fichier voisin.
3. Attribuer par `git show --stat <sha>` confronté aux périmètres déclarés,
   jamais par `--author`.
