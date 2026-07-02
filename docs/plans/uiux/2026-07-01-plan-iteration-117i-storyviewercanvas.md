# Plan — Itération 117i (iOS) : `StoryViewerView+Canvas`

**Base** : `main` HEAD (`9077eea6`, 0 PR iOS sur cette surface) · **Branche** : `claude/upbeat-euler-s5qysh`
**Thème** : Dynamic Type + a11y (canvas du viewer de stories) — doctrine 82i/84i
**Gate** : CI `iOS Tests`

## Constat

116i mergé (#1334, `OnboardingAnimations`) → **117i**. Restaient **13 `.font(.system(size:))`**
dans le canvas du viewer (bandeau réponse, caption vocale, badges audio/traduction, croix, cover).

## Actions (1 fichier, 0 logique)

| Élément | Action |
|---|---|
| Icône + libellé « Réponse à » (9/11 semibold) | `relative` |
| Aperçu de réponse (11) | `relative(11)` |
| Transcription vocale (14 medium) | `relative(14, .medium)` |
| Badge audio : `music.note` + titre + uploader (11/12/11) | `relative` |
| Badge traduction : `translate` + code langue (10/9) | `relative` |
| Pseudo de la cover de chargement (15 semibold) | `relative(15, .semibold)` |
| Croix « annuler la réponse » (9, cadre fixe 22×22) | **FIGÉ** + commentaire 82i + `accessibilityLabel` |
| Croix fermeture preview (16, cadre fixe 36×36) | **FIGÉ** + commentaire 82i (déjà labellisée) |
| Emoji réaction hero (100, burst animé) | **FIGÉ** + commentaire 84i (déjà `accessibilityHidden`) |

## Règles respectées

1. Glyphe dans cadre tap fixe / hero décoratif animé → figé (doctrine 82i/84i).
2. Croix icon-only → label VoiceOver.
3. Palette + `.ultraThinMaterial` des badges + animations déjà conformes → non touchés.
4. 1 fichier, 0 logique, 0 test neuf, 1 clé i18n inline (`defaultValue`).

## Étapes

1. [x] Resync main (117i car 116i mergé) ; surface `StoryViewerView+Canvas` non réclamée.
2. [x] 10 migrations `relative` ; 3 gels commentés ; 1 label croix.
3. [x] Vérifier : 3 `.system` figés (tous commentés) + 10 `relative`.
4. [ ] Commit + push ; PR ; CI `ios-tests` verte ; merge (`Build (bun)` non-requis).

## Différé 118i+

Gros lots restants : `StoryViewerView+Content` (⚠️ i18n + piège `@State private` cross-file),
`ConversationView+Composer` (lot critique prudent), `ConversationView+MessageRow`,
`BubbleStandardLayout+Media`. `FeedPostCard` (9) = chrome d'action-bar → gel documenté.
