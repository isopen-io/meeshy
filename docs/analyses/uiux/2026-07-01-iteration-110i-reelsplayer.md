# Itération 110i — Analyse UI/UX iOS : `ReelsPlayerView`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ReelsPlayerView.swift`
**Base** : `main` HEAD (`6519f8ed`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Lecteur de réels plein écran vertical (pager, action rail like/comment/bookmark/share, scrub,
transcript audio karaoké, meta row Prisme). **PR ouvertes uniquement web/gateway/calls** (#1306/
#1309/#1310/#1312/#1313/#1314, toutes disjointes de cette surface) → 0 contention iOS. Numéro
**110i** (109i = `StoryTrayView` mergé #1307).

## Constat (avant 110i)

Le rail d'actions, la scrub bar, le back button et le meta row portaient déjà de bons libellés/
valeurs VoiceOver (`reels.action.*`, `reels.scrub` + `.accessibilityValue`, `reels.back`, flags).
Défauts restants :
- **7 `.font(.system(size:))`** non scalables. 6 sont légitimement figés (chrome back 18 en cadre
  40×40 ; rail d'actions 26 ×2 en colonne fixe width:48 ; héros décoratifs `play.rectangle` 44,
  `waveform` watermark 220 + hero 84 — tous ≥40pt). 1 seul migrable : le glyphe inline de stat
  auteur (`chart.bar.fill`/`eye.fill` 10).
- **Glyphes décoratifs héros non masqués** du rotor VoiceOver (`play.rectangle` d'état-vide,
  les 2 `waveform` du transcript audio) → annoncés inutilement.

## Corrections appliquées (1 fichier, 0 logique)

- **1/7 `.font(.system(size:))` → `MeeshyFont.relative(10, weight: .semibold)`** : glyphe inline
  de `statInline` (déjà masqué du rotor via `.accessibilityElement(children: .ignore)` sur le bloc).
- **6/7 glyphes figés** + commentaires doctrine : chrome back (cadre 40×40, doctrine 82i) ; rail
  d'actions ×2 (colonne fixe width:48, doctrine 86i) ; héros décoratifs `play.rectangle` 44 +
  `waveform` 220/84 (≥40pt, doctrine 74i/86i).
- **3 `.accessibilityHidden(true)`** sur les glyphes héros décoratifs (`play.rectangle` d'état-vide,
  `waveform` watermark + hero) — le texte adjacent / le rôle porte le sens.

Palette (accent déterministe `Color(hex: authorColor)`, sémantiques `MeeshyColors.error/.warning`)
et Liquid Glass (`.adaptiveGlass` du back button) déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (labels existants).

## Statut

**TERMINÉE** — `ReelsPlayerView` Dynamic Type + a11y soldé. Ne plus re-flagger les 6 glyphes figés.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ReelsPlayerView` — 1 migration inline (`relative`), 6 glyphes figés (chrome/rail/héros ≥40),
  3 masquages VoiceOver héros décoratifs. **SOLDÉ 110i.**
