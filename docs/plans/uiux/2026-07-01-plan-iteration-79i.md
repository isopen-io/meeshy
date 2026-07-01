# Plan — Iteration 79i (2026-07-01) — iOS

## Objectif
Uniformiser l'affordance de geste HIG « grabber de sheet »
(`.presentationDragIndicator(.visible)`) sur les sheets qui déclarent des
`.presentationDetents` mais n'exposaient pas d'indicateur de glissement. Invariant :
**detents déclarés ⇒ grabber visible** (idiome déjà majoritaire dans le codebase).

## Base
- Branche : `claude/upbeat-euler-4hhon5`, resync sur `main` HEAD `01e55587`.
- Gate CI : `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur 18.2).

## Étapes
1. [x] Recenser les fichiers avec `.presentationDetents` sans `.presentationDragIndicator`.
2. [x] Écarter les faux positifs : `ShareSheet` système (`ProfileUserPostsList`), `CountryPicker`
       (pris par #1178), helper inutilisé `adaptivePresentationDetents`.
3. [x] Ajouter `.presentationDragIndicator(.visible)` sur 7 sheets / 7 fichiers.
4. [x] Vérifier le diff (7 insertions, aucune ligne modifiée).
5. [ ] Commit + push branche.
6. [ ] Ouvrir PR, attendre CI `ios-tests.yml` verte.
7. [ ] Merger dans `main`, supprimer la branche, mettre à jour `branch-tracking.md`.

## Fichiers touchés
- `apps/ios/Meeshy/Features/Main/Components/ConversationPreferencesTab.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`
- `apps/ios/Meeshy/Features/Main/Views/FeedView.swift`
- `apps/ios/Meeshy/Features/Main/Views/ParticipantsView.swift`
- `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`
- `apps/ios/Meeshy/Features/Main/Views/LinksHubView.swift`
- `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift`

## Risques
- **Conflit de merge** : minimal — une ligne adjacente à `.presentationDetents`, emplacement
  non touché par les lots Dynamic Type / i18n / palette en vol.
- **Régression visuelle** : nulle — modificateur natif iOS 16+ sans effet layout ; aucun
  snapshot ne couvre ces sheets.

## Suivi continuité
Différés reportés dans l'analyse 79i § Différés (sheets plein écran, i18n continu, Glass reste,
Dynamic Type grandes surfaces).
