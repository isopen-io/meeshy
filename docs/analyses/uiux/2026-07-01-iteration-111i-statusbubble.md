# Itération 111i — Analyse UI/UX iOS : `StatusBubbleOverlay`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Components/StatusBubbleOverlay.swift`
**Base** : `main` HEAD (`57408634`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

Bulle d'humeur (« mood ») flottante Liquid Glass, ancrée sur un avatar (contenu texte OU audio,
timeAgo, « via @… », bouton Republier). **0 PR ouverte** au démarrage → 0 contention. Numéro
**111i** (110i = `ReelsPlayerView` mergé #1316).

## Constat (avant 111i)

Le bouton audio play/stop portait déjà un `.accessibilityLabel` state-aware et la bulle un
`.accessibilityHint` de réponse. Défaut restant : **7 `.font(.system(size:))`** non scalables —
6 textes/glyphe inline (contenu 13, timeAgo ×2 à 10, « via » 11, glyphe repost 11, libellé
Republier 12) + 1 glyphe play/stop 8 dans un cercle de dimension fixe 18×18.

## Corrections appliquées (1 fichier, 0 logique)

- **6/7 `.font(.system(size:))` → `MeeshyFont.relative(...)`** (weight préservé) : contenu (13),
  timeAgo audio + texte (10 medium ×2), « via @… » (11), glyphe repost `arrow.2.squarepath` (11),
  libellé Republier (12 medium).
- **1/7 glyphe figé** + commentaire doctrine 86i : play/stop (8) dans le cercle **fixe 18×18** du
  bouton audio (déjà pourvu d'un `.accessibilityLabel` state-aware).

Palette (accent déterministe `Color(hex: status.avatarColor)`, `MeeshyColors.indigo400`) et
Liquid Glass (`.adaptiveGlass` + hairline gradient + ombre) déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (labels existants).

## Statut

**TERMINÉE** — `StatusBubbleOverlay` Dynamic Type soldé. Ne plus re-flagger le glyphe play/stop figé.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StatusBubbleOverlay` — 6 textes/glyphe → `relative`, 1 glyphe play/stop figé (cercle fixe 18×18,
  déjà étiqueté bouton). **SOLDÉ 111i.**
