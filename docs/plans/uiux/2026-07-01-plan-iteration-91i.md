# Plan — Itération 91i (iOS) : Dynamic Type + VoiceOver `CommunityLinksView`

**Piste** : iOS (suffixe `i`). Base = `main` HEAD `af1fe619`.
**Branche** : `claude/upbeat-euler-l5yima`.
**Gate** : CI `iOS Tests` (SwiftUI ne compile pas sous Linux → CI seule autorité).

## Objectif
Rendre l'écran « Liens communauté » (`CommunityLinksView.swift`) conforme **Dynamic Type** et **VoiceOver**, sans changer layout par défaut, logique, palette ni chaînes i18n. Surface neuve (0 mention historique), disjointe des 4 PR « 90i » en vol (#1224/#1225/#1226/#1228).

## Étapes
1. [x] Vérifier collision : `DataExportView`/`FeedCommentsSheet`/`MagicLinkView`/`NewConversationView` pris → choisir `CommunityLinksView` (libre).
2. [x] Vérifier résolution `MeeshyFont.relative` sans `import MeeshyUI` (précédent `MessageInfoSheet.swift`).
3. [x] Migrer 13/15 `.font(.system(size:))` → `MeeshyFont.relative(size, weight:)`.
4. [x] Garder 2 glyphes figés (héros 40pt état-vide + glyphe 14pt dans cercle fixe 40×40) + commentaire + `.accessibilityHidden(true)`.
5. [x] VoiceOver : `.isHeader` ×2 (titre + section), `.combine` sur carte de stat + état vide, `.accessibilityHidden` sur glyphes décoratifs.
6. [x] Docs analyse + plan + `branch-tracking.md`.
7. [ ] Commit + push + PR ; attendre CI verte ; merger dans `main` ; supprimer la branche.

## Contraintes respectées
- 1 seul fichier de production touché → orthogonal, aucun conflit attendu.
- 0 logique / 0 clé i18n / 0 test neuf (parité doctrine sweep).
- SDK non touché.

## Différé (candidat futur)
- `CommunityLinkDetailView.swift` (10 sites `.system(size:)`) — même traitement Dynamic Type.
