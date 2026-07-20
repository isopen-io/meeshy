# Plan — Itération 98i (iOS)

**Surface** : `apps/ios/Meeshy/Features/Main/Views/UserStatsView.swift`
**Branche** : `claude/upbeat-euler-rj79la` (base `main` HEAD `8aea0e4e`)
**Type** : sweep Dynamic Type + traits VoiceOver (0 logique, 0 clé i18n, 0 test neuf)

## Étapes
1. [x] Choisir surface non prise (contention ~15 PRs iOS) → `UserStatsView` (98i).
2. [x] Header : `chevron.left`/titre → `MeeshyFont.relative` ; titre `.isHeader` ; spacer `.accessibilityHidden`.
3. [x] `statCard` : valeur `.rounded`/label → `relative` ; icône 20pt en puce 36×36 **gardée figée** + commentaire + `.accessibilityHidden` ; carte `.accessibilityElement(children: .combine)`.
4. [x] Section « ACTIVITE » : icône/titre → `relative` ; icône hidden ; `.combine` + `.isHeader`.
5. [x] Section « BADGES » : icône/titre → `relative` ; icône hidden ; `.combine` + `.isHeader`.
6. [x] Vérif : 8 `relative`, 1 `.system` figé documenté.
7. [ ] Commit + push + attendre CI `iOS Tests` verte.
8. [ ] Merge dans `main`, supprimer la branche, mettre à jour le pointeur.

## Différé prioritaire iOS 99i+
- Dynamic Type grandes surfaces restantes une par itération : `StoryViewerView+Content` (31, ⚠️ collision i18n historique #1174), `ConversationView+Composer` (22, lot critique prudent), `ConversationView+MessageRow` (16), `ConversationListView+Overlays` (15), `LicensesView` (10, candidat propre non pris), `StoryViewerView+Sidebar` (10).
- Glass adoption reste : `MessageOverlayMenu` (21, via `AdaptiveGlassContainer`, lot dédié).
- **NE PAS re-flagger** `UserStatsView` (soldé 98i : 9 sites dont icône 20pt figée + palette catégorielle documentés hors-scope).
