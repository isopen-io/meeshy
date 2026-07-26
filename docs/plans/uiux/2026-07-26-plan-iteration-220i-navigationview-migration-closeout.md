# Plan — Iteration 220i : clôture de la migration `NavigationView` → `NavigationStack`

**Date** : 2026-07-26
**Base** : `main` HEAD `ffef1339e`
**Branche** : `claude/quirky-curie-utn21c`
**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-220i-navigationview-migration-closeout.md`

## Objectif

Migrer le **dernier** `NavigationView` des cibles iOS livrées vers
`NavigationStack`, puis convertir la dette épinglée du test de migration en
invariant à zéro.

## Contexte

- Migration entamée en **214i** (`EmojiPickerSheet`, `VoiceProfileManageView`,
  `ShareViewController`), laissée incomplète : `StatusComposerView` était détenu
  par la PR en vol #2275.
- #2275 est retombée. `list_pull_requests` (open) → **0 PR** : aucune contention.
- `NavigationView` est déprécié depuis iOS 16 et se rend en **double-colonne par
  défaut** → à largeur régulière (iPad), une feuille à enfant unique collapse sur
  une colonne de détail vide, masquant le contenu et déplaçant l'unique bouton
  « Fermer ».
- Plancher de déploiement **iOS 16.0** → `NavigationStack` disponible
  inconditionnellement, aucune garde `@available`.

## Étapes

1. **Vérifier l'innocuité du swap** (avant toute édition)
   - [x] Aucun `NavigationLink` / `navigationDestination` dans
         `StatusComposerView.swift` → le conteneur ne sert que titre + toolbar.
   - [x] Aucun `.navigationViewStyle` dans le fichier ni sur les 3 sites d'appel.
   - [x] Les 3 sites d'appel sont bien des `.sheet` (défaut réellement
         atteignable) : `RootViewComponents.swift:743`,
         `ConversationListView.swift:756` et `:767`.

2. **Production** — `StatusComposerView.swift` l. 37
   - [x] `NavigationView {` → `NavigationStack {` (un seul token).

3. **Test** — `NavigationContainerMigrationTests.swift`
   - [x] Ajouter `test_statusComposerView_usesNavigationStack()` sous une section
         `// MARK: - Migrated in 220i`, via l'helper `assertMigrated` existant.
   - [x] Rétrécir l'attendu du balayage à l'ensemble vide et renommer
         `test_noUnexpectedNavigationViewRemains` → `test_noNavigationViewRemains`.
   - [x] Déclarer `let expected: Set<String> = []` (type explicite, pas
         d'inférence sur un littéral inline — pas de compilateur Swift en local).
   - [x] Mettre à jour la docstring de la suite : migration partielle →
         invariant de non-régression.

4. **Vérification**
   - [x] `grep -rn "NavigationView {"` sur les 3 cibles scannées → 0 occurrence.
   - [x] Le fichier de test (qui contient le littéral) vit hors de
         `scannedTargets` → pas d'auto-déclenchement.
   - [x] `NavigationStack {` présent l. 37.
   - [x] Équilibre accolades / parenthèses / crochets des 2 fichiers : 0 / 0 / 0.

5. **Documentation**
   - [x] Analyse 220i.
   - [x] Ce plan.
   - [x] `branch-tracking.md` — pointeur iOS autoritaire.

6. **Livraison**
   - [x] Commit + push sur `claude/quirky-curie-utn21c`.

## Contraintes respectées

| Contrainte | Statut |
|---|---|
| Clés i18n neuves | **0** |
| Édition `.xcstrings` | **0** |
| Logique métier / réseau | **0** |
| Layout / visuel en largeur compacte | **0** (iPhone déjà en pile) |
| Édition `project.pbxproj` | **0** (aucun fichier neuf) |
| Fichiers de production touchés | **1** (+1 / −1 ligne) |

## Gate

CI `iOS Tests`. L'environnement de développement est Linux sans toolchain Xcode
(`which swift swiftc xcodebuild` → aucun) ; les vérifications locales sont donc
par balayage source + tokenizer, et la compilation est prouvée en CI.
