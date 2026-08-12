# Itération 161i — Analyse UI/UX iOS : `MyStoriesView`

**Date** : 2026-07-18
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/MyStoriesView.swift`
**Base** : `main` HEAD (`ffaf2de`)
**Branche** : `claude/laughing-thompson-ruiv50`
**Gate** : CI `iOS Tests`

## Contexte

`MyStoriesView` est la sheet « Mes stories » présentée depuis le tray « Moi » : la liste des
stories **envoyées** par l'utilisateur, chaque ligne (`MyStoryRow`) portant une miniature composite
(ThumbHash + texte rejoué), un tampon temporel et trois compteurs d'engagement (vues / réactions /
commentaires), plus une barre de suppression groupée en `safeAreaInset`. Surface **fraîche** : 7
`.font(.system(size:))`, 0 commentaire doctrine, 0 `relative`.

**Contention** : au démarrage, 20 PR iOS ouvertes (itérations 140i→160i, une par surface :
`MessageForwardDetailView`, `AttachmentLoadingTile`, `SecurityVerificationView`,
`FeedView+Attachments`, `BubbleExpandableText`, `MessageReactionsDetailView`, `AudioPostComposerView`,
`MessageDetailSentimentTab`, `IncomingCallView`, `EditProfileView`, `DeleteAccountView`,
`ChangePasswordView`, `StoryViewerContainer`, `StatsTimelineChart`, `VoiceProfileManageView`,
`ConversationDashboard`, `MessageViewsDetailView`, `StoryExpiredContent`, `FriendRequestListView`,
+ 1 Jules iPad handle) → **aucune ne touche `MyStoriesView`** → **0 contention**. Numéro **161i**
(la plus haute PR ouverte est 160i, #2011).

## Constat (avant 161i)

**7 `.font(.system(size:))`** :

1. `bulkDeleteBar` — libellé « Supprimer (N) » (15 semibold) → **vrai texte**, sans cadre fixe.
2. `MyStoryRow` tampon temporel `story.timeAgo` (15 semibold) → **vrai texte**.
3. glyphe « … » (16 semibold) → **affordance décorative** ; les actions réelles vivent dans le
   `.contextMenu` + `.swipeActions` de la ligne (tous deux exposés à VoiceOver).
4. `selectionCircle` `checkmark.circle`/`circle` (22) → indicateur de sélection, **non borné** par un
   cadre fixe (peut donc scaler comme un contrôle).
5. `textObjectsOverlay` (`fontSize` calculé) → **rendu miniature proportionnel** du texte composé de
   la story, `fontSize = text.fontSize × width / CanvasGeometry.designWidth`. Mise à l'échelle
   **liée** à la largeur du thumbnail (64pt) — pas un libellé lisible.
6. `metric` icône (11) → glyphe apparié au compteur.
7. `metric` valeur `Text("\(value)")` (13 medium) → **vrai texte** (compteur).

**Lacune VoiceOver réelle** : `MyStoryRow` empile un tampon temporel puis **trois compteurs nus**
(`12`, `5`, `3`) — VoiceOver annonce « il y a 2h, 12, 5, 3 », trois nombres orphelins sans le moindre
contexte (le sens est porté par les seules icônes `eye`/`heart`/`bubble`, invisibles à VoiceOver).

## Corrections appliquées (2 fichiers, 0 logique)

### `MyStoriesView.swift` — Dynamic Type

**5/7 → `MeeshyFont.relative(size, weight:, design:)`** (weight préservé) :
- `bulkDeleteBar` (15 semibold), tampon `timeAgo` (15 semibold), `selectionCircle` (22),
  `metric` icône (11), `metric` valeur (13 medium).

**2/7 FIGÉS & commentés** — cas de gel légitimes :
- glyphe « … » (16 semibold) : affordance **décorative**, actions déportées dans context/swipe menus,
  masqué VoiceOver (`.accessibilityHidden(true)`) puisque la ligne compose déjà son libellé.
- `textObjectsOverlay` : recréation **graphique** fidèle du composite, échelle **liée** au thumbnail —
  un scaling Dynamic Type casserait la fidélité visuelle.

### `MyStoriesView.swift` — VoiceOver

- `MyStoryRow` composée en **un seul élément** (`.accessibilityElement(children: .ignore)`) avec un
  libellé explicite `rowAccessibilityLabel` : « *il y a 2h. 12 vues, 5 réactions, 3 commentaires* » —
  les trois compteurs nus deviennent un énoncé lisible.
- `.accessibilityAddTraits(.isButton)` (la ligne est tappable → ouvre le viewer) ; la coche de
  sélection reste transmise via `.isSelected` (comme `NewConversationView.userRow`).
- glyphe « … » masqué (`.accessibilityHidden(true)`).

### `Localizable.xcstrings` — i18n

- **1 clé neuve** `story.mine.row.a11y` enregistrée dans les **5 langues** du catalogue
  (de / en / es / fr / pt-BR) avec spécificateurs **positionnels** (`%1$@ %2$lld %3$lld %4$lld`) —
  seul énoncé VoiceOver de la surface qui n'existait pas déjà.

Palette déjà tokenisée (`MeeshyColors`, `accentColor`) → **0 swap** ; Glass/`ultraThinMaterial` déjà en
place. 2 fichiers, **0 logique / 0 test neuf** (parité 135i–139i : sweep Dynamic Type + comblement
d'une lacune VoiceOver réelle). Gate = CI `iOS Tests`.

## Statut

✅ **Résolu 161i** — `MyStoriesView` : Dynamic Type (5 conversions + 2 gels commentés) + VoiceOver
(ligne composée, 3 compteurs nus → énoncé labellisé) + 1 clé i18n (5 langues). **NE PLUS re-flagger**
`MyStoriesView` (soldé 161i ; les 2 `.system` restants sont des gels légitimes documentés).

## Différé 162i+ (cibles fraîches, hors PR ouvertes)

`FeedView` (7, rel=0), `ConversationAnimatedBackground` (12, rel=0, décoratif),
`ReelRepostEmbedCell` (3, rel=0), `CameraView` (3 restants) ; gros lots prudents en dernier :
`StoryViewerView+Content` (31, ⚠️ i18n #1174), `OnboardingAnimations` (16, décoratif),
`ConversationView+Composer` (13 restants).
