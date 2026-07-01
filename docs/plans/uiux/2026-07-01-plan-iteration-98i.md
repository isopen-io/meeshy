# Plan — Iteration 98i (2026-07-01) — AboutView : affordance de copie / diagnostic

## Objectif
Rendre copiables les **données de diagnostic** de `AboutView` (Version/build, Plateforme,
Bundle ID, SDK Version) via la convention iOS native (long-press → menu « Copier »), avec
parité VoiceOver, **sans aucun ajout visuel** (doctrine d'épuration). Thème *copie/sélection*
disjoint du sweep Dynamic Type mené par l'essaim d'agents parallèles.

## Base de départ
- Branche : `claude/upbeat-euler-pgmqop` resynchronisée sur `main` HEAD `381d9c5f`.
- Fichier unique : `apps/ios/Meeshy/Features/Main/Views/AboutView.swift`.

## Étapes
1. [x] Resync branche sur `origin/main`, config git identity.
2. [x] Recensement anti-répétition (`list_pull_requests` + `branch-tracking.md`) → `AboutView`
   + thème copie = disjoints. Numéro 98i (> 97i en vol).
3. [x] Ajouter 3 helpers privés : `versionString` (source unique affichage+copie), `copyLabel`
   (clé `common.copy` existante), `copyValue(_:)` (`UIPasteboard` + `HapticFeedback.success()`).
4. [x] En-tête Version : `.contextMenu { Button "Copier" }` + `.accessibilityAction(named:)`.
5. [x] `infoRow(...)` : idem greffé dans le helper → Plateforme + Bundle ID + SDK Version
   copiables d'un seul point de code.
6. [x] Vérifs : `UIPasteboard` dispo via `import SwiftUI` (parité ShareLinkDetailView) ; 0 clé
   i18n neuve ; équilibrage des accolades relu.
7. [x] Rédiger analyse `2026-07-01-iteration-98i.md` + ce plan.
8. [ ] Commit + push `-u origin claude/upbeat-euler-pgmqop`.
9. [ ] Ouvrir PR (base `main`), attendre CI `ios-tests.yml` verte.
10. [ ] Merge dans `main` après CI verte ; mettre à jour `branch-tracking.md` (pointeur 99i).

## Hors-scope (ne pas faire)
- Dynamic Type (déjà en place sur `AboutView`).
- Copie des liens promo / description / copyright (contenu non-diagnostic → épuration).
- Refactor du bloc en « Copier tout le diagnostic » (bouton visible = surcharge, rejeté).

## Gate
CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur 18.2). Aucun test neuf.
