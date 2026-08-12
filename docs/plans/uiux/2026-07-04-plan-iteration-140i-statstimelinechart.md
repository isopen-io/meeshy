# Plan — Itération 140i (iOS) : `StatsTimelineChart`

**Base** : `main` HEAD (`c735c016`) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (libellés d'axe du graphique de stats) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

139i mergé (#1450, `MentionSuggestionPanel`) → **140i**. Traîne à 2. Choix → `StatsTimelineChart`
(2 `.system(size: 9)`, 0 doctrine, 0 `relative`). 2 `AxisValueLabel()` Swift Charts (axes X + Y).
GitHub MCP en ré-auth au dev → contention non vérifiable via API, mais surface stats à risque négligeable
+ 0 test référent ; PR à la reconnexion.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| `import MeeshyUI` (absent) | **ajouté** |
| `AxisValueLabel()` axe X (9) | `relative` |
| `AxisValueLabel()` axe Y (9) | `relative` |

## Règles respectées

1. Libellés de graduation d'axe = vrai texte non borné → **scalent** (`relative`).
2. Le graphique porte déjà son `.accessibilityLabel` global → intact.
3. Palette (textMuted, hex courbe) conforme → non touchée.
4. 1 fichier, 0 logique, 0 test/clé i18n neuve.

## Étapes

1. [x] Resync main (140i car 139i mergé).
2. [x] `import MeeshyUI` + 2 migrations `relative`.
3. [x] Vérifier : 0 `.system(size:)` restant + 2 `relative` ; aucun test ne référence le fichier.
4. [ ] Commit + push ; PR (à la reconnexion MCP) ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 141i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : suite de la traîne à 2/1 `.system` (`ContextActionMenu`, `SecurityVerificationView`,
`AudioPostComposerView`, `ConversationBackgroundComponents`, `MessageViewsDetailView`, `StoryExpiredContent`,
`StoryViewerContainer`, `BubbleStandardLayout`, `WebRTCVideoView` post-PR…), ou **passe state-of-the-art**
au tarissement.
