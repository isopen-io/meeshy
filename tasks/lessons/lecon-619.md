## Leçon 619

**Un témoin ne garde que ce qu'une INSCRIPTION fait jouer — et la garde qui lit
l'artefact LOCAL ne voit pas l'inscription manquante du dépôt.**

`GallerySceneBackdropUnicityTests.swift` — le témoin de #6791, 148 lignes, 6 cas
— n'était inscrit au `project.pbxproj` sur AUCUNE ref : ni sur les deux branches
qui l'ont écrit, ni sur `dev`. Mesuré, pas déduit :
`git show <ref>:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c` rend **0 sur
les quatre refs**. Il n'a donc jamais été compilé, jamais joué. Le code qu'il
garde est juste ; le canal de statut dit vert ; personne ne ment.

**Pourquoi la garde existante ne pouvait pas l'attraper.**
`verify_test_classes_are_compiled()` (`meeshy.sh:1683`) est juste et bien placée :
elle confronte les classes déclarées au bundle `MeeshyTests.xctest` RÉELLEMENT
produit. Mais elle juge APRÈS le build — et le contrôle de fraîcheur
(`meeshy.sh:389`) a déjà régénéré le `pbxproj` **sans le committer**. Au moment
où elle lit le bundle, le fichier EST compilé. Elle rend vert, l'arbre de travail
porte un `pbxproj` modifié que personne ne remarque, et le dépôt garde une
référence manquante que le prochain `git checkout` emporte.

> Une garde qui mesure l'artefact LOCAL ne peut rien dire de l'artefact COMMITTÉ.
> Les deux se ressemblent tant qu'une étape silencieuse ne les sépare pas — ici
> une régénération non committée, ailleurs une installation, un build, un cache.

**La forme générale, trouvée le même jour sur l'autre substrat.** Une session
voisine mesurait, sur `apps/web-v2`, deux règles livrées en TDD qu'AUCUNE donnée
du corpus ne pouvait faire naître : `/feed` montait 13 `<img>`, zéro `<video>`,
zéro `<audio>`. Deux surfaces, deux équipes, le même piège en 24 h. L'inscription
manquante était le `pbxproj` chez l'un, le corpus et les deux listes
(`package.json` + `ci.yml`) chez l'autre.

**Ce qui rattrape n'est jamais la vigilance, c'est un témoin qui COMPTE les deux
ensembles.** `check_test_registration.sh` confronte les `.swift` de
`MeeshyTests/` au `pbxproj` **de `HEAD`**, avant tout build, et dit toujours ce
qu'il a balayé — vert comme rouge : « 1028 fichiers de test balayés, 1 ABSENT ».
Un compte est ce qui distingue une absence MESURÉE d'une absence déduite d'une
recherche bornée.

Sites : `apps/ios/scripts/check_test_registration.sh`, `meeshy.sh` (appel avant
build). Issues #6839, #6791.
