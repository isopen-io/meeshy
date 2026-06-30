# Plan — Iteration 69i (2026-06-30) — iOS

## Objectif
Solder le différé 68i (« `ContactCardView` hex → tokens ») en l'élargissant à **tous** les
indicateurs *sémantiques* de statut/confirmation encore en hex génériques hors-charte, alignés
sur les tokens `MeeshyColors` (success/warning/info). Pure épuration palette, zéro logique.

## Base de départ
- Branche tirée de `origin/main` (dernier merge `dfdcd28`, iter 71wb web).
- Branche de travail : `claude/upbeat-euler-gzrxp1` (réinitialisée sur main pour éviter toute divergence).

## Étapes
1. [x] `ContactCardView.swift` (app) : `import MeeshyUI` ; téléphone `#2ECC71`→`MeeshyColors.success`,
       email `#3498DB`→`MeeshyColors.info`.
2. [x] `MeeshyAvatar.swift` (SDK) : `dotColor` online→`success`, away→`warning`.
3. [x] `UserIdentityBar.swift` (SDK) : présence (dot + label) online→`success`, away→`warning`.
4. [x] `UserProfileSheet.swift` (SDK) : `e2eeBadge` ×4 `#2ECC71`→`MeeshyColors.success`.
5. [x] `VoiceRecordingView.swift` / `VoiceProfileWizardView.swift` / `VoiceProfileManageView.swift`
       (SDK) : checkmarks/waveform « prêt » → `MeeshyColors.success`.
6. [x] `LiveLocationBadge.swift` (SDK) : dot pulsant live → `MeeshyColors.success`.
7. [x] Vérifier qu'aucun reste `#2ECC71`/`#F39C12` sémantique ne subsiste (les restes = ladders
       catégoriels, hors-scope, laissés intacts).
8. [ ] Commit + push `claude/upbeat-euler-gzrxp1` ; attendre CI `ios-tests.yml` verte.
9. [ ] Merge dans `main` après CI verte ; mettre à jour `branch-tracking.md` ; supprimer la branche.

## Vérification
- Gate = CI `ios-tests.yml` (compile MeeshyUI + app, smoke tests présence existants).
- Aucun nouveau test : swap pur literal→token, pas de comportement testable
  (`dotColor` est `private` ; couverture structurelle existante suffisante).

## Risques
- Faible. Changement visuel mineur (vert générique → emeraude de marque, orange générique →
  ambre de marque). Aucun snapshot/baseline n'assertait ces hex.
