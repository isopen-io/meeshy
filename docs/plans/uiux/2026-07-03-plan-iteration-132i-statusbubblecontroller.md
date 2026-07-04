# Plan — Itération 132i (iOS) : `StatusBubbleController` (MoodReplyConfirmationOverlay)

**Base** : `main` HEAD (`6de9912e`, 0 PR iOS ouverte → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (pop-up de confirmation de réponse au mood) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

131i mergé (#1409, `MessageDetailSheet`) → **132i**. Ranking des surfaces fraîches →
`StatusBubbleController` (4 `.system(size:)`, 0 doctrine, 0 `relative`). La View
`MoodReplyConfirmationOverlay` co-localisée dans le fichier Service : 4 libellés texte du pop-up.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| titre « Répondre à cette humeur ? » (16 semibold) | `relative` |
| résumé du mood `moodSummary` (14) | `relative` |
| bouton Quitter (15 medium) | `relative` |
| bouton Répondre (15 semibold) | `relative` |

## Règles respectées

1. Vrais libellés texte **non bornés** par un cadre de dimension fixe → **scalent** (`relative`).
2. A11y déjà en place (`.accessibilityElement(children: .contain)` ; boutons texte lisibles) → intacte.
3. Palette (textPrimary/Secondary, brandGradient, bordure indigo) conforme → non touchée.
4. 1 fichier, 0 logique, 0 accès contrôleur, 0 test/clé i18n neuve. Contrôleur + ViewModifier non touchés.

## Étapes

1. [x] Resync main (132i car 131i mergé) ; contention vérifiée (0 PR iOS ouverte).
2. [x] 4 migrations `relative`.
3. [x] Vérifier : 0 `.system(size:)` restant + 4 `relative` ; tests contrôleur comportementaux inchangés.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 133i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : `ReelRepostEmbedCell` (3), `AchievementBadgeView` (3), `SyncPill` (3), ou passe state-of-the-art
(hexes inline vs tokens).
