# Plan — Iteration 53i (2026-06-30) — iOS

## Objectif
Épuration palette : éliminer les 4 hex hors-marque codés en dur dans les **composants de
contexte message** (`ContactCardView`, `MessageInfoSheet`) et les remplacer par les tokens
sémantiques `MeeshyColors`. Conforme à la charte (« conversation-context components MUST use
… semantic colors via `MeeshyColors`, never hardcode »).

## Périmètre (2 fichiers, 4 swaps)
1. `apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift`
   - L67 `Color(hex: "2ECC71")` (téléphone) → `MeeshyColors.success`
   - L82 `Color(hex: "3498DB")` (email) → `MeeshyColors.info`
2. `apps/ios/Meeshy/Features/Main/Components/MessageInfoSheet.swift`
   - L257 `Color(hex: "8E8E93")` (Distribué) → `MeeshyColors.neutral400`
   - L270 `Color(hex: "34B7F1")` (Lu) → `MeeshyColors.readReceipt`

## Étapes
- [x] Resync branche assignée sur `main` HEAD
- [x] Explorer les candidats différés (Explore agent) → choix lot épuré
- [x] Vérifier absence de test snapshot asservissant ces hex (aucun)
- [x] Appliquer les 4 swaps (imports MeeshySDK déjà présents, tokens déjà utilisés en place)
- [x] Rédiger analyse + plan
- [ ] Commit + push sur `claude/upbeat-euler-agmynm`
- [ ] Ouvrir PR ; attendre CI iOS verte
- [ ] Merger dans `main` ; mettre à jour `branch-tracking.md` (pointeur iOS → 53i)

## Risque
Minimal : swaps 1:1 hex→token, aucun changement de layout/structure, aucun test ne vérifie
ces couleurs. Tokens déjà importés et utilisés ailleurs dans les deux fichiers.

## Validation
CI `ios-tests.yml` (compile Xcode 26.1.1 / run simu iOS 18.2). Pas de build local SwiftUI.
