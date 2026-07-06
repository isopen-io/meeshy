# Plan — Itération 131i (iOS) : `MessageDetailSheet`

**Base** : `main` HEAD (`eb74172e`, 0 PR iOS ouverte → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (glyphes hero d'états vides/erreur/confirmation) — doctrine 84i · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

130i mergé (#1406, `ReelFeedCard`) → **131i**. Ranking des surfaces fraîches → `MessageDetailSheet`
(4 `.system(size:)`, 0 doctrine, 0 `relative`). 4 glyphes hero décoratifs (3 à 28pt, 1 à 48pt).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| `emptyStateView` icône (28 light) | `relative` + `accessibilityHidden` |
| `retryableErrorView` `wifi.slash` (28 light) | `relative` + `accessibilityHidden` |
| transcription empty-state `text.word.spacing` (28 light) | `relative` + `accessibilityHidden` |
| `deleteTabContent` `trash.fill` (48, animé) | **FIGÉ** + commentaire 84i + `accessibilityHidden` |

## Règles respectées

1. Glyphe hero décoratif **≥40pt** → figé (84i) ; **< 40pt** paires avec du texte → scale (`relative`).
2. Les 4 glyphes hero sont décoratifs (le texte adjacent porte le sens) → `.accessibilityHidden(true)`
   pour éviter la lecture du nom brut du symbole SF par VoiceOver.
3. Palette (error, textMuted, accent) conforme → non touchée. Autres textes déjà sémantiques → hors périmètre.
4. 1 fichier, 0 logique, 0 accès `@State`, 0 test/clé i18n neuve.

## Étapes

1. [x] Resync main (131i car 130i mergé) ; contention vérifiée (0 PR iOS ouverte).
2. [x] 3 migrations `relative` + 1 gel commenté 84i + 4 masquages décoratifs.
3. [x] Vérifier : 1 `.system` restant (figé + commenté) + 3 `relative` + 4 `accessibilityHidden`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 132i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `StatusBubbleController` (4), `ReelRepostEmbedCell`/`AchievementBadgeView`/`SyncPill` (3),
ou passe state-of-the-art (hexes inline vs tokens).
Note : gap i18n pré-existant sur les valeurs FR littérales de `viewsSentContent`/`deliveryBadge`
(« Distribue », « Envoye »…) de `MessageDetailSheet` → passe i18n dédiée.
