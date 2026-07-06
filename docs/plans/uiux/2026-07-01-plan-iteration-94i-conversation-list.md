# Plan — Iteration 94i-conversation-list (2026-07-01)

## Objectif
Dynamic Type + VoiceOver sur la surface d'accueil iOS `ConversationListView+Overlays.swift`
(en-tête repliable + barre inférieure recherche/communautés/filtres). Sweep mécanique,
orthogonal aux ~10 PRs iOS `94i` en vol (SharePickerView, AffiliateView, MemberManagementSection,
AddParticipantSheet, NotificationSettingsView, CommunityLinkDetailView, LocationPickerView…).

## Base
`main` HEAD `1df16a6d` (post-#1241). Branche assignée `claude/upbeat-euler-vyrhaw` resync sur main.

## Étapes
1. [x] Inventaire `.font(.system(size:))` du fichier (15 sites) + classification.
2. [x] Migrer 10 sites texte/glyphes inline scalables → `MeeshyFont.relative(...)`.
3. [x] Garder 5 sites chrome header figés (2 en cercles Glass 40×40 + bell + gear + badge 16×16)
   + commentaire d'exception.
4. [x] VoiceOver : `.isHeader` sur titre « Meeshy Chats » + « Communautés » ; masquer icône Feed décorative.
5. [x] Rédiger analyse + plan + MAJ branch-tracking.
6. [ ] Commit + push + PR ; attendre CI `ios-tests.yml` verte ; merger dans main ; supprimer la branche.

## Contraintes respectées
- Aucune couleur modifiée (tokens déjà conformes `MeeshyColors`).
- Aucune clé i18n, aucun littéral (libellés déjà `String(localized:)`).
- Aucune logique, aucun test neuf (parité 55i/82i/86i/93i).
- Liquid Glass déjà en place (`AdaptiveGlassContainer` + `.adaptiveGlass`) → intact.

## Gate
CI `ios-tests.yml` (compile Xcode 26.1.x + tests simu 18.2). SwiftUI ne compile pas sous Linux →
la CI est le build de validation.

## Statut : ✅ code + doc faits ; reste push/CI/merge.
