# Plan — Itération 140i (iOS) : `ThemedBackButton` (ConversationHelperViews)

**Base** : `main` HEAD (0 PR iOS de la piste sur ce fichier → 0 contention ; #1961 = piste distincte) · **Branche** : `claude/laughing-thompson-gx78op`
**Thème** : Dynamic Type (bouton retour de conversation) · **édits `.font()`-only**
**Gate** : CI `iOS Tests`

## Constat

139i mergé (`MentionSuggestionPanel`) → **140i**. Lot des fichiers à 3 `.system` épuisé → traîne à 2. Choix
→ `ThemedBackButton` (`ConversationHelperViews`, 2 `.system(size:)` restants ; le libellé ligne 204 était
déjà `relative`). Les 2 glyphes sont de nature opposée (1 à scaler, 1 à figer).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| chevron.left (16 bold, slot fixe 40×40 généreux) | `relative` |
| badge unread `Text(displayedUnread(...))` (12 bold rounded, pill compacte `.fixedSize`+`minWidth:22`) | **figé + commenté** |

## Règles respectées

1. Glyphe d'affordance dans un cadre **généreux** (40×40 pour un glyphe 16) → **scale** (`relative`, aucun clip).
2. Badge numérique compact pill-tight (`.fixedSize`, `minWidth: 22`) → **figé** (scaler casse la capsule
   et la pousse hors de la pastille glass) — même précédent que `GlobalSearchView` unread badge.
3. A11y déjà en place (`Button` labellisé `a11y.back` / `a11y.back.with_unread` ; badge
   `.accessibilityHidden(true)`) → intacte.
4. 1 fichier, 0 logique, 0 test/clé i18n neuve ; `import MeeshyUI` déjà présent.

## Étapes

1. [x] Resync main (140i car 139i mergé) ; contention vérifiée (#1961 = piste distincte, pas ce fichier).
2. [x] 1 migration `relative` (chevron) + 1 gel commenté (badge unread).
3. [x] Vérifier : 1 `.system(size:)` restant (le badge figé, intentionnel) + 2 `relative` ; aucun test ne
   référence `ThemedBackButton`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 141i+

Reste le gros lot risqué `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file).
Sinon : suite de la traîne à 2/1 `.system` (`ContextActionMenu`, `SecurityVerificationView`,
`StatsTimelineChart`, `AudioPostComposerView`, `ConversationBackgroundComponents`, `MessageViewsDetailView`,
`StoryExpiredContent`, `StoryViewerContainer`, `BubbleStandardLayout`, `CommunityLinksView`,
`CommunityLinkDetailView`, `ShareLinksView`, `SharePickerView`, `ConversationView+MessageRow`,
`WebRTCVideoView`…), ou **passe state-of-the-art** au tarissement.
