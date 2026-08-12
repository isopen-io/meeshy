# Itération 124i — Analyse UI/UX iOS : `iPadRootView+Panels`

**Date** : 2026-07-03
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/iPadRootView+Panels.swift`
**Base** : `main` HEAD (`e0e9b3a6`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

L'en-tête de panneau du split-view iPad : bouton « Feed », titre du panneau, bouton de
notifications (cloche + badge), bouton de réglages. **0 PR ouverte iOS sur cette surface** au
démarrage (7+ PR ouvertes = calls/gateway/web + #1382 sur `CallView`/`CallDetailSheet`, fichiers
disjoints) → 0 contention. Numéro **124i** (123i = `FeedView` chrome mergé #1370).

## Constat (avant 124i)

**6 `.font(.system(size:))`** : 5 sont du **texte/glyphe réactif** (glyphe + libellé du bouton
« Feed », titre du panneau, cloche de notifications, engrenage de réglages) ; 1 est le compteur de
badge dans une **pastille circulaire fixe 16×16**. Les **boutons de notifications et de réglages
étaient icon-only SANS `.accessibilityLabel`** → invisibles/muets pour VoiceOver.

## Corrections appliquées (1 fichier, 0 logique)

- **5/6 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : glyphe + libellé « Feed » (14
  semibold), titre du panneau (20 bold), cloche de notifications (16 medium), engrenage de réglages
  (16 medium).
- **1/6 figé** + commentaire doctrine : compteur du badge de notifications (9 bold, pastille
  circulaire fixe 16×16, doctrine 86i) + `.accessibilityHidden(true)` (le compteur est porté par
  `.accessibilityValue` du bouton).
- **a11y ajoutée** :
  - `.accessibilityAddTraits(.isHeader)` sur le titre du panneau (navigation par rotor titres) ;
  - `.accessibilityLabel(root.ipad.notifications)` + `.accessibilityValue(count)` sur le bouton de
    notifications (auparavant icon-only muet) ;
  - `.accessibilityLabel(root.ipad.settings)` sur le bouton de réglages (auparavant icon-only muet).

Palette (dégradé `indigo500→indigo700` du bouton Feed, `MeeshyColors.error` du badge, gris de
thème) déjà conforme → **intacte**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 2 clés i18n neuves inline (`root.ipad.notifications`,
  `root.ipad.settings`, avec `defaultValue` → fonctionnent sans éditer `Localizable.xcstrings`).

## Statut

**TERMINÉE** — `iPadRootView+Panels` Dynamic Type + a11y soldé. Ne plus re-flagger le badge figé (16×16).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `iPadRootView+Panels` — 5 sites → `relative`, 1 badge figé (16×16 hidden) ; titre marqué header ;
  labels VoiceOver ajoutés sur les boutons notifications (+value) et réglages icon-only. **SOLDÉ 124i.**
