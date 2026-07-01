# Plan — Iteration 78i (2026-07-01) — iOS épuration palette (rouges erreur/destructif → token)

## Objectif
Consolider les rouges d'état négatif (erreur / expiration / suppression destructive) codés en
dur en `Color(hex:)` vers le token sémantique unique `MeeshyColors.error`, sans changement de
comportement ni de layout.

## Base de départ
`main` HEAD `65c6007` (resync avant démarrage ; branche `claude/upbeat-euler-ceba09`).
Dernière itération iOS mergée = **77i** (i18n `SharePickerView`, PR #1162).

## Étapes
1. [x] Auditer les `Color(hex:)` littéraux ; identifier les rouges d'état négatif vs les
   décoratifs/recording/ladders.
2. [x] Restreindre au cluster non-ambigu : `#F87171` (= token exact) badges expiré ×2 ;
   `#FF6B6B` (coral→error) message d'erreur ×1 + boutons de suppression d'attachment ×5.
3. [x] Vérifier `MeeshyColors` en scope (app : `import MeeshyUI` ; MeeshyUI Media : même module).
4. [x] Vérifier absence de snapshot baseline couvrant ces vues (infra limitée à Timeline).
5. [x] Appliquer 8 swaps `Color(hex:"…")` → `MeeshyColors.error` sur 7 fichiers :
   - app : `StoryViewerView+Content.swift`, `AddParticipantSheet.swift`
   - MeeshyUI : `NotificationRowView.swift`, `AudioPlayerView.swift`, `CodeViewerView.swift`,
     `DocumentViewerView.swift` (×2), `ImageViewerView.swift`
6. [x] Grep de contrôle : plus aucun `Color(hex:"F87171")` hors la définition du token.
7. [ ] Commit + push branche ; gate = CI `ios-tests.yml` (compile Xcode 26.1 + tests 18.2).
8. [ ] Merge dans `main` après CI verte ; supprimer la branche ; mettre à jour branch-tracking.

## Risques / points d'attention
- **`#F87171` = valeur exacte du token** → pixels identiques, zéro risque snapshot/visuel.
- **`#FF6B6B` (coral)** → léger décalage de teinte vers `#F87171`. Assumé et positif : parité
  dark/light + SSOT. Aucun snapshot ne couvre ces vues (vérifié).
- Pas de test neuf : swap mécanique littéral→token, couverture = compile CI.
- Exclusions documentées (recording-red, live-location, ladders décoratifs, DynamicColorGenerator)
  pour éviter toute sur-correction sémantiquement fausse.

## Vérification finale
- [x] `grep` : 0 `Color(hex:"F87171")` hors `MeeshyColors.swift` ; 8 lignes ciblées en
  `MeeshyColors.error`.
- [x] `MeeshyColors` accessible dans les 7 fichiers (refs préexistantes confirmées).
- [ ] CI `ios-tests.yml` verte.
- [ ] Merge `main` + suppression branche + tracking mis à jour.
