# Plan — Iteration 220i : `StatusComposerView` → `NavigationStack` (clôture 214i)

**Base** : `main` HEAD `ffef1339e`
**Branche** : `claude/quirky-curie-hvg35q`
**Analyse** : `docs/analyses/uiux/2026-07-26-iteration-220i-statuscomposerview-navigationstack.md`
**Axe** : Intégration plateforme native / HIG — conteneur de navigation déprécié

## Objectif

Fermer la dette ouverte en 214i : migrer le **dernier** `NavigationView` de
l'app iOS et réduire l'attendu du test de balayage à l'ensemble vide, comme
prescrit par la piste 219i (point 4).

## Pré-requis vérifiés

| Verrou | État |
|---|---|
| #2275 (détenait `StatusComposerView`) | **mergée** (`131f7939e` dans `main`) |
| Collision d'essaim | **nulle** — `list_pull_requests` open → `[]` |
| Plancher de déploiement | iOS **16.0** (`project.yml:5`) → `NavigationStack` inconditionnel |
| Branche de travail | recréée depuis `origin/main` (était **11 660 commits** en retard) |

## Étapes

1. [x] Resynchroniser la branche assignée sur `origin/main` HEAD `ffef1339e`.
2. [x] Balayer les 4 cibles livrées → confirmer que `StatusComposerView.swift:37`
       est l'**unique** `NavigationView` restant.
3. [x] Vérifier l'innocuité : aucun `NavigationLink`, `navigationDestination`,
       `navigationViewStyle`, `navigationBarItems` dans le fichier.
4. [x] Substituer `NavigationView {` → `NavigationStack {` (1 mot-clé).
5. [x] Ajouter `test_statusComposer_usesNavigationStack()`.
6. [x] Réduire l'attendu du balayage à `Set<String>()` et renommer
       `test_noUnexpectedNavigationViewRemains` → `test_noNavigationViewRemains`.
7. [x] Élargir `scannedTargets` à **`MeeshyWidgets`** (cible livrée non couverte).
8. [x] Rejouer statiquement les 5 assertions (pas de toolchain Xcode ici).
9. [x] Documenter l'analyse + ce plan, mettre à jour `branch-tracking.md`.
10. [ ] Pousser, ouvrir la PR, attendre la CI `iOS Tests` verte.

## Portée

- **1 fichier de prod, 1 ligne.** 1 fichier de test (déjà enregistré au projet →
  pas de `xcodegen`).
- 0 logique / 0 réseau / 0 clé i18n / 0 couleur / 0 layout / 0 changement visuel
  sur iPhone.

## Gate

CI `iOS Tests` (aucun toolchain Xcode sur le conteneur d'exécution). Fourchette
normale du dépôt : 22–35 min — ne pas conclure au blocage avant 35 min.

## Risques

Quasi nul : substitution d'un mot-clé sur un conteneur mono-colonne pur, à
plancher iOS où l'API cible est inconditionnelle. Le seul risque résiduel est
l'inférence de type de l'ensemble vide dans `XCTAssertEqual` — neutralisé en
écrivant `Set<String>()` explicitement plutôt que `[]`.
</content>
