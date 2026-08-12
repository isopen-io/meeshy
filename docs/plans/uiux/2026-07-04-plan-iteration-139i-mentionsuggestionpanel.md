# Plan — Itération 139i (iOS) : `MentionSuggestionPanel`

**Base** : `main` HEAD (`b6ba6a1a`, 1 PR ouverte #1448 calls — pas `MentionSuggestionPanel` → 0 contention) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type (panneau d'autocomplétion de mentions) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

138i mergé (#1445, `KeypadTab`) → **139i**. Lot des fichiers à 3 `.system` épuisé → traîne à 2. Choix →
`MentionSuggestionPanel` (2 `.system(size:)`, 0 doctrine, 0 `relative`). 2 libellés texte, sans cadre fixe.

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| nom d'affichage `Text(candidate.displayName)` (14 semibold) | `relative` |
| pseudo `Text("@\(candidate.username)")` (12) | `relative` |

## Règles respectées

1. Vrais libellés texte non bornés (rangée `.frame(minHeight: 44)` = hauteur *minimale*, pas fixe) →
   **scalent** (`relative`).
2. A11y déjà en place (`.accessibilityLabel` « Mention <nom> » sur chaque bouton ; squelette masqué) → intacte.
3. Palette (textPrimary/textSecondary, Liquid Glass neutre) conforme → non touchée.
4. 1 fichier, 0 logique, 0 touche au `MentionComposerController`, 0 test/clé i18n neuve.

## Étapes

1. [x] Resync main (139i car 138i mergé) ; contention vérifiée (#1448 calls — pas `MentionSuggestionPanel`).
2. [x] 2 migrations `relative`.
3. [x] Vérifier : 0 `.system(size:)` restant + 2 `relative` ; aucun test ne référence le fichier.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 140i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : suite de la traîne à 2/1 `.system` (`ContextActionMenu`, `SecurityVerificationView`,
`StatsTimelineChart`, `AudioPostComposerView`, `ConversationBackgroundComponents`, `MessageViewsDetailView`,
`StoryExpiredContent`, `StoryViewerContainer`, `BubbleStandardLayout`, `WebRTCVideoView` post-#1440/#1448…),
ou **passe state-of-the-art** au tarissement.
