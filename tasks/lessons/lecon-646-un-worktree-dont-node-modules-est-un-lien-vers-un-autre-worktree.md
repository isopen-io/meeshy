## Leçon 646 — un worktree dont `node_modules` est un LIEN vers un autre worktree mesure le dépôt de CELUI-LÀ, branche comprise

**Le fait.** Reprenant le lot #6396 dans le worktree `-devgate`, `tsc` a rendu
quatre erreurs qu'aucun de mes fichiers ne citait :
`Cannot find module '@meeshy/shared/utils/text-segments'`,
`has no exported member named 'raisedAttachmentProtection'`. J'ai rebâti
`packages/shared` — sans effet. J'ai lancé `bun install --ignore-scripts` —
sans effet. Le fichier source existait, le `dist` était frais, le lien
`node_modules/@meeshy/shared` pointait bien vers `../../../../packages/shared`.

Le lien était juste ; c'est ce qu'il traversait qui ne l'était pas :

```
apps/web-v2/node_modules -> /Users/smpceo/Documents/v2_meeshy/apps/web-v2/node_modules
```

**Le répertoire `node_modules` LUI-MÊME était un lien vers le worktree
principal.** Le chemin relatif du lien de `@meeshy/shared` se résolvait donc
depuis LÀ-BAS, et rendait le `packages/shared` du PRINCIPAL — bâti depuis une
autre branche, où `text-segments` n'existe pas encore. Mesuré par
`cd …/@meeshy/shared && pwd -P`, la seule commande qui traverse toute la
chaîne : `/Users/smpceo/Documents/v2_meeshy/packages/shared`.

Le même lot, sur le même commit, dans un worktree à `node_modules` RÉEL :
`tsc` rc=0, `bun test` 6197/6197.

**Pourquoi c'est plus vicieux qu'une install manquante.** Une install absente se
voit tout de suite : rien ne tourne. Ici tout tourne, et une PART des tests
passe — ceux qui n'atteignent pas le module divergent. `bun test` sur
`avatar-profile-link.test.tsx` était VERT ; il est devenu rouge en ajoutant un
témoin qui montait `FeedPostCard`, lequel importe `rich-text`, lequel importe
`text-segments`. **Le verdict dépendait de la profondeur du graphe d'imports du
témoin**, pas du code.

**La règle.** Devant une erreur de résolution qu'aucun fichier du lot ne cite,
ne pas rebâtir : **suivre le lien jusqu'au bout**, `cd` + `pwd -P` sur le paquet
incriminé, et comparer avec la racine du worktree où l'on croit travailler. Si
les deux diffèrent, le worktree n'est pas isolé — il emprunte l'état d'un autre,
BRANCHE COMPRISE, et aucun gate n'y veut rien dire. Ni `git status`, ni
`git log`, ni la présence du `dist` ne le disent : git et node ne regardent pas
le même arbre.

**Corollaire.** Un worktree emprunteur n'est pas réparable par `bun install` :
l'install écrit à travers le lien, donc dans l'autre worktree. On y travaille
pour git — commiter, pousser — et on porte la VÉRIFICATION ailleurs. La branche
se reprend par `git checkout` dans un worktree sain, ce qui ne coûte rien
puisque le travail est poussé. Parent : « ROUGE des deux côtés du diff mesure
aussi la MACHINE » — ici la machine, c'est le worktree.
