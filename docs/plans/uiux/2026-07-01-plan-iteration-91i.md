# Plan Itération 91i — Dynamic Type + VoiceOver `AffiliateView`

**Date** : 2026-07-01 · **Piste** : iOS (`i`) · **Base** : `main` HEAD `af1fe619`
**Branche** : `claude/upbeat-euler-vncfye` · **Gate** : CI `iOS Tests`

## Objectif

Rendre l'écran « Parrainage » (`AffiliateView.swift`) conforme Dynamic Type + VoiceOver, sans
changer layout par défaut, logique, palette ni chaînes i18n. Surface du différé prioritaire
84i/89i.

## Étapes

1. [x] Resync `main` HEAD, vérifier `list_pull_requests` (90i saturé → viser **91i**).
2. [x] Compter les sites : 17 `.system(size:)` / 0 `relative` confirmés.
3. [x] Migrer 16 sites → `MeeshyFont.relative(size, weight:, design:)` (weight/design préservés).
4. [x] Garder figé le héros `link` 36pt de l'état vide + `.accessibilityHidden(true)` + commentaire.
5. [x] VoiceOver : `.accessibilityLabel` sur 4 boutons icône-only (clés SSOT, 0 clé neuve) ;
   `.combine` sur stat cards + bloc token ; `.isHeader` sur « MES LIENS » ; `.accessibilityHidden`
   sur glyphes décoratifs appariés.
6. [x] Vérifier compte final : 16 relative + 1 fixed = 17 ✅.
7. [x] Analyse + plan + `branch-tracking.md`.
8. [ ] Commit, push, PR, CI verte → merge `main`, supprimer la branche.

## Non-scope (documenté)

- `accentColor = "2ECC71"` = tint de marque déterministe (feed gradients/borders) → **préservé**.
- Sémantiques déjà tokenisées en 69i (`success`/`error`) → rien à faire.
- 0 test neuf (sweep présentation + traits déclaratifs, parité doctrine).

## Différé 92i+ (inchangé)

Dynamic Type grandes surfaces restantes : `StoryViewerView+Content` (coordonner i18n),
`LocationPickerView` (17), `MemberManagementSection` (17), `ConversationView+Composer` (22,
lot prudent). Puis Glass adoption `MessageOverlayMenu` (via `AdaptiveGlassContainer`).
Palette : hexes proches-mais-non-exacts (`#4ADE80`→success ?) audit un par un avec vérif visuelle.
