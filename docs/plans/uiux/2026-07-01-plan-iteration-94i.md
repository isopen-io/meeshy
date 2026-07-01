# Plan — Itération 94i (iOS)

**Cible** : `apps/ios/Meeshy/Features/Main/Views/SharePickerView.swift` (« Partager avec... »).
**But** : conformité Dynamic Type + VoiceOver, sans changer layout par défaut / logique / palette.

## Étapes
1. [x] Resync sur `main` HEAD ; brancher `claude/upbeat-euler-8v1yh3`.
2. [x] Anti-collision via `list_pull_requests` → `SharePickerView` non prise ; label 94i > 93i.
3. [x] Migrer 13/15 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight préservé).
4. [x] Garder 2 glyphes de contrôle 26pt figés (checkmark/paperplane slot d'action) + commentaires.
5. [x] VoiceOver : `.accessibilityElement(children: .combine)` bannière + rangée ;
       `.accessibilityHidden(true)` icône type / loupe / puce ; `.accessibilityLabel(share.sent)` checkmark.
6. [x] i18n : ajouter `share.sent` (5 langues) en texte brut, sans reformater le catalogue.
7. [x] Docs analyse + plan + `branch-tracking.md`.
8. [ ] Commit + push + PR ; gate CI `iOS Tests` ; merge dans `main` ; supprimer la branche.

## Contraintes respectées
- Un seul fichier de production + une entrée catalogue.
- 0 logique, 0 test neuf (parité sweeps précédents).
- SDK non touché (`MeeshyFont`/`MeeshyColors` déjà ré-exportés via `MeeshyUI`, déjà importé).
- Palette déjà tokenisée → aucun swap.

## Suite (95i+)
`MemberManagementSection` (17) · `AddParticipantSheet` (14) · `ForwardPickerSheet` (9) ·
`ConversationView+Composer` (22, prudent) · Glass `MessageOverlayMenu` (21).
