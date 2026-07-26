# Plan — Itération 221i : sémantique des actions de feuille

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-221i-sheet-toolbar-semantics.md`
**Branche** : `claude/quirky-curie-xo6wvt` (recréée depuis `origin/main` `ffef1339e`)
**Gate** : CI `iOS Tests`

## Objectif

Exprimer les deux actions de barre de `StatusComposerView` par leur **rôle**
(`.cancellationAction` / `.confirmationAction`) plutôt que par leur **côté**
(`.navigationBarLeading` / `.navigationBarTrailing`, dépréciés depuis iOS 17), par
alignement sur le frère structurellement identique `EditPostSheet`.

## Décision de périmètre — pourquoi A a été abandonné en cours de route

Le travail préparé couvrait aussi la migration `NavigationView` → `NavigationStack`
(l. 37). Le webhook de fermeture de #2326 a révélé que **huit PR ouvertes portent déjà
ce changement d'une ligne** (#2335, #2336, #2337, #2338, #2339, #2340, #2341, #2342) et
qu'**aucune** ne porte la sémantique de toolbar (`grep -c cancellationAction` = 0 sur les
huit diffs).

Ajouter une neuvième copie aurait dégradé la file. La branche a donc été **réduite à la
partie non dupliquée**, ce qui la rend complémentaire : lignes disjointes (37 pour la
navigation, 79-94 pour la toolbar), donc fusion propre avec n'importe laquelle des huit,
dans n'importe quel ordre.

## Étapes

| # | Étape | Statut |
|---|---|---|
| 1 | Confirmer #2326 mergée (par `jcnm`, 15:53Z) | ✅ |
| 2 | Recenser les PR ouvertes → 10, dont 8 sur la même piste | ✅ |
| 3 | Diffs des 8 : toutes `StatusComposerView 2 +-`, 0 `cancellationAction` | ✅ |
| 4 | **Réduire la branche à la partie B** (revert de A + de son test) | ✅ |
| 5 | Renuméroter en **221i** (218i/219i/220i déjà revendiqués) | ✅ |
| 6 | Placements sémantiques + commentaire de rationale (l. 79-94) | ✅ |
| 7 | Suite `SheetToolbarSemanticsTests` (3 tests) | ✅ |
| 8 | Épingler les 10 fichiers de dette résiduelle | ✅ |
| 9 | Vérifier 0 chevauchement de ligne avec les 8 PR | ✅ |
| 10 | Vérifier l'équilibre syntaxique (pas de toolchain Swift) | ✅ |
| 11 | Docs, commit, push, PR | ✅ |

## Fichiers

| Fichier | Nature | Delta |
|---|---|---|
| `Meeshy/Features/Main/Views/StatusComposerView.swift` | prod | +7 / −2 (dont 5 de commentaire) |
| `MeeshyTests/Unit/Views/SheetToolbarSemanticsTests.swift` | test (neuf) | 3 tests |

`NavigationContainerMigrationTests.swift` est **délibérément intact** : il appartient à la
PR qui portera la migration du conteneur.

Fichier de test neuf → enregistré par le globbing récursif de `xcodegen generate`,
**0 édition de `project.pbxproj`**. Nom de classe sans token produit → **phase 1** de
`meeshy.sh test` (lecture de sources seule, aucune mutation d'état persistant).

## Non-buts

Ne pas migrer les 10 écrans à placement déprécié : l'item trailing d'une vue **poussée**
est souvent un vrai item de barre, pas une confirmation. Ils sont épinglés, pas migrés.

Ne pas toucher la copie (`common.close` reste « Fermer ») : décision produit.

Ne pas fermer ni fusionner les 8 PR concurrentes : c'est un arbitrage d'essaim qui
revient au propriétaire du dépôt, qui fusionne lui-même les PR de cette piste.

## Risque

Faible. Positions rendues inchangées sur iOS ; les styles explicites des deux labels
l'emportent sur l'emphase par défaut du placement ; le frère `EditPostSheet` expédie déjà
la même construction. **Limite déclarée** : pas de toolchain Swift en local —
vérification par balayage de sources, autorité = CI.
