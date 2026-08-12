# Plan — Itération 138i (iOS) : `KeypadTab`

**Base** : `main` HEAD (`44053b50`, 0 PR iOS ouverte → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + doctrine 82i (onglet Pavé du hub People) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

137i mergé (#1444, `ConversationLockSheet`) → **138i**. Ranking des surfaces fraîches → `KeypadTab`
(3 `.system(size:)`, 0 doctrine, 0 `relative`). 1 champ de saisie + 2 glyphes de touche fixe 72×56.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| champ `TextField` (26 medium rounded) | `relative` |
| chiffre `Text(key.digit)` (30 rounded, touche fixe 72×56) | **FIGÉ** 82i |
| lettres `Text(key.letters)` (9 semibold, touche fixe 72×56) | **FIGÉ** 82i |

## Règles respectées

1. Vrai champ texte non borné → **scale** (`relative`), weight + `design: .rounded` conservés.
2. Glyphe borné par une touche de dimension fixe 72×56 (`.frame(width:72, height:56)`) → **figé** (82i).
3. A11y déjà en place (TextField labellisé ; `keyButton` lit le chiffre → lettres aplaties) → intacte.
4. 1 fichier, 0 logique, 0 touche à la logique de recherche, 0 test/clé i18n neuve.

## Étapes

1. [x] Resync main (138i car 137i mergé) ; contention vérifiée (0 PR iOS ouverte).
2. [x] 1 migration `relative` + 2 gels commentés 82i.
3. [x] Vérifier : 2 `.system` restants (figés + commentés) + 1 `relative` ; seule réf test = commentaire.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 139i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : la traîne de fichiers à 2/1 `.system` (`ContextActionMenu`, `MentionSuggestionPanel`,
`SecurityVerificationView`, `StatsTimelineChart`, `AudioPostComposerView`, `ConversationBackgroundComponents`,
`MessageViewsDetailView`, `StoryExpiredContent`, `StoryViewerContainer`, `WebRTCVideoView` une fois
#1440 mergée…), ou **passe state-of-the-art** au tarissement.
