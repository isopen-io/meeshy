# Plan — Iteration 93i (2026-07-01) — LocationPickerView

## Objectif
iOS exclusivement. Rendre `LocationPickerView` (sélecteur de lieu MapKit) compatible Dynamic Type :
migrer 15/17 `.font(.system(size:))` → `MeeshyFont.relative(...)`, garder figés les 2 glyphes
non-scalables (marqueur d'annotation carte 36pt, glyphe dans badge fixe 28×28), masquer VoiceOver
des glyphes décoratifs.

## Base de départ
`main` HEAD (`33f89430`, post-#1224). Branche `claude/upbeat-euler-512kep` **repurposée** :
son commit précédent (MagicLinkView « 90i ») est devenu redondant (MagicLinkView déjà sur `main`
via #1224) et `dirty`. Reset sur `origin/main`, nouveau travail sur surface disjointe.

## Contexte de contention
Essaim d'agents iOS parallèles. Surfaces prises par des PR ouvertes : MagicLinkView (mergé),
AffiliateView (×4), NewConversationView, CommunityLinksView, DataExportView, FeedCommentsSheet
(mergé). `LocationPickerView` = **aucune PR** → choisi pour zéro collision.

## Étapes
1. [x] Diagnostic contention (`list_pull_requests`) + constat #1225 dirty/redondant.
2. [x] Reset branche sur `origin/main`, choisir surface disjointe `LocationPickerView`.
3. [x] Migrer 15 sites texte/glyphes-inline → `MeeshyFont.relative(size, weight:, design:)`.
4. [x] Garder figés 2 glyphes (marqueur carte 36pt + badge 28×28) + commentaires + `.accessibilityHidden`.
5. [x] Masquer VoiceOver 3 glyphes décoratifs appariés à un texte.
6. [x] Vérifier : 15 `relative` + 2 `.system` figés = 17.
7. [x] Docs analyse + plan (`-93i-location`) + entrée `branch-tracking.md`.
8. [ ] Commit + force-push `claude/upbeat-euler-512kep` (remplace commit 90i superseded).
9. [ ] Repurposer PR #1225 (titre/corps → 93i LocationPickerView), attendre CI `iOS Tests` verte.
10. [ ] Merger dans `main`, supprimer la branche mergée.

## Contraintes respectées
- 1 fichier de production, 0 logique, 0 clé i18n, 0 test neuf (sweep pur).
- Style iOS 26 Liquid Glass déjà en place → préservé (aucune modification des `.adaptiveGlass`).
- Palette déjà tokenisée (accent déterministe + `theme.*`) → intacte.

## Gate
CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur iOS 18.2). Merge dans `main` après CI verte.
