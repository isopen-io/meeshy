## Leçon 182 — XcodeGen ignore silencieusement les clés inconnues : `resources:` n'existe pas sur un target

Le spec XcodeGen n'a **pas** de clé `resources:` au niveau des targets — les
ressources de bundle se déclarent comme entrées de `sources:` avec
`type: folder` (folder reference, arborescence préservée) et
`buildPhase: resources`. Une clé `resources:` posée sur `MeeshyTests` a été
**ignorée sans avertissement** : `xcodegen generate` a réussi, la compile a
réussi, la garde `verify_test_classes_are_compiled` a validé les classes… et
les 60+ tests Lentille ont rougi à l'exécution faute de `fixtures/` et
`design/` dans le bundle (run 31886323298). Deux enseignements :

1. **Un outil de génération qui ne valide pas son entrée transforme une faute
   de schéma en panne d'exécution distante.** Pour toute clé YAML nouvelle dans
   `project.yml`, vérifier qu'elle figure dans la doc ProjectSpec — ne pas
   inférer le vocabulaire depuis d'autres outils (CocoaPods, SPM, Tuist ont
   tous une clé `resources`).
2. **Le message d'échec écrit à l'avance a payé.** Chaque suite vecteur portait
   un `XCTFail` français désignant la ressource, le fichier et la commande à
   vérifier — le diagnostic depuis les logs CI a été immédiat, sans repro
   locale (aucun toolchain Swift ici). Écrire les messages d'échec pour le
   lecteur distant qui n'a QUE les logs.

Corollaire découvert au même run : deux suites cherchaient `reading-modes/` où
la folder reference publie `fixtures/reading-modes/` — quand un chemin de
bundle est une convention partagée entre N suites, le sous-répertoire doit être
une constante partagée, pas une chaîne recopiée.

---
