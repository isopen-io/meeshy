# Plan — Itération 130i (iOS) : `ReelFeedCard`

**Base** : `main` HEAD (`1061dcb0`, 0 PR iOS ouverte → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (carte Réel plein-cadre du feed) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

129i mergé (#1399, `CameraView`) → **130i**. Ranking des surfaces fraîches → `ReelFeedCard`
(4 `.system(size:)`, 0 doctrine, 0 `relative`). Badge Réel + glyphes métrique/action, tous non bornés.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| badge logo Réel `play.rectangle.on.rectangle.fill` (15 bold, `.padding`-driven) | `relative` |
| métrique inline `chart.bar.fill`/`eye.fill` (10 semibold) | `relative` |
| `actionGlyph` rempli (18) + overlay de bordure accent (18) | `relative` (même taille → alignés) |

## Règles respectées

1. Glyphes **non bornés** par un cadre de dimension fixe (badge `.padding`-driven ; action/métrique inline)
   → **scalent** avec le texte adjacent (`relative`), pas de gel. Overlay de bordure migré à la même taille.
2. A11y déjà en place (badge Réel + like + reelButton labellisés/valués ; `metricInline` combiné) → intacte ;
   overlay de bordure aplati par le Button parent → pas de `.accessibilityHidden` requis.
3. Palette (error/success/warning, accent hex, blanc sur scrim) conforme → non touchée.
4. 1 fichier, 0 logique, 0 accès `@State`, 0 test/clé i18n neuve. `Equatable` + inputs `let` préservés.

## Étapes

1. [x] Resync main (130i car 129i mergé) ; contention vérifiée (0 PR iOS ouverte).
2. [x] 4 migrations `relative`.
3. [x] Vérifier : 0 `.system(size:)` restant + 4 `relative` ; aucun test ne référence `ReelFeedCard`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 131i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `MessageDetailSheet` (4), `StatusBubbleController` (4), `ReelRepostEmbedCell`/`AchievementBadgeView`/
`SyncPill` (3), ou passe state-of-the-art (hexes inline vs tokens).
