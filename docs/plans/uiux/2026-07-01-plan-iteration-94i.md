# Plan — Itération 94i (iOS)

**Objectif** : rendre `MemberManagementSection.swift` conforme Dynamic Type + VoiceOver, sans
changer le layout par défaut, la logique, la palette ni les chaînes i18n.

## Cible
`apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift` (17 sites `.system(size:)`).
Surface du différé prioritaire 91i+ ; non prise par les PR iOS en vol (91i→93i).

## Étapes
1. [x] Resync branche sur `main` HEAD (`6b8abcb`), supprimer/recréer la branche de travail.
2. [x] Anti-collision `list_pull_requests` → `MemberManagementSection` libre. Numéro 94i.
3. [x] Migrer 15 sites texte-de-lecture + glyphes inline appariés → `MeeshyFont.relative(...)`
   (weight/design préservés).
4. [x] Garder 2 sites figés & commentés : `ellipsis` 32×32 (chrome tap-frame, 82i),
   `person.slash` 28pt (hero décoratif état-vide, 90i).
5. [x] VoiceOver : `.accessibilityLabel(accessibility.clear_search)` sur ✕ ; `.isHeader` +
   `.combine` sur en-tête « MEMBRES » ; `.accessibilityHidden` sur glyphes décoratifs ;
   `.combine` sur état vide.
6. [x] Vérifier 15 relative + 2 fixed = 17. 0 logique / 0 clé i18n neuve / 0 test neuf.
7. [x] Docs analyse + plan + `branch-tracking.md`.
8. [ ] Commit, push, PR. Gate = CI `iOS Tests`.
9. [ ] Merge dans `main` une fois CI vert ; supprimer la branche.

## Contraintes
- Aucune modification de logique/état/navigation.
- Palette déjà tokenisée → intacte (hex `F8B500` = teinte catégorielle de rôle, hors-scope 69i/89i).
- SwiftUI ne compile pas sous Linux → validation = CI iOS.

## Suite (95i+)
`ConversationView+Composer` (22, prudent), `StoryViewerView+Content` (31, i18n #1174),
`AboutView` (16), `CommunityLinkDetailView` (10) ; Glass `MessageOverlayMenu` (21).
