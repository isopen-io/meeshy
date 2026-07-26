# Plan — Iteration 220i

**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-220i-forced-dark-sheet-contrast.md`
**Branche** : `claude/quirky-curie-bj90ld` · **Base** : `main` HEAD `ffef1339e`
**Essaim** : 0 PR ouverte → 0 collision de fichiers.

## Objectif

Deux pistes héritées du pointeur 219i, toutes deux débloquées :

- **(c)** audit Dark Mode généralisé → corriger la rupture de contraste de
  `ReportMessageSheet` sous le forçage sombre du lecteur de stories.
- **(d)** migrer le dernier `NavigationView` et réduire l'attendu épinglé à l'ensemble vide.

## Étapes

| # | Étape | État |
|---|---|---|
| 1 | Resync `main`, recréer la branche assignée (PR précédente mergée) | ✅ |
| 2 | Balayage jeton-par-jeton (forme directe du défaut 219i) → 0 offenseur | ✅ |
| 3 | Balayage point-de-présentation (forme indirecte) → 8 surfaces examinées | ✅ |
| 4 | `ReportMessageSheet` : `ThemeManager` → `@Environment(\.colorScheme)` | ✅ |
| 5 | `ReportSheetPalette.inputBackground(isDark:)` — seul jeton sans équivalent `MeeshyColors` | ✅ |
| 6 | `StatusComposerView` : `NavigationView` → `NavigationStack` | ✅ |
| 7 | `isDark` mort supprimé ; `colorScheme` conservé **et documenté** (load-bearing) | ✅ |
| 8 | Extraire `WCAGContrast` ; converger la suite 219i en façade | ✅ |
| 9 | `ReportMessageSheetPaletteTests` — 10 tests mesurant le contraste réel | ✅ |
| 10 | `NavigationContainerMigrationTests` : attendu → ensemble vide | ✅ |
| 11 | Vérification hors toolchain (7/7 numériques, 4/4 balayages, tokenizer 0/0/0) | ✅ |
| 12 | Analyse + plan + pointeur de suivi | ✅ |

## Décisions structurantes

1. **`colorScheme`, jamais `ThemeManager`, pour toute surface sous un
   `.preferredColorScheme` imbriqué.** Généralisation de la décision 219i, désormais
   démontrée comme une loi : `MeeshyApp` pilotant `.preferredColorScheme(theme.preferredColorScheme)`
   depuis la même préférence que `ThemeManager.mode`, les deux référentiels coïncident
   partout — `colorScheme` est donc *strictement* meilleur (égal partout, correct en plus
   sous forçage). Le remplacement est un no-op hors forçage.
2. **Aucune valeur de couleur nouvelle.** `ThemeManager.textPrimary` étant défini comme
   `MeeshyColors.textPrimary(isDark:)`, on ne change que la source du booléen : la parité
   est vraie *par construction*, pas par recopie.
3. **La convergence de test se fait en façade, pas en réécriture.** Les 25 sites d'appel de
   la suite 219i restent inchangés mot pour mot → la convergence est vérifiable par `grep`
   plutôt que par relecture, sans risque pour une suite verte (pas de toolchain Swift ici).
4. **Le test de migration change de nature** : d'épinglage de dette tolérée à interdiction
   pure (attendu = ∅).
5. **Piste (e) abandonnée sur constat** : la cible n'est pas expédiée, ses contacts sont
   fabriqués, son bouton d'envoi écrit dans une clé que personne ne lit. Le travail requis
   est produit, pas i18n.

## Gate

CI `iOS Tests`. Aucune édition de `project.pbxproj` (globbing récursif + `xcodegen generate`
en CI).
