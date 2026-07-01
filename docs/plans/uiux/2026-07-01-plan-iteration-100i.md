# Plan — Itération 100i (iOS : ForwardPickerSheet)

**Base** : `main` HEAD `ee334ec5` (post-93i #1240).
**Branche** : `claude/upbeat-euler-hau7m8`.
**Surface** : `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift`.

## Objectif
Rendre la feuille de transfert de message accessible (Dynamic Type + VoiceOver) en
préservant le style visuel (accent déterministe, tokens thème) — logique d'épuration,
sweep pur sans nouvelle logique.

## Étapes
1. [x] Resync sur `main` HEAD, brancher `claude/upbeat-euler-hau7m8`.
2. [x] Vérifier contention PR (99i le plus haut en vol → prendre 100i).
3. [x] Inventaire des 9 `.font(.system(size:))`.
4. [x] Migrer 7 sites texte/glyphe-inline → `MeeshyFont.relative(...)` (weight préservé).
5. [x] Garder 2 sites figés + commentaire (héros 40pt, xmark chrome 10pt).
6. [x] Ajouter 3 `.accessibilityElement(children: .combine)` + 1 `.accessibilityHidden`.
7. [x] Vérifier palette (déjà tokenisée) + i18n (déjà complète) → 0 swap / 0 clé.
8. [x] Rédiger analyse + plan, mettre à jour `branch-tracking.md`.
9. [ ] Commit + push + PR ; attendre CI `iOS Tests` verte ; merger dans `main`.
10. [ ] Supprimer la branche mergée ; base 101i = `main` HEAD.

## Non-objectifs
- Pas de refactor logique (chargement, transfert réseau intacts).
- Pas de changement de layout du bandeau/rangées.
- Pas de conversion de l'accent déterministe en token sémantique.

## Différé 101i+
Dynamic Type grandes surfaces restantes une par itération : `MessageOverlayMenu` (21,
candidat Glass dédié `AdaptiveGlassContainer`), `StoryViewerView+Content` (31,
⚠️ collision i18n #1174), `ConversationView+Composer` (22, lot critique prudent),
`ConversationListView+Overlays` (15), `FeedView+Attachments` (14), `FeedPostCard+Media`
(13), `EditPostSheet` (9). Puis palette : hexes proches-mais-non-exacts (vérif visuelle).
