## Leçon 110 — un fichier de test non enregistré au pbxproj ne s'exécute pas, et rien dans le gate ne le dit (2026-08-11, plan message-more-jumps-to-views, Task 3)

Un plan a livré `MessageMoreJumpsToViewsGuardTests.swift` avec ses trois gardes, deux
commits verts, un RED et un GREEN « observés ». Le fichier n'était dans aucune cible :
`Meeshy.xcodeproj` énumère ses sources explicitement (aucun
`PBXFileSystemSynchronizedRootGroup`) et `meeshy.sh` ne lance JAMAIS `xcodegen`. Preuve
définitive dans le bundle produit pendant le run : `nm -a MeeshyTests.xctest/MeeshyTests`
donnait **0** symbole pour la classe, contre 11 pour un témoin voisin.

1. **`-only-testing:` sur une classe inexistante ne fait PAS échouer xcodebuild.** Le run
   sort « vert », et le rouge attendu de la phase RED se confond avec une erreur de
   sélection. Un rouge n'est valable que s'il imprime une ligne
   `Test Case '-[MeeshyTests.<Classe> …]' failed` AVEC le message d'assertion attendu.
2. **Le manifeste `-only-testing` n'est pas une preuve d'exécution.**
   `discover_test_classes()` le construit en grepant les SOURCES : une classe orpheline y
   figure toujours. Seuls font foi le symbole dans `MeeshyTests.xctest` ou une ligne
   `Executed N tests` nommant la classe. Le gate le vérifie désormais lui-même
   (`verify_test_classes_are_compiled`), et un orphelin le rend ROUGE.
3. **« Ne jamais committer le churn pbxproj » ≠ « ne jamais committer le pbxproj ».**
   Appliquée en bloc avant chaque `git add`, la règle jette l'ajout de référence d'un
   fichier NEUF et fait naître mort tout test créé par un plan. Distinguer : churn
   (réordonnancements, UUID régénérés, build number réécrit) → jeter ; 4 lignes nommant le
   fichier neuf (`xcodegen generate` en produit exactement 4, 0 suppression) → committer.
