# Plan — Itération 178i (iOS) : `ReelAudioBackdrop`

**Base** : `main` HEAD (`f4ac661`, après merge 177i #2076 `ReportMessageSheet`) · **Branche** : `claude/laughing-thompson-r9ubq7`
**Thème** : Accessibilité — Reduce Motion + masquage VoiceOver d'un fond décoratif · **1 fichier, 0 logique**
**Gate** : CI `iOS Tests`

## Constat

177i (`ReportMessageSheet`, #2076) mergé → **178i** (numéro > plus haut essaim en vol : 176i #2074).
Ranking des surfaces fraîches → `ReelAudioBackdrop` (fond audio-réel du feed, 1 usage `ReelFeedCard:173`,
0 test, 0 doc antérieur). Deux vraies lacunes a11y (checklist de la routine) :
1. Boucle `repeatForever` de la waveform **sans garde Reduce Motion** (ni système ni override in-app) — outlier
   parmi les backdrops animés (`ConversationBackgroundComponents`, `CallEffectsOverlay`… gardent tous).
2. Backdrop **purement décoratif** non retiré de l'arbre VoiceOver (glyphe `waveform` exposé nu).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| `startAnimating()` | `guard !reduceMotion else { return }` (phase reste 0 → waveform figée variée) |
| `reduceMotion` | calc via `MeeshyMotion.shouldReduce(system:userForced:)` + 2 `@Environment` |
| `ZStack` racine | `.accessibilityDecorative()` (alias SDK de `.accessibilityHidden(true)`) |
| glyphe `waveform` 44pt | figé (borné/décoratif), commenté doctrine 86i |

## Règles respectées

1. Réutilise les primitives SDK existantes (`MeeshyMotion.shouldReduce`, `meeshyForceReduceMotion`,
   `accessibilityDecorative`) — **0 nouvelle abstraction**, source de vérité motion intacte.
2. `reduceMotion` lu dans `startAnimating()` (piloté par `.onAppear` / `.adaptiveOnChange`), **pas dans `body`** →
   surface de re-render du leaf `Equatable` inchangée (doctrine Zero Unnecessary Re-render).
3. `==` inchangé (compare `accentHex`/`isActive`). Palette/layout/`isActive` gating intacts.
4. Sans Reduce Motion : animation strictement identique (0 régression visuelle).
5. 1 fichier, 0 logique, 0 accès modèle/réseau, 0 test/clé i18n neuve.

## Étapes

1. [x] Fix identité git (`noreply@anthropic.com`) + resync `main` (178i car 177i mergé), contention vérifiée.
2. [x] Garde Reduce Motion + `MeeshyMotion.shouldReduce` + `.accessibilityDecorative()`.
3. [x] Vérifier : APIs `public` MeeshyUI (déjà importé), iOS 16 floor OK, 0 test référant `ReelAudioBackdrop`.
4. [ ] Commit + push ; PR ; CI `iOS Tests` verte ; merge.

## Différé 179i+

`ReelFeedVideoSurface` / `ReelFeedCard` (transitions carte active vs Reduce Motion, non scannées) ; longue traîne
de fonts fixes 1-`.system` (`WebRTCVideoView`, `VideoLegacySupport`, `CallEffectsOverlay`) largement décoratifs ;
pivots i18n strings hardcodées / adoption composants natifs quand le lot a11y-motion s'épuise.
