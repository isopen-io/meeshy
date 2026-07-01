# Plan — Itération 103i (2026-07-01) — ConversationMediaGalleryView

## Objectif
iOS exclusivement. Rendre `ConversationMediaGalleryView` (galerie plein écran médias) compatible
Dynamic Type + accessible VoiceOver : migrer 7/13 `.font(.system(size:))` → `MeeshyFont.relative`,
garder figés 6 glyphes non-scalables (chrome + contrôles cercle fixe + état-vide décoratif),
combler les labels VoiceOver manquants sur les boutons icône-only.

## Base de départ
`main` HEAD (`2d91d96d`, post-#1233). Branche désignée `claude/upbeat-euler-hhsxw6` resync sur
`origin/main`. Itération **103i** = > 102i (plus haut numéro revendiqué par les PR ouvertes de l'essaim).

## Contexte de contention
Essaim d'agents iOS très dense (27 PR ouvertes). Surfaces Dynamic Type déjà prises par PR ouvertes :
SupportView (#1262), EffectsPicker (#1261), AddParticipantSheet (#1256), NotificationSettings (#1252),
TwoFactorSetup (#1248), SharePicker (#1246/#1243), Affiliate (#1245/#1238), MemberManagement (#1244),
LocationPicker (#1242/#1240 — soldé 93i sur main), ConversationPreferencesTab (#1241),
NewConversation (#1237), CommunityLinks (#1236). `ConversationMediaGalleryView` = **0 PR + 0
historique d'analyse** → choisi pour zéro collision.

## Étapes
1. [x] Diagnostic contention (`list_pull_requests`) + resync `main`.
2. [x] Choisir surface disjointe fraîche `ConversationMediaGalleryView` (0 mention historique).
3. [x] Migrer 7 sites texte/glyphes-inline → `MeeshyFont.relative(size, weight:, design:)`.
4. [x] Garder figés 6 glyphes (état-vide 48 + chrome xmark 28 / save 18 + contrôles 22/20/10) + commentaires.
5. [x] VoiceOver : labels close/save/play-download, value d'état save, combine métadonnées, hide décoratifs.
6. [x] Vérifier : 7 `relative` + 6 `.system` figés = 13.
7. [x] Docs analyse + plan (`-103i`) + entrée `branch-tracking.md`.
8. [ ] Commit + push `claude/upbeat-euler-hhsxw6`.
9. [ ] Ouvrir PR, attendre CI `iOS Tests` verte.
10. [ ] Merger dans `main`, supprimer la branche mergée.

## Contraintes respectées
- 1 fichier de production, 0 logique, 0 test neuf (sweep pur).
- Style iOS en place préservé (`.ultraThinMaterial` du compteur & bouton play intacts).
- Palette déjà tokenisée (accent déterministe param) → intacte.
- Clés a11y : `common.close`/`media.playVideo` existantes ; les autres référencées code-only via
  `defaultValue` (aucune édition `Localizable.xcstrings` → 0 conflit essaim).

## Gate
CI `iOS Tests` (compile Xcode 26.1.x + tests simulateur iOS 18.2). Merge dans `main` après CI verte.
