# Plan — Iteration 69i (2026-06-30) — iOS

## Objectif
Épuration palette : remplacer les deux couleurs flat hors-charte de `ContactCardView`
(icônes téléphone/e-mail) par les tokens sémantiques `MeeshyColors`. Solde le différé
« Palette tokens » de 68i. Borné, sans surcharge.

## Branche
- Partie de `origin/main` (HEAD `896c4c4`).
- Branche de dev : `claude/upbeat-euler-6wx5br`.

## Changements
1. `apps/ios/Meeshy/Features/Main/Components/ContactCardView.swift`
   - `+ import MeeshyUI` (pour accéder au type nommé `MeeshyColors` ; pattern frère établi).
   - icône `phone.fill` : `Color(hex: "2ECC71")` → `MeeshyColors.success`.
   - icône `envelope.fill` : `Color(hex: "3498DB")` → `MeeshyColors.info`.

## Hors-scope (délibérément)
- Les `Color(hex: accentColor)` (accent déterministe conversation) — conservés.
- Les `color: "3498DB"`/`"2ECC71"` ailleurs (identité de teinte de section, autre pattern).

## Vérification
- CI `ios-tests.yml` : compile Xcode 26.1.x (Swift 6.2) + tests simulateur iOS 18.2.
- Aucun test ne rend ces hex (seul `MessageModelsTests` SDK référence `SharedContact`,
  au niveau modèle — pas de couleur). Pas de régression de test attendue.

## Définition de terminé
- CI iOS verte → merge dans `main` → branche supprimée → traçage mis à jour.
