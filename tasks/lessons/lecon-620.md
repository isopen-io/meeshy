## Leçon 620

**Une absence mesurée sur un CHEMIN ne mesure pas une FONCTION — et la garde
qu'on vient d'écrire est elle-même un artefact qui attend son inscription.**

Suite directe de la 619, un cran plus haut. `check_simulator_election.sh` et
`check_test_registration.sh` (#6838, #6839) sont nés verts, avec leur fixture,
et n'étaient exécutés par AUCUN workflow. Une garde qui ne tourne nulle part
reproduit exactement le défaut qu'elle corrige : c'est la 619 dont le sujet
n'est plus le témoin mais la garde.

**La mesure qui a failli trancher à l'envers.** Une session voisine a mesuré
« `ci.yml` ne cite aucun chemin sous `apps/ios/` » — exact, zéro occurrence — et
en a conclu qu'aucune garde iOS n'y avait sa place. Or `ci.yml:536` exécute
`scripts/check-swift-viewbuilder.sh`, **une garde iOS logée à la racine**, avec
son propre commentaire qui dit pourquoi : « Ici (ubuntu, quelques secondes)
plutôt que sur le runner macOS : `xcodebuild` coûte ~15 min et meurt à la
première erreur ». Et `ios.yml` ne fait que la CITER en commentaire, sans jamais
la jouer.

> Un `grep` sur un RÉPERTOIRE répond « ce fichier ne parle pas de cet endroit ».
> Il ne répond jamais « ce fichier ne fait pas cette chose ». Pour une garde, la
> question est *qu'est-ce qui est GARDÉ*, pas *où habite le script* — et les deux
> réponses divergent dès qu'un dépôt a plus d'une convention de rangement.

**Ce qui ferme la boucle : un témoin qui ÉNUMÈRE au lieu de recopier.**
`packages/shared/__tests__/ci/ios-gates-ci-parity.test.ts` lit le répertoire
`apps/ios/scripts/` et exige de `ios.yml` qu'il exécute chaque `check_*.sh` —
donc une garde neuve le fait rougir le jour où elle est écrite, sans que
personne ait à penser à lui. Une liste recopiée aurait le défaut qu'elle
surveille. Trois lois, parce qu'une inscription a trois façons de ne pas jouer :
absente du YAML ; présente dans un job `continue-on-error` (qui TOURNE sans
JUGER) ; présente mais suspendue au pool macOS, donc rendue trop tard pour
servir. Plus une quatrième, sur l'énumération elle-même — **`[].every(...)` vaut
`true`** : déplacer le répertoire verdirait le garde en ne vérifiant plus rien.

**Le placement n'est pas un détail : le garde vit où il peut CONSTATER.** Ici
dans la suite `shared`, la seule qui tourne sur CHAQUE PR — même raison que son
voisin `ios-pr-compile-gate.test.ts`, né du même défaut en juillet (« le retrait
du 2026-07-27 est passé inaperçu des semaines durant précisément parce que rien
ne le surveillait »). Un garde hébergé dans le périmètre qu'il surveille se tait
en même temps que lui.

**Preuve, dans la minute.** Inscrite, la garde a immédiatement attrapé une
troisième occurrence du défaut de la 619 :
`PostSceneCardHeightCapGuardTests.swift`, le témoin de #6767 — le commit de TÊTE
de `dev` — présent sur disque, absent du `pbxproj` committé. Trois en un jour
(#6791, #6810, #6767). Le taux n'était pas connu avant d'avoir de quoi le
compter : **une classe de défauts qu'on croit rare est souvent une classe qu'on
n'a aucun moyen de voir.**
