> Dossier des cibles de la v3.1 (issue #5672) — analyse de conception produite le 2026-09-08 sur `claude/web-v3-parite` à `fa980709f0`, en lecture seule, contre l'app iOS DRAPEAUX BÊTA ACTIVÉS. Les numéros de ligne cités valent pour ce commit ; `git log --since=2026-09-08 -- <fichier>` dit s'ils ont bougé. Les captures de référence sont dans ce même dossier (`*.png`, `*.a11y.txt`), listées par `README.md`.

# Le mode BULLES — analyse de conception iOS → web-v2

Analyse en lecture seule, arrêtée au 2026-09-08, sur le worktree
`/Users/smpceo/Documents/v2_meeshy-w3` (branche `claude/web-v3-parite`).
Aucun fichier du dépôt n'a été modifié.

Toute cote citée vient d'une ligne de code. Là où une valeur n'a pas été lue,
la phrase dit « à lire dans … » plutôt que d'avancer un chiffre.

> **L'arbre a bougé pendant l'analyse.** Entre 09:03 et 09:05, une session
> concurrente sur la même branche a livré `VITE_READING_MODES` (D-20) —
> `apps/web-v2/src/lib/api/config.ts`, `src/lib/reading-mode/decision.ts`,
> `src/routes/thread.tsx`, `vite.config.ts`, `README.md`. Le § 2.2, le tableau
> du § 8 et l'écart n° 14 ont été **relus contre l'arbre d'après** ; tout le
> reste du document a été établi contre l'arbre d'avant, sur des fichiers que ce
> lot ne touche pas. Ce fichier n'écrit rien dans le dépôt.

**L'ordre de grandeur, mesuré.** Le chemin bulle iOS pèse **14 747 lignes**
(`apps/ios/Meeshy/Features/Main/Views/Bubble/*.swift` = 9 852, plus
`ThemedMessageBubble.swift` 674, `MessageListViewController.swift` 3 421,
`MessageListView.swift` 800). Le chemin bulle web-v2 en pèse **644**
(`src/components/bubble.tsx` 226, `src/components/message-blocks.tsx` 342,
`src/lib/grouping.ts` 76). Le rapport est de 1 à 23 ; il ne dit pas que la
v3.1 est en retard de 23, il dit où chercher ce qui manque.

---

## 1. Sources lues

**iOS — la bulle.**
`apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble.swift` (674) ·
`Views/Bubble/BubbleStandardLayout.swift` (1 614) ·
`Views/Bubble/BubbleStandardLayout+Media.swift` (1 057) ·
`Views/Bubble/BubbleQuotedReply.swift` (746) ·
`Views/Bubble/BubbleCallNoticeView.swift` (717) ·
`Views/Bubble/BubbleContentBuilder.swift` (443) ·
`Views/Bubble/BubbleContent.swift` (412) ·
`Views/Bubble/BubbleReactionsOverlay.swift` (396) ·
`Views/Bubble/BubbleSystemViews.swift` (363) ·
`Views/Bubble/BubbleStoryCitationCard.swift` (346) ·
`Views/Bubble/AudioBubbleRouter.swift` (315) ·
`Views/Bubble/BubbleSticker.swift` (302) ·
`Views/Bubble/BubbleFooter.swift` (292) ·
`Views/Bubble/BubbleBodyFooterLayout.swift` (224) ·
`Views/Bubble/BubbleExpandableText.swift` (183) ·
`Views/Bubble/BubbleDeliveryCheck.swift` (179) ·
`Views/Bubble/BubbleMetaBadges.swift` (172) ·
`Views/Bubble/BubbleFooterModel.swift` (134) ·
`Views/Bubble/BubbleBlurRevealLifecycle.swift` (109) ·
`Views/Bubble/MessageDayGrouping.swift` (101) ·
`Views/Bubble/MessageDayLabel.swift` (83) ·
`Views/Bubble/BubbleEphemeralLifecycle.swift` (84) ·
`Views/Bubble/BubbleSecondaryContent.swift` (76) ·
`Views/Bubble/MessageDayStickyOverlay.swift` (70) ·
`Views/Bubble/BubbleLanguageFlagController.swift` (70) ·
`Views/Bubble/MessageDaySeparator.swift` (45) ·
`Views/Bubble/BubbleStyle.swift` (27) ·
`Views/Bubble/BubbleBackground.swift` (30).

**iOS — le fil et les gestes.**
`Views/MessageListViewController.swift` (3 421) · `Views/MessageListView.swift` (800) ·
`Views/MessageListSnapshotPrep.swift` · `Views/MessageListLayout.swift` ·
`Views/DiffableTypes.swift` · `Views/BubbleSwipeResistance.swift` ·
`Views/ConversationView.swift` · `Views/ConversationView+LongPressMenu.swift` ·
`Views/ConversationView+ScrollIndicators.swift` ·
`Components/MessageOverlayMenu.swift` · `Components/MessageActionsMenu.swift` ·
`Components/MessageActionResolver.swift` · `Components/MessageOverlayDragLaw.swift` ·
`Components/MessageMoreSheet.swift` · `Components/LanguageFlagChip.swift` ·
`Components/MessageEffectModifiers.swift` · `Core/DeviceLayout.swift` ·
`Focal/Core/ReadingModeOrchestrator.swift` · `Focal/Preferences/ReadingModeController.swift` ·
`Focal/Preferences/ReadingModePreferenceStore.swift` · `Focal/Lens/ReadingModeLensSheet.swift` ·
`Focal/Lens/ReadingModeChip.swift` · `Focal/Core/FocalMetrics.swift` ·
`Models/AudioTrackLanguageResolver.swift` · `MeeshyFeatureFlags.swift`.

**SDK et jetons.**
`packages/MeeshySDK/Sources/MeeshyUI/Theme/{DesignTokens,MeeshyColors,Accessibility}.swift` ·
`MeeshyUI/Primitives/{MeeshyAvatar,CachedAsyncImage,EmojiReactionPicker}.swift` ·
`MeeshyUI/Media/{AudioPlayerView,AudioPlayerView+Transcription,MediaTypes}.swift` ·
`MeeshyUI/Utilities/MessageTextRenderer.swift` ·
`MeeshySDK/Theme/ColorGeneration.swift` · `MeeshySDK/Auth/ReaderPrism.swift` ·
`MeeshySDK/Models/{CoreModels,MessageEffects,MeeshyMessage,MessageModels}.swift` ·
`packages/shared/utils/{conversation-helpers,conversation-colors,reading-modes}.ts` ·
`packages/shared/types/{conversation,reading-modes,message-effect-flags,attachment}.ts` ·
`packages/design-tokens/{ios.css,tokens.css}`.

**web-v2.**
`apps/web-v2/src/components/{bubble,message-blocks,focal-row,avatar,glyphs,reading-mode-chip}.tsx` ·
`src/routes/thread.tsx` · `src/lib/{grouping,accent,reader,languages}.ts` ·
`src/lib/view/message.ts` · `src/lib/api/{prism,types,fixtures}.ts` ·
`src/lib/reading-mode/{decision,catalog,store,meta,metrics}.ts` ·
`src/styles/{app,ios}.css` ·
`scripts/{check-thread-states,check-reading-mode,check-curve}.mjs` ·
`README.md` · `decisions.md` · `.cache/web-v2-workflow/specs/thread.md`.

**Documentation normative.** `apps/ios/CLAUDE.md` § « Bubble Component
Architecture » (l.150-165), § « Prisme Linguistique — Implementation iOS »
(l.241-292), § « Effets de message » (l.343-368) ; `CLAUDE.md` racine
§ « Conversation Accent Color », § « Prisme Linguistique ».

**Une correction de nomenclature, à porter dans toute suite.** Le brief nomme
`MeeshyMetrics` comme table de cotes : **ce type n'existe pas** dans le dépôt
(le seul symbole approchant est `MeeshyMetricsSubscriber`, une télémétrie de
notifications). La loi métrique est éclatée en quatre : `MeeshySpacing` /
`MeeshyRadius` / `MeeshyFont` / `MeeshyLayout`
(`packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift:5-59`),
`DeviceLayout` (`apps/ios/Meeshy/Core/DeviceLayout.swift:93-97`),
`FocalMetrics` (`apps/ios/Meeshy/Features/Main/Focal/Core/FocalMetrics.swift`)
et — pour la bulle, l'essentiel — **des littéraux posés dans les vues**, hors
de toute table.

---

## 2. Le mode Bulles dans la loi

### 2.1 La loi partagée

La loi vit dans `packages/shared/utils/reading-modes.ts`, gelée, et son
équivalent Swift dans `apps/ios/Meeshy/Features/Main/Focal/Core/ReadingModeOrchestrator.swift`.
Les cinq modes rendus sont `focal, script, summary, river, bubbles`
(`ReadingModeOrchestrator.swift:39-45`, `packages/shared/types/reading-modes.ts:17-23`) ;
les six mots du choix sont `auto, focal, script, resume, riviere, bulles`
(`ReadingModeOrchestrator.swift:74-81`).

`resolveOrchestratorDecision` (`ReadingModeOrchestrator.swift:288-318`,
`packages/shared/utils/reading-modes.ts:152-153` pour la première branche)
tranche dans cet ordre strict :

1. `!isFlagEnabled` ⇒ **`.bubbles` / `.flagDisabled`**, jamais clampé
   (`ReadingModeOrchestrator.swift:291-293`). C'est la **seule** branche de la
   loi qui produit `bubbles` : le catalogue drapeau-éteint vaut `[.bubbles]`
   et rien d'autre (`:392`, `packages/shared/utils/reading-modes.ts:286`).
2. choix collant ≠ `auto` ⇒ le mode collant, **clampé** au catalogue (`:295-300`).
3. `unreadCount > 25` ⇒ `.summary`, clampé (`:302-307`).
4. `unreadCount ≥ 10` et absence > 24 h (`absenceWindowMs`, `:138`) ⇒ `.summary`, clampé (`:309-315`).
5. défaut ⇒ `.focal` (`:317`).

`bubbles` n'appartenant à aucun catalogue drapeau-ON, un choix collant
`bulles` serait rabattu sur `focal` par la loi seule. **La règle de rendu vit
donc à la CONSOMMATION**, en deux exemplaires jumeaux et volontairement
identiques :

- iOS — `ReadingModeController.renderDecision`
  (`Focal/Preferences/ReadingModeController.swift:120-127`) :
  `guard isFlagEnabled, stickyMode == .bubbles else { return lawDecision }` puis
  `OrchestratorDecision(mode: .bubbles, reason: .sticky)`.
- web-v2 — `resolveThreadMode` (`apps/web-v2/src/lib/reading-mode/decision.ts:106-108`) :
  `if (input.sticky === 'bulles') return { mode: 'bubbles', reason: 'sticky' }`,
  avec un doc-comment qui cite explicitement `ReadingModeController.swift:120-127`
  (`decision.ts:82-88`).

**Bulles est donc rendu ssi** : (a) le drapeau `reading_modes` est éteint, (b)
le drapeau est allumé et la préférence collante de ce `(lecteur, conversation)`
vaut exactement `bulles`, ou (c) — iOS seul — un `forcedMode` l'impose
(`ReadingModeController.swift:54, 75-85`).

### 2.2 Ce que voit une installation sans bêta

Sur iOS, le drapeau naît **éteint** : `MeeshyFeatureFlags.isReadingModesEnabled`
retombe sur `BetaFeaturesPreference.isEnabled`, elle-même OFF depuis la décision
du 2026-08-22 — le commentaire le dit mot pour mot,
`apps/ios/Meeshy/MeeshyFeatureFlags.swift:22-30` : « à l'installation, rien
n'étant posé, `isReadingModesEnabled` vaut `false` et le tap normal ouvre en
BULLES ». Dans ce cas la puce de mode **n'existe pas** :
`ConversationView.readingModeAffordanceCluster` rend `EmptyView()` dès que le
catalogue ne contient que `.bubbles` (`ConversationView.swift:2405-2407`).

**web-v2 modélise cette branche depuis le lot D-20 du 2026-09-08** (voir
l'encadré liminaire). Le drapeau y est un **paramètre de CONSTRUCTION**, pas une
préférence utilisateur : `VITE_READING_MODES`, résolu une seule fois par
`resolveReadingModes` (`src/lib/api/config.ts:85-90`, `!== 'off'` — donc **allumé
par défaut**) et exposé en `apiConfig.readingModesEnabled` (`:39-44, 114`). Il
descend ensuite jusque dans la loi partagée : `threadCapabilities` le passe en
`isFlagEnabled` (`decision.ts:65`), `resolveThreadMode` aussi (`:127`), et une
**nouvelle branche prioritaire** rend `bubbles` avec la raison de la loi avant
même de regarder le choix collant (`:130-132`). Le doc-comment `:98-110` motive
l'ordre : la table de priorité Swift met la branche 1 avant la branche 2, donc
un `bulles` collant ne peut pas primer sur un drapeau éteint. Et la puce
disparaît quand le drapeau est éteint (`thread.tsx:377`), miroir exact de
`ConversationView.swift:2405-2407`.

Le doc-comment « INATTEIGNABLE par construction » a été réécrit en conséquence
(`decision.ts:142-150`) : le repli `focal`/`clamped-unavailable` ne sert plus
qu'au cas d'un mode listé hors catalogue de rendu.

**Deux écarts subsistent, et ils ne sont pas du même ordre.**

1. **Le DÉFAUT reste inversé.** iOS naît drapeau ÉTEINT
   (`MeeshyFeatureFlags.swift:22-30`) donc en bulles ; web-v2 naît drapeau
   ALLUMÉ (`config.ts:90`, `!== 'off'`) donc en focal. D-7
   (`decisions.md:92-100`) l'assume : « C'est un écart assumé avec iOS **en
   pratique** — pas en droit […] La v4 applique la loi telle qu'elle est
   écrite. » Un lecteur web ouvre donc toujours en `focal` et doit choisir
   « Bulles » au menu, là où un utilisateur iOS sans bêta ouvre en bulles sans
   rien choisir. La cible du 2026-09-08 le sait ; c'est une décision produit,
   pas un défaut.
2. **Le drapeau n'a pas la même GRANULARITÉ.** iOS le résout par une cascade à
   trois étages — variable d'environnement, clé `UserDefaults` explicite, puis
   la préférence bêta de l'utilisateur (`LentilleFeatureFlag.swift:119-128`) —
   donc il change sans redéploiement, par utilisateur. Web-v3 le fige au
   `vite build`. Pour la parité, cela veut dire qu'un utilisateur web ne peut
   pas *entrer* dans la bêta : c'est le déploiement qui l'y met ou l'en sort.
3. **D-20 (`decisions.md:628`, #5672) a été écrite dans la foulée**, et elle
   affirme au passage qu'une capture drapeaux éteints montre une « bulle à
   queue ». **Le Swift dit le contraire** : le mode Bulles rend le même
   `BubbleStandardLayout` dans les deux configurations, et aucune queue n'existe
   nulle part. Détail et preuves au § 10.

### 2.3 Entrer et sortir du mode

| | iOS | web-v2 |
|---|---|---|
| affordance | puce `ReadingModeChip` dans la grappe d'actions de l'en-tête replié (`ConversationView.swift:2413-2432`) | puce `ReadingModeChip` au même endroit (`thread.tsx:370-376`) |
| geste primaire | **tap = CYCLE** (`ConversationView.swift:2420-2429`) sur `ReadingModeLensCatalog.cycleOrder` = `[.focal, .script, .bubbles]` (`ReadingModeLensSheet.swift:56`) | **clic = MENU** (`reading-mode-chip.tsx:9-15`) — écart assumé et documenté (pas d'équivalent accessible de l'appui long au clavier) |
| geste secondaire | appui long ⇒ `.contextMenu` natif (`ReadingModeChip.swift:82`) | — (absent) |
| ordre du menu | `displayOrder = [focal, script, bubbles, summary, river]` (`ReadingModeLensSheet.swift:52`) | `MENU_ORDER` identique (`catalog.ts:12`) |
| libellés | Focal / Script / Résumé / Rivière / Bulles (`ReadingModeLensSheet.swift:117-125`) | idem (`catalog.ts:25-31`) ; sous-titre Bulles : « Les bulles classiques » (`catalog.ts:38`) |
| `bulles` sélectionnable | toujours, drapeau ON (`ReadingModeLensSheet.swift:103-105`) | toujours (`catalog.ts:80-89`, `isAvailable: true` inconditionnel) |
| retour auto | « Automatique » efface la clé (`ReadingModeController.resetToAuto`, `:138-141`) | idem (`thread.tsx:324-327` → `store.setPreference(..., null)`) |
| persistance | `UserDefaults`, clé `meeshy_readmode_<scope>_<conversationId>` (`ReadingModePreferenceStore.swift:69-74`) ; scope = `u_<userId>` ou `a_<sha256(participantId)[0..16]>` | `localStorage`, clé `meeshy.reading-mode.<scope>.<conversationId>` (`store.ts:35-36`) ; **scope figé à `'local'`** tant qu'aucune session n'existe (`thread.tsx:39`) |

La feuille Lentille est morte des deux côtés : `ReadingModeLensSheet.swift:188-190`
dit « la feuille Lentille est REMPLACÉE par le menu d'appui long du chip » ; le
web n'en a jamais eu.

Le témoin de l'EFFET existe : `apps/web-v2/scripts/check-reading-mode.mjs:364-372`
sélectionne « Bulles », vérifie qu'au moins un nœud `.rounded-bubble` apparaît
dans `main li`, qu'aucune rangée plate ne subsiste, puis **recharge la page** et
revérifie. C'est la seule preuve automatisée que le mode Bulles existe côté web —
elle prouve la bascule, jamais l'anatomie (§ 9).

---

## 3. Anatomie de la bulle

### 3.0 Le modèle de valeur, et pourquoi il précède le dessin

Avant toute cote, la doctrine : **aucune sous-vue ne lit `MeeshyMessage`, elles
lisent `BubbleContent`** (`BubbleContent.swift:4-7`), un `struct Equatable`
(`:8`) dont le `==` compare chaque champ stocké (`:386-411`) — les réactions
étant comparées **par projection** (`map(\.emoji)`, `map(\.count)`,
`map(\.includesMe)`, `:402-404`) faute d'`Equatable` sur le type du SDK. C'est
ce qui rend tenable « Zero Unnecessary Re-render » sur une cellule de liste
(`apps/ios/CLAUDE.md:163`).

Cinq natures (`BubbleContent.Kind`, `:9-18`) : `.standard`, `.deleted`,
`.burned`, `.ephemeralExpired`, `.system`. L'échelle de décision est ordonnée
(`BubbleContentBuilder.swift:52-60`) : source système → supprimé → vue unique
consommée → standard. `.burned` **n'exclut délibérément pas `isMe`**
(`:43-47`) ; `.ephemeralExpired` est déclaré mais **jamais assigné** par
l'initialiseur — l'expiration se traite au rendu
(`ThemedMessageBubble.swift:322-323`).

Deux dérivations gouvernent tout le reste du dessin :

- **`hasTextOrNonMediaContent`** (`BubbleContent.swift:336-361`) — vrai pour un
  lieu ou une pièce non-média, **faux pour un message audio même avec du
  texte**, parce que la transcription se rend dans le widget audio (`:350-359`).
  C'est ce booléen qui décide du rembourrage vertical de la bulle
  (10 ou 4, BSL:1125) et du montage du bloc de corps (BSL:1067).
- **`audioHostsReply` / `visualHostsReply`** (`:367-384`) — quand une citation
  est le seul contenu à côté d'un audio ou d'une grille, elle est **hébergée par
  le média**, pas par la bulle de texte. C'est la raison pour laquelle
  `BubbleStandardLayout` a trois chemins de citation et non un.

La règle d'exclusivité mérite d'être notée : `location` ne coexiste jamais avec
une pièce jointe `.location`, l'initialiseur le garantissant au partitionnement
(`BubbleContentBuilder.swift:221-230`) ; et le statut de remise est **résolu une
seule fois**, au site d'affichage, contre `recipientCount` et les préférences de
confidentialité (`:285-303`).

**web-v2 n'a pas de modèle de valeur** : `bubble.tsx` lit `Message` directement.
Sur 226 lignes ce n'est pas un défaut ; sur les 14 747 du côté iOS, ç'en serait
un, et le `CLAUDE.md` iOS l'interdit explicitement (`:158-161` : « ne JAMAIS
réintroduire de logique inline »). C'est le point d'architecture à trancher
avant d'ajouter la troisième feature à la peau bulle web.

### 3.1 La rangée, de gauche à droite

**iOS** — `BubbleStandardLayout.body` (`BubbleStandardLayout.swift:515-778`,
ci-après **BSL**) ouvre un `HStack(alignment: .bottom, spacing: 0)` (BSL:517)
avec un `Spacer(minLength: 50)` en tête si `isMe` (BSL:518) et en queue sinon
(BSL:647). La colonne est alignée `isMe ? .trailing : .leading` (BSL:520), et
plafonnée par `.frame(maxWidth: DeviceLayout.bubbleMaxWidth(sizeClass:))`
(BSL:640).

`DeviceLayout.bubbleMaxWidth` (`apps/ios/Meeshy/Core/DeviceLayout.swift:93-97`) :

```swift
let ratio: CGFloat = sizeClass == .regular ? 0.62 : 0.70
let cap:   CGFloat = sizeClass == .regular ? 560  : .infinity
return min(containerWidth * ratio, cap)
```

Le conteneur est la **fenêtre**, jamais l'écran (`DeviceLayout.swift:106-108`,
`:65-67` — l'argument est Split View sur iPad).

**web-v2** — `bubble.tsx:97` pose `justify-end` / `justify-start`, `:104`
`max-w-[70%]`, `:105` `marginInlineStart/End: 50`. Le ratio compact 0,70 et la
gouttière 50 sont donc **conformes** ; la branche `regular` (0,62 plafonné à
560) n'existe pas — sur une fenêtre large, la bulle web continue de suivre 70 %
là où iPad s'arrête à 560 pt.

### 3.2 La forme — rayon uniforme 18, **aucune queue**

C'est la question que le brief pose comme load-bearing, et la réponse est nette.

`BubbleBackground.swift:20-28` :

```swift
let other = Color(hex: accentHex)
RoundedRectangle(cornerRadius: 18)
    .fill(isMe ? MeeshyColors.brandPrimary : other.opacity(isDark ? 0.28 : 0.16))
    .overlay(
        RoundedRectangle(cornerRadius: 18)
            .strokeBorder(isMe ? Color.clear : other.opacity(isDark ? 0.34 : 0.26),
                          lineWidth: isMe ? 0 : 1)
    )
```

Le clip est le même : `.clipShape(RoundedRectangle(cornerRadius: 18))`
(BSL:1171), et le voile de brouillard aussi (BSL:1545).

**Aucune queue, aucun coin asymétrique, aucune variation de rayon selon la
place dans une suite.** Les balayages qui l'établissent :
`UnevenRoundedRectangle` n'apparaît que dans `MessageOverlayMenu.swift:1077,1155`,
`MentionSuggestionPanel.swift:23` et `Riviere/View/RiverBubbleView.swift:496` —
jamais sous `Views/Bubble/` ; aucun `struct … : Shape` du dépôt ne dessine de
becquet ; le mot `tail` sous `Views/Bubble/` ne désigne que la file d'attente
audio (`audioQueueTail*`) et la fin d'une suite. Le rayon reste 18 en tête, au
milieu et en queue de suite.

**Si une capture de run montre « une bulle classique avec queue », elle ne
montre pas cette base de code.** Aucun chemin de `BubbleStandardLayout` ne peut
la produire.

**web-v2** applique `rounded-bubble` (`bubble.tsx:108`), aliasé sur
`--ios-radius-bubble` (`src/styles/ios.css:52`) lui-même généré depuis Swift :
`packages/design-tokens/ios.css:86` porte
`--ios-radius-bubble: 18px; /* Bubble/BubbleBackground.swift — cornerRadius: 18, littéral */`.
**Conforme, et dérivé plutôt que recopié.**

### 3.3 Le fond — et le seul vrai écart de couleur

`BubbleBackground` reçoit `accentHex: otherBubbleColor` (BSL:1436), et
`otherBubbleColor` est un paramètre de la vue (BSL:52) alimenté par
`ThemedMessageBubble.swift:440`. Sa définition, `ThemedMessageBubble.swift:383-390` :

```swift
private var otherBubbleColor: String {
    DynamicColorGenerator.blendTwo(
        message.senderColor ?? contactColor, weight1: 0.30,
        MeeshyColors.brandPrimaryHex,        weight2: 0.70
    )
}
```

Trois conséquences, toutes invisibles depuis la seule lecture de
`BubbleBackground` :

1. **La bulle reçue n'est PAS l'accent de la conversation** : c'est
   `blend(accent × 0,30, indigo500 × 0,70)`, puis servi à 0,28 (sombre) / 0,16
   (clair) avec un filet de 1 pt à 0,34 / 0,26.
2. **Elle varie par EXPÉDITEUR, pas par conversation** : `message.senderColor`
   prime sur `contactColor`, et `senderColor` est
   `DynamicColorGenerator.colorForName(displayName)`
   (`packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:742`), un
   tirage déterministe DJB2 dans une palette de 40 teintes
   (`ColorGeneration.swift:234-237`, commentaire `:91`). Dans un groupe de six,
   iOS peint six teintes de reçu ; web-v2 en peint une.
3. `contactColor` n'intervient qu'en repli, et il vaut bien l'accent de
   conversation (`ConversationView.swift:464-466` → `MessageListViewController.swift:1214, 1459`).

La bulle envoyée, elle, est `MeeshyColors.brandPrimary` = `indigo500` =
`#6366F1` (`MeeshyColors.swift:12, 41, 52`), **plate, sans bordure**
(`lineWidth: isMe ? 0`), **identique dans toutes les conversations**.

**Ni ombre ni dégradé.** `BubbleBackground.swift:13-18` le motive : « fonds
PLATS (couleur unie) au lieu de dégradés. Un LinearGradient + un overlay stroke
dégradé par bulle, c'est 2 passes offscreen par cellule au scroll — un tueur de
FPS. » Et BSL ne contient **aucun** `.shadow(` (0 occurrence), avec le
commentaire BSL:1172-1174 : « Les bulles sont désormais plates et nettes. » Les
ombres qui subsistent dans le dossier sont sur des sous-éléments (médias,
pastilles de réaction, citation), jamais sur le fond de bulle.

**web-v2** — `bubble.tsx:92-93, 111-112` :

```
receivedBg       = color-mix(in srgb, var(--accent) var(--ios-bubble-other-opacity), transparent)
receivedHairline = color-mix(in srgb, var(--accent) var(--ios-bubble-other-hairline-opacity), transparent)
isMine ? backgroundColor: var(--color-bubble-mine), color: white
       : backgroundColor: receivedBg, border: 1px solid receivedHairline
```

Les opacités (28 %/16 %, 34 %/26 %) et l'indigo envoyé sont **dérivés** de
Swift (`packages/design-tokens/ios.css:98-101, 118-119`). L'écart n'est ni dans
l'opacité ni dans l'indigo : il est dans le **HEX qu'on teinte** —
`var(--accent)` brut, posé une fois pour toute la conversation
(`thread.tsx:264, 330` via `accentOf`, `accent.ts:26-30`), là où iOS teinte le
mélange 30/70 recalculé **par expéditeur**.

Aucune ombre en web non plus, sauf l'anneau temporaire de mise en évidence
après un saut de citation (`bubble.tsx:116`, `boxShadow: '0 0 0 2.5px var(--accent)'`)
— qui n'a pas d'équivalent iOS (iOS fait un flash d'alpha + `scale 1.02`,
`MessageListViewController.swift:2778-2801`).

### 3.4 Les rembourrages

| | iOS | web-v2 | verdict |
|---|---|---|---|
| horizontal du corps | `14` (BSL:1124) | `px-3.5` = 14 px (`bubble.tsx:108`) | conforme |
| vertical du corps | `10`, ou `4` sans texte (BSL:1125) | `py-2.5` = 10 px, sans variante | conforme au cas nominal |
| VStack du corps | `spacing: 8` (BSL:1068) | pas d'équivalent (les blocs s'empilent avec leurs propres marges) | divergent |
| corps ↔ pied | `BubbleBodyFooterLayout(spacing: 4)` (BSL:1144) | `pt-1` = 4 px, `pt-2` = 8 px avec identité (`bubble.tsx:163`) | conforme |
| pied horizontal | `10` avec identité, `14` sinon (BSL:1246) | non appliqué (le pied hérite du `px-3.5` du corps) | divergent (mineur) |
| pied bas | `8` (BSL:1248) | absorbé par `py-2.5` | divergent (mineur) |

### 3.5 Avatar et nom d'auteur — la question du README

La règle iOS, `BubbleStandardLayout.swift:238-240` :

```swift
private var showIdentityBar: Bool { !isDirect && isLastInGroup && !content.isMe }
```

Trois conditions : **conversation de groupe**, **DERNIER message de la suite**,
**reçu**. `MessageDayGrouping.swift:71-77` le redit en toutes lettres : « En
mode Bulles, c'est le DERNIER message d'une suite qui porte l'identité. »

Et l'identité vit **DANS le pied de la bulle**, pas dans une gouttière : le pied
est le second enfant de `BubbleBodyFooterLayout` (BSL:1155), donc **à
l'intérieur** du `.background(bubbleBackground)` (BSL:1165) et du
`.clipShape` (BSL:1171). `BubbleFooter.swift:73-111` : `HStack(alignment: .top,
spacing: 8)` → `MeeshyAvatar(context: .messageBubble)` (32 pt,
`MeeshyAvatar.swift:58`) → `VStack(spacing: 2)` → nom
`.footnote.weight(.semibold)` tronqué à 16 caractères (`BubbleFooter.swift:96-98`),
badge de rôle (`:99`), puis `@username` en `.caption2` opacité 0,8 (`:104-109`).

Piège pour un portage : le paramètre `showAvatar` **existe et n'est jamais lu**
(BSL:59 ; `MessageListViewController.swift:1471` le calcule, `BubbleStyle.swift:14`
le transporte, personne ne le consomme). La vraie porte est `showIdentityBar`.

**web-v2** — `bubble.tsx:80` :

```ts
const showsIdentity = isGrouped && !isMine && tail;
```

Trois conditions, dans le même ordre, avec `tail` fourni par
`grouping.ts:41-42` (« DERNIER d'une suite — c'est LUI qui porte l'avatar et le
nom (choix iOS) »). L'avatar est monté à `size={32}` (`bubble.tsx:170`) dans le
conteneur du pied (`:162-173`), le nom en `text-title font-semibold`
(`:176-178`). **Conforme.** Manquent : le `@username` (aucun rendu), le badge de
rôle, la troncature à 16 caractères, l'anneau de story et la pastille de
présence que `MeeshyAvatar` porte en contexte `.messageBubble`.

### 3.6 Le corps — texte

`BubbleExpandableText.swift` : la troncature est un **compte de CARACTÈRES**,
pas de lignes — `truncateLimit = 512` (`:14`), coupé au dernier espace
(`:177-182`), suffixé `"..."` (`:90`). Le libellé est « Voir plus » (`:112`), en
`MeeshyFont.relative(12, weight: .semibold)` à opacité 0,6 (`:113-114`), zone de
frappe `minHeight: 24` + `DownwardExtendedTapShape(extraBottom: 20)` (`:122-124`)
et un retrait droit de 48 pt pour ne pas croiser le bouton « + » des réactions
(`:100-105, 123`). **L'expansion est à sens unique** : le bouton disparaît
ensuite (`:139-143`). Animation `.easeInOut(duration: 0.25)`, coupée sous
`accessibilityReduceMotion` (`:155-168`).

Le rendu du texte lui-même passe par `MessageTextRenderer.render`
(`packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift:7-21`) :
un pipeline de règles `NSRegularExpression` + `NSDataDetector`, **pas** le
Markdown natif de SwiftUI — gras/italique/barré/souligné imbriqués, liens
`m+TOKEN` → `https://meeshy.me/l/TOKEN`, mentions `@handle` résolues en noms
d'affichage, hashtags, URL auto-détectées, réécriture des liens tracés, et
surlignage de recherche. Taille par défaut 15 pt (`BubbleExpandableText.swift:52`),
couleur `isMe ? .white : MeeshyColors.textPrimary(isDark:)` (`:85`).

**web-v2** — `bubble.tsx:147-156` : un `<p className="text-bubble
leading-[1.35] whitespace-pre-wrap" lang={rendered.language}>`. `text-bubble` =
`--ios-font-body` = 15 px (`src/styles/ios.css:66`, `ios.css:78`). Le `lang`
porté par le texte servi est un point que iOS n'a pas besoin de traiter et que
le web traite bien. **Absents** : « voir plus » (aucune troncature — un message
de 3 000 caractères s'affiche entier), liens, mentions, hashtags, gras/italique,
surlignage de recherche.

### 3.7 Le corps — média

**iOS.** La grille est dans `BubbleStandardLayout+Media.swift:44-103`, avec
`gridMaxWidth = 300` (BSL:177) et `gridSpacing = 2` (BSL:178) :

| n pièces | disposition | cadre |
|---|---|---|
| 1 image | cellule pleine | `300 × 240` (`+Media:63-66`) |
| 1 vidéo | cellule pleine, hauteur par `aspectRatio` du média | `width: 300`, sans plafond (`:54-62`) |
| 2 | `HStack(spacing: 2)`, cellules 149 | `300 × 180` (`:68-73`) |
| 3 | gauche 178,8 (60 %) + colonne droite 119,2 (40 %) | `300 × 240` (`:75-87`) |
| 4+ | deux rangées de deux, cellules 149, **badge `+N` sur la 4ᵉ** | `300 × 240` (`:89-101`, badge `:509-516`) |

Le rayon n'est pas sur la cellule mais sur la grille entière :
`.clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg))` (BSL:817), et
`MeeshyRadius.lg = 16` (`DesignTokens.swift:20`). **La grille est un FRÈRE de la
bulle de texte**, pas un enfant : les deux vivent dans le `VStack(spacing: 4)`
de BSL:794 — donc le média n'est jamais teinté par le fond de la bulle.

Avant téléchargement : `ProgressiveCachedImage` décode le **ThumbHash** de
façon synchrone dans son `init` (`CachedAsyncImage.swift:457-481`), avec une
échelle à quatre niveaux (disque complet → vignette chaude → ThumbHash →
`Color(hex: attachment.thumbnailColor).shimmer()` après ~200 ms). Le
téléchargement est **gouverné par une politique** (`MediaDownloadPolicyEngine.swift:7-19`)
et non automatique en conversation (`autoLoad` défaut `false`,
`CachedAsyncImage.swift:418-424, 446`) ; l'affordance est un badge central
56/48 pt qui devient un **anneau de progression** annulable
(`ConversationMediaViews.swift:123-211`). Vidéo : poster ThumbHash, glyphe play
48/36 pt, badge de durée `m:ss` en capsule noire 0,6 (`+Media:690-726`), barre de
consommation de 3 pt en pied (`MediaConsumptionProgressBar.swift:23-41`).

**web-v2** — `message-blocks.tsx:307-342`. Chaque pièce est rendue
indépendamment ; il n'y a **pas de grille** : une image seule donne un cadre
`max-w-[300px]` avec `aspect-ratio: 300 / 240` et `rounded-card`
(`:320-321`) — les bonnes cotes pour le cas 1, et le seul cas traité. Deux
images donnent deux tuiles 300×240 empilées, là où iOS en fait une paire
149×180. Aucun `+N`.

Et surtout : **aucune image n'est affichée.** Le contenu de la tuile est
`<Glyph name="image" size={40} className="opacity-40" />` (`:325`). Un balayage
de `apps/web-v2/src` ne trouve **aucun** `<img>`, `<audio>` ni `<video>` hors de
la page institutionnelle. Les fixtures posent d'ailleurs `fileUrl: ''`
(`src/lib/api/fixtures.ts:205`), donc la donnée elle-même est absente. Le
`role="img"` + `aria-label` (`:322-323`) est honnête sur l'intention et
trompeur sur le fait : un lecteur d'écran annonce une image qui n'existe pas.

### 3.8 Le corps — audio

**iOS.** `AudioBubbleRouter` (`AudioBubbleRouter.swift:45-190`) ne choisit pas
le chrome mais le **moteur** : bulle active ⇒ moteur partagé du coordinateur,
inactive ⇒ `AudioPlaybackManager` local et le tap de lecture est intercepté
(`:12-26, 185-188`). Le chrome par défaut est `.card` (`:98`) parmi trois
(`AudioPlayerView.swift:672-688`). Plus d'une piste ⇒ `AudioCarouselView`
(BSL:851). La forme d'onde compte **48 barres en compact, 72 sinon**
(`AudioPlayerView.swift:1442`), teintée par la fraction déjà écoutée
(`MediaConsumptionStore`, `:1445-1451`) ; le scrub est un
`DragGesture(minimumDistance: 0)` en `highPriorityGesture` (`:1550-1573`) ; la
vitesse cycle sur huit paliers 0,8 → 2,25× (`MediaTypes.swift:153-173`,
`AudioPlayerView.swift:1621`) ; la transcription s'affiche en karaoké
segment-par-segment, chaque segment cliquable pour `seekToTime`
(`AudioPlayerView+Transcription.swift:456-520`), avec réservation de hauteur
pendant 90 s (`:552-589`).

La piste jouée est élue par `AudioTrackLanguageResolver`
(`apps/ios/Meeshy/Features/Main/Models/AudioTrackLanguageResolver.swift:62-81`) :
override manuel, sinon descente ordonnée du prisme du lecteur, l'original
gagnant **à son rang** (retour `nil`). Note utile pour toute suite :
`resolveTranslatedAudio` — nommé dans le `CLAUDE.md` racine — **n'existe pas
dans ce dépôt** ; le site unique iOS est `AudioTrackLanguageResolver`.

**web-v2** — `message-blocks.tsx:265-305`. Un bouton `size-[34px]` (la bonne
cote : `AudioPlayerView.swift:1357` donne 34 en compact), une onde de **22
barres DÉRIVÉES DE L'ID** (`view/message.ts:81-84`, honnêtement documentée
comme telle), une durée `m:ss` depuis `duration` en millisecondes. Le bouton
`onClick={() => setPlaying(v => !v)}` (`:277`) ne fait **que basculer un état
local** : aucun son n'est joué, aucune transcription n'est rendue, aucune piste
traduite n'est élue. Par la loi 4 du dépôt (« un contrôle existe s'il a un
effet »), ce bouton est **absent**, pas partiel.

### 3.9 Le corps — réponse citée, citation de story, notice d'appel, sticker, vues système

Ces cinq surfaces ont chacune leur vue iOS, et une seule a un équivalent web.

- **Réponse citée** — `BubbleQuotedReply.swift`, montée en tête du corps de la
  bulle (BSL:1044-1056), tap → `onReplyTap` avec `HapticFeedback.light()`.
  Cotes : avatar d'auteur 22 (`:100`), vignette média 38 avec rayon 6
  (`:104, 394-395`), filet d'accent `width: 4` / `cornerRadius: 2` (`:489-491`),
  carte `RoundedRectangle(cornerRadius: 12, style: .continuous)` (`:572`),
  paddings 6 haut / 6 horizontal (`:575-576`), intérieur 8 vertical / 8 début /
  10 fin (`:555-558`), corps du texte à 12 pt (`:443`). Ce rayon 12 est dérivé
  côté web : `--ios-radius-quote: 12px` avec sa citation de site
  (`packages/design-tokens/ios.css:88`).

  Le fichier porte une **LOI DES ZONES** (`:16-63`) qui vaut d'être portée telle
  quelle : trois classes tactiles seulement — l'avatar de l'auteur cité ouvre
  son profil, la vignette ou le glyphe de lecture ouvre le média, **tout le
  reste, le nom compris, ramène au message cité**. Et **une zone sans
  gestionnaire n'attache AUCUN geste** (`:41-45, 266-269, 305-310`), pour que le
  tap retombe sur la zone 3 au lieu de heurter une cible morte. Le trait
  `.isButton` suit l'ARMEMENT, pas la présence (`:352-354`).

  Deux règles de protection y sont appliquées au niveau du MODÈLE, pas de la
  peau : `QuotedReplyPresentation.detailsLabel(for:)` rend `nil` pour un média
  protégé (`QuotedReplyPresentation.swift:156` — « des dimensions décrivent le
  secret par la bande »), et `thumbHash(for:)` aussi (`:177` — « un flou EST une
  image »).

  La troncature est **double** : une coupe au mot, calculée AVANT le rendu, sur
  un budget de caractères dérivé du Dynamic Type — `previewCharacterBudget` =
  `previewLineLimit(.bubble) × charactersPerLine`, soit **138 / 114 / 96 / 78 /
  60** signes de `large` à `accessibility2`
  (`QuotedReplyPresentation.swift:63-68, 278-281` ;
  `QuotedReplyPresentation+DynamicType.swift:28-34`) — puis un `lineLimit(3)`
  qui ne sert plus que de borne de hauteur (`BubbleQuotedReply.swift:519`).
  `wordTruncated` **n'ajoute aucun points de suspension quand le texte tient**
  (`QuotedReplyPresentation.swift:285-287, 295`).

  **web-v2** : `message-blocks.tsx:218-263` — bouton pleine largeur
  `rounded-quote`, filet `w-1` (**4 px**, conforme), nom et texte **dans le même
  paragraphe** (directive #5103, `:250-259`), `onJump` câblé jusqu'à
  `virtualizer.scrollToIndex` (`thread.tsx:174-181`). **Le plus fidèle des
  blocs.** Manquent : l'avatar 22, la vignette 38, la loi des zones (le web n'a
  qu'une zone, le bouton entier), le budget de caractères, et les deux actions
  VoiceOver nommées qu'iOS ajoute (`BubbleStandardLayout.swift:423-436`). Et
  `line-clamp-2` **coupe à 2 lignes là où iOS en autorise 3**
  (`QuotedReplyPresentation.swift:65` : `.bubble → 3`, `.focal`/`.composer` → 2,
  avec le raisonnement « jamais 1, qui coupait la moitié des citations en plein
  milieu », `:59-62`).

  Écart de couleur à relever : `--ios-quote-bg-mine` vaut `white 15%` dans les
  **deux** schémas (`ios.css:105, 123`), donc la citation d'un message à soi est
  la même en clair et en sombre — c'est ce que Swift fait
  (`BubbleQuotedReply.swift:483-485`), et le web le suit.
- **Citation de story** — `BubbleStoryCitationCard.swift`, montée **HORS** de la
  bulle colorée, sur le fond de conversation (BSL:552-565). Une carte-scène
  portrait : largeur **132** (`:66`), rapport **9/16** (`:69`) donc hauteur
  **235** (`:71`), rayon `MeeshyRadius.lg` = 16 (`:106`), texte de scène
  `relative(13, .semibold)` blanc centré sur **4 lignes** avec une ombre noire
  0,55 (`:153-157`), puis une bande basse « ↩ réponse à sa story » +
  date relative sur sa PROPRE ligne (`:203-231` — côte à côte sur 132 pt, la
  date se réduisait à un trait d'un pixel, `:191-202`), fond de bande
  `accentHex` à 0,28/0,16 (`:238`). Le trait `.isButton` n'est posé que si
  `onOpen != nil` (`:111`), et `OpenGesture` n'attache le tap que dans ce cas
  (`:333-345`).
  La règle qui la DÉTACHE de la bulle est nommée et partagée :
  `StoryCitationPlacement.isDetached = isStoryReply && !hasMoodEmoji &&
  !visualHostsReply && !audioHostsReply` (`:285-293`), exposée aux trois peaux
  par `BubbleContent.detachedStoryCitation` (`:316-326`) — sortie d'un `private
  var` de `BubbleStandardLayout` précisément parce qu'un site unique `private`
  n'est unique que dans son fichier (`:298-315`). **Absent** du web.
- **Notice d'appel** — `BubbleCallNoticeView.swift` (717 l), dispatchée en amont
  de `BubbleStandardLayout` (`ThemedMessageBubble.swift:307-308`). Sept
  variantes résolues par `CallNoticePresentation` (`:286-355`) : en cours vidéo
  / audio (accent), annulé, terminé (accent), manqué vidéo / audio (`error`),
  refusé / rejeté (`error`), interrompu (`warning`) ; le glyphe médias est
  `video.fill` ou `phone.fill` (`:306-308`) et la puce de direction
  `arrow.up.right` / `arrow.down.left` (`:311-313`). **Il n'y a pas de variante
  de groupe** : `CallSummaryMetadata` ne porte ni compte de participants ni
  drapeau de groupe (`packages/MeeshySDK/Sources/MeeshySDK/Models/CallSummaryMetadata.swift:38-58`).
  Cotes : cercle de glyphe 36 avec puce 16 décalée (+3,+3) (`:206-226`),
  `HStack(spacing: 11)`, paddings 13/9, **`minHeight: 44`** (`:114, 133-135`),
  contour RR16 à 0,06/0,03 avec filet 0,5 pt (`:231-238`).
  Le rappel est un **DOUBLE TAP**, jamais un tap simple (`:87-90`), et le
  commentaire `:64-84` donne l'histoire : le tap simple mettait l'action la plus
  lourde du fil sur une carte large dans une liste qui défile (risque de
  déclenchement en poche, audit 2026-07-03) ; l'appui long a été essayé puis
  abandonné parce qu'il appartient au menu d'options — « une carte système ne
  gagne pas un geste, elle en VOLE un ». VoiceOver reçoit les deux destinations
  en actions nommées (`:93-105`). **Absent** du web (le seul glyphe `phone` du
  fil est le bouton d'appel de l'en-tête, `thread.tsx:389`).
- **Sticker** — `BubbleSticker.swift`, **chrome de bulle entièrement supprimé**
  (« Ni fond, ni coin, ni bordure : le sticker EST le message », `:5-8`), côté
  160 pt (`:38`), poses animées bornées à une passe finie
  (`MessageStickerArtwork.swift:177-187`). **Absent** du web.
- **Vues système / supprimé / consumé** — `BubbleSystemViews.swift` contient
  **exactement six types** (`:13, 50, 98, 159, 175, 327`), et le dispatch est à
  `ThemedMessageBubble.swift:306-326` :
  - `BubbleDeletedView` (`:13-48`) — **garde l'alignement de l'expéditeur**
    (`Spacer(minLength: 50)` du bon côté, `:19, 43`), glyphe `nosign` en
    `textMuted`, texte « Message supprimé » en `relative(13)` **italique**,
    capsule 0,05/0,03 avec filet 0,5 (`:22-38`).
  - `BubbleBurnedView` (`:50-85`) — même squelette, glyphe `flame.fill` en
    `warning`, texte « Vu et supprimé », capsule `warning` à 0,08 (`:59-74`).
  - `BubbleSystemNoticeView` (`:98-137`) — la notice CENTRÉE générique : l'heure
    du fil gravée EN PREMIER (`relative(9.5, .semibold)`, `:108-113`), le texte
    en `relative(12.5, .medium)` centré, capsule 0,06/0,04 + filet 0,5. Le
    doc-comment `:87-97` dit qu'elle n'a **délibérément aucun glyphe de tête** —
    « un glyphe de téléphone a déjà fait passer des avis d'arrivée pour des
    appels ».
  - `BubbleJoinNoticeView` (`:175-321`) + `JoinNoticePresentation` (`:159-173`)
    + `JoinNoticeRulesStrip` (`:327-363`) — nom, `@username` (omis s'il répète
    le nom, `:168-169`), badge « sans compte » violet pour un anonyme
    (`:227-239`), et une bande de trois glyphes de droits d'entrée
    (`bubble.left.fill` / `paperclip` / `photo.fill`, `:332-352`). Rayon **14
    avec ligne de détail, 18 sinon** (`:264`) — la seule notice à ne pas être
    une capsule. Ouverture du profil par **double tap** aussi (`:272-280`), avec
    une action VoiceOver « Voir la fiche » qui la compense (`:287-303`).

  **Il n'existe AUCUNE vue dédiée « départ », « titre changé » ou « chiffrement
  activé »** : ces événements, si la passerelle les émet, retombent tous sur
  `BubbleSystemNoticeView`, qui rend le `content` localisé par le serveur tel
  quel (`:96-97`).

  **Tout cela est absent du web** : un message supprimé n'y rend rien de
  particulier, `deletedAt` n'étant lu nulle part dans `bubble.tsx`, et
  `messageSource === 'system'` n'y est jamais testé.

### 3.10 Le pied

`BubbleBodyFooterLayout` (`BubbleBodyFooterLayout.swift:11-23`) n'est pas un
« pied qui coule dans la dernière ligne » : c'est un `Layout` qui empile corps
puis pied, **en imposant au pied la largeur RÉSOLUE du corps**. La raison est
écrite au site d'appel (BSL:1131-1138) : le pied porte un `Spacer` terminal ;
dans un `VStack` ordinaire ce `Spacer` étire la bulle jusqu'à ses 70 %, et un
`.fixedSize` le comprimerait au point de coller la coche aux drapeaux. La
mesure : `width = max(bodyProbe.width, footerFloor)` (`:89`), hauteur
`bodyHeight + spacing + footerHeight` (`:101`), avec un cache borné à 3 000
entrées (`:189`) désactivé pour les textes > 512 caractères et ceux portant un
lien (BSL:267-282).

Ordre du pied, de gauche à droite (`BubbleFooter.swift:142-202`) :

1. **le bouton translate**, TOUJOURS EN PREMIER et rendu dès que
   `onTranslate != nil`, même sans aucune traduction (`:156-161`) —
   `MeeshyColors.indigo400`, `.caption2.weight(.medium)`. Le doc-comment
   `:144-151` dit pourquoi : quand les drapeaux menaient, l'affordance se
   déplaçait à chaque message.
2. **la bande de drapeaux**, `HStack(spacing: 2)` (`:169`).
3. `Spacer(minLength: 4)` (`:101`).
4. **l'heure**, `.caption.weight(.medium)` (`:181-183`).
5. **la coche**, ou — en échec — un bouton coche + `arrow.clockwise`
   (`:186-197`).

`metaColor` = `isMe ? .white.opacity(0.7) : (isDark ? .white.opacity(0.55) :
.black.opacity(0.5))` (`:284`) ; `readColor` = `indigo400` sombre / `indigo600`
clair, « jamais blanc, jamais gras » (`:287-291`).

Les coches (`BubbleDeliveryCheck.swift:45-85`) : `.invisible` → rien ·
`.sending` → `clock` **débouncé 0,2 s** (`:139, 152-176`, pour qu'un aller-retour
sous 200 ms ne fasse pas clignoter d'horloge) · `.clock` → `clock` à 0,7 ·
`.slow` → `clock` en `warning` · `.sent` → un `checkmark` · `.delivered` →
double check large 16 · `.read` → double check large 17 en `readColor` ·
`.failed` → `exclamationmark.circle.fill` en `error` ; et une **surcharge
hors-ligne** qui remplace tout état en vol par un `hourglass` en `warning`
(`:32-36`). Sept étiquettes VoiceOver distinctes (`:105-126`).

Ce que le pied ne porte PAS : édité, épinglé, transféré, éphémère. « Édité » est
**inline dans le corps**, entre citation et texte (BSL:1064-1066,
`BubbleMetaBadges.swift:27-61`, avec un état « Enregistrement… » animé) ;
épinglé / transféré / éphémère sont des **frères AU-DESSUS** de la bulle, dans
le `VStack(spacing: 4)` de BSL:520 (BSL:522, 535, 548 ;
`BubbleMetaBadges.swift:75-92, 110-135, 150-169`).

**web-v2** — `bubble.tsx:162-207`. L'ordre est le bon : `PrismPastille` (:181),
`Flags` (:189), `<span className="flex-1" />` (:194), `<time>` (:195), `Check`
(:201). Les cotes de texte sont dérivées (`text-time` = `--ios-text-time` = 12 px,
`ios.css:89`). Les coches : `message-blocks.tsx:24-29` — `clock` 10, `check` 10,
`checks` 10, `checks` 11 en `--color-read`. **La correspondance état→glyphe→
taille→couleur est exacte**, y compris le passage de 10 à 11 px sur `read`.

Écarts du pied :

- **La pastille du Prisme se CACHE quand le texte servi est l'original**
  (`message-blocks.tsx:60`, `if (servedLanguage === originalLanguage) return null`).
  iOS l'affiche toujours, comme point d'entrée vers la vue Langue.
- **`.slow`, `.invisible` et la surcharge hors-ligne n'existent pas** :
  `Delivery` ne compte que quatre paliers (`view/message.ts:20`).
- **Aucun débounce de 200 ms** sur `pending`.
- **Aucun marqueur « modifié »**, aucun badge épinglé / transféré / éphémère —
  et pourtant `isEdited`, `effectFlags`, `expiresAt`, `isViewOnce`, `isBlurred`,
  `deletedAt` sont **tous présents** sur le type partagé consommé par web-v2
  (`packages/shared/types/conversation.ts:119-174`). Un balayage de
  `apps/web-v2/src/components` ne trouve aucune lecture de ces champs par
  `bubble.tsx`.
- L'échec, lui, est traité, et bien : la bande de reprise est **DANS la bulle**
  (`bubble.tsx:131-145`), parti explicitement repris d'iOS et défendu en D-16
  (`decisions.md:397-399`).

### 3.11 La bande de drapeaux — trois divergences de règle

**Construction, iOS** — `BubbleContentBuilder.swift:364-395` :

```
all  = [originalLang]                                   (:381)
+ preferredLang    si non vu                            (:383-385)   sans condition de traduction
+ regional         si non vu ET hasTranslation(r)       (:386-388)
+ custom           si non vu ET hasTranslation(c)       (:389-391)
+ deviceLocale     si non vu ET hasTranslation(d)       (:392-394)
return all.filter { $0 != activeLang }                  (:395)
```

`hasTranslation` regarde **le texte ET l'audio traduit** (`:376-379`) — une note
vocale traduite fait donc apparaître son drapeau, même sans traduction de texte.
Le « max 4 » du `CLAUDE.md` (l.280) est **émergent** : cinq emplacements, moins
la langue active retirée en `:395`. Il n'y a aucun `prefix(4)`.

Asymétrie à ne pas rater au portage : la langue **préférée** est ajoutée
**SANS** contrôle de traduction (`:383-385`), alors que régionale, custom et
locale exigent chacune une traduction existante (`:386, 389, 392`). Le drapeau
de la langue préférée est donc parfois celui d'une traduction ABSENTE — et c'est
voulu, puisque le taper déclenche une demande de traduction (`:47-53` du
contrôleur).

La descente du contenu affiché est une autre fonction, `resolveEffectiveContent`
(`BubbleContentBuilder.swift:339-362`), et son ordre est :
langue active = langue d'origine ⇒ `message.content` (`:346`) ; sinon
correspondance exacte dans `translations` (`:349`) ; sinon `preferredTranslation`
**seulement si sa cible est la langue active** (`:352`) ; sinon **l'ORIGINAL**
(`:361`). Le commentaire `:356-360` interdit explicitement de retomber sur la
traduction préférée, « ce qui montrerait un contenu dans une langue que
l'utilisateur n'a pas choisie ». web-v2 obtient la même garantie par un autre
chemin — l'appel au site partagé `resolvePrismTranslation`
(`src/lib/api/prism.ts:52`, `packages/shared/utils/conversation-helpers.ts:284-315`),
dont le `null` signifie « servir l'original » (`prism.ts:58-61`).

Trois conséquences qu'un portage rate facilement :

1. **La langue SERVIE n'a pas de drapeau** — elle est filtrée en `:395`.
2. **Le drapeau souligné n'est pas « ce que je lis », c'est « le panneau
   ouvert »** : `FooterFlag(code:, isActive: $0 == secondaryLangCode)` (BSL:1213).
3. **Un tap sur un drapeau a TROIS issues**, décidées par
   `BubbleLanguageFlagController.handleTap` (`:36-69`), fonction pure rendant un
   `Outcome` : pas de contenu ⇒ `.requestTranslation(targetLang:)` (`:47-53`) ;
   langue d'origine ⇒ `.switchPrimary`, le corps bascule sur l'original et le
   panneau se ferme (`:55-61`) ; sinon bascule du panneau secondaire inline
   (`:63-68`). L'appel unique est BSL:1564, avec haptique et
   `.spring(response: 0.3, dampingFraction: 0.8)` (BSL:1572-1583).

**Il n'y a AUCUN appui long sur un drapeau** (`LanguageFlagChip.swift:109-136`,
`BubbleFooter.swift:246-250`) : l'appui long tombe sur le conteneur de bulle et
ouvre le menu d'actions. Le `CLAUDE.md` iOS l.283 parle bien de l'appui long
sur le MESSAGE, pas sur le drapeau.

Le chip lui-même (`LanguageFlagChip.swift`) : cible **22 pt en contexte
`.compact`** (`:94`), assumée (`:68-71` : « l'élargir grandirait CHAQUE bulle
traduite »), soulignement `10 × 1,5` (`:101-102`) en
`LanguageDisplay.colorHex(for:)`, `scaleEffect(1.05)` et police `.caption` vs
`.caption2` quand actif (`:82, 117`), animation `.easeInOut(0.2)` (`:124`).

**Le panneau secondaire** — `BubbleSecondaryContent.swift` : un séparateur
« filet · point · filet » à 40 %/plein (`:31-34`), un en-tête drapeau + nom de
langue en `.caption2.weight(.semibold)` teinté langue (`:39-43`), le corps rendu
par `MessageTextRenderer` à 13 pt (`:46-55`), fond `langColor.opacity(0.12)`
(`:60`), transition `.opacity + .move(edge: .top)` (`:62`).

**web-v2** — `message-blocks.tsx:130-186` pour `Flags`, `:189-216` pour
`SecondaryText`, `bubble.tsx:82` pour la liste.

Ce qui est conforme : le cap à 4 (`:148`, `slice(0, 4)`), le dessin 22 px
(`:167`), le soulignement `10 × 1,5` (`:174-179`), la couleur par langue, la
bascule du panneau, le panneau lui-même (séparateur, en-tête, fond 12 %,
`lang=` sur le texte), et l'extension de la zone tactile **sans grandir le
dessin** (`app.css:322-330`, `tap-target-22`, débord vertical plein −11 px et
horizontal borné à −2 px pour ne jamais voler le clic du voisin — un raffinement
qu'iOS n'a pas et dont le raisonnement est meilleur que le sien).

Ce qui diverge :

| règle | iOS | web-v2 |
|---|---|---|
| composition | original → préférée → régionale → custom → locale, les 3 derniers **gated sur une traduction existante** (`BubbleContentBuilder.swift:386-394`) | `[originalLanguage, ...toutes les traductions]` (`bubble.tsx:82`) — l'ordre du PRISME n'est pas respecté |
| langue servie | **retirée** de la bande (`:395`) | **présente** ; on peut cliquer le drapeau de ce qu'on lit déjà |
| audio traduit | compte comme traduction (`:376-379`) | ignoré |
| drapeau sans contenu | déclenche une **demande de traduction** (`BubbleLanguageFlagController.swift:47-53`) | impossible (la liste est construite depuis les traductions existantes) |
| tap sur l'original | **bascule le corps** sur l'original (`:55-61`) | ouvre le panneau secondaire comme n'importe quelle autre langue (`bubble.tsx:86-88, 192`) |
| voile | — | la rangée plate refuse les drapeaux sur un message voilé (`reading-mode/meta.ts:31`, « jamais de drapeau en clair sur un message VOILÉ ») ; **la bulle, elle, ne le fait pas** |
| un jeu par suite | — | la rangée plate ne monte les drapeaux que sur `isLastInGroup` (`meta.ts:31`, #3919) ; **la bulle les monte sur chaque message** |

Les deux dernières lignes méritent d'être lues ensemble : `mountsBottomLine`
porte deux gardes **nommées et documentées** (`meta.ts:12-21`), et la peau
bulle — plus ancienne — ne les a jamais reçues. C'est une jumelle divergente à
l'intérieur même de web-v2.

### 3.12 Les réactions

**iOS** — `BubbleReactionsOverlay.swift`, monté en overlay du ZStack de contenu
(BSL:612-624) :

- ancrage `isMe ? .bottomLeading : .bottomTrailing` — **la bande s'échappe vers
  le CENTRE de la conversation, jamais vers le bord d'écran** (BSL:604-611) ;
- `.padding(isMe ? .leading : .trailing, -4)` (BSL:621) et `.offset(y: 8)`
  (BSL:622) : à moitié sous la bulle, à moitié dehors ;
- montée seulement si `hasReactions || (!isMe && isLastReceivedMessage)`
  (`:22-24`) — le bouton « + » de réaction rapide n'apparaît que sur le dernier
  message REÇU ;
- `maxVisible = 4` (`:15`), puis une pastille `+N` qui ouvre le détail (`:141-162`) ;
- **le compte est caché quand il vaut 1** (`:170`) ;
- « ma » réaction : remplissage accent 0,65/0,50, contour accent 0,95/0,80 à
  **2,5 pt** au lieu de 0,5, ombre accent 0,40 rayon 5 (`:189-199, 216`) ;
- hauteur 22, `Capsule()`, tap = bascule + haptique, appui long 0,4 s = détail
  (`:180-181, 211, 219-226`) ;
- animation d'entrée « comète » : échelle 2,6 → 1, chute −18, oscillation
  ±9°/±3 pt sur trois périodes, ressort `(0.32, 0.55)` puis phase 3 à +0,18 s
  (`:282-340`), inhibée sous Reduce Motion en gardant l'haptique (`:314-318`) ;
- l'ordre est **stable** : `summarizeReactions` groupe par emoji et trie par
  `firstSeen` croissant avec départage sur la chaîne emoji
  (`BubbleContentBuilder.swift:427-433`), pour que les pastilles ne dansent pas
  quand le socket renvoie l'ordre inverse ;
- **l'espacement bas de la rangée en tient compte** : `bottomSpacing` vaut
  `31 : 6` en fin de suite et `32 : 2` au milieu, selon qu'une bande déborde ou
  non (BSL:223-236).

**web-v2** — `bubble.tsx:210-222` + `message-blocks.tsx:100-113`. Le
positionnement est juste (`isMine ? 'left-0 -translate-x-1' : 'right-0
translate-x-1'`, `bottom: -8`) et le commentaire explique la même intention.
`reactionEntries` lit `reactionSummary` (`{emoji: n}`), forme dénormalisée du
serveur (`message-blocks.tsx:93-97`).

Divergences : **aucune réserve d'espace** — `marginBottom` vaut `tail ? 6 : 2`
(`bubble.tsx:101`) quelle que soit la présence de réactions, là où iOS passe à
31/32 ; sur un fil dense, une pastille en débord de −8 px recouvrira la bulle
suivante. Ensuite : pas de cap à 4 ni de `+N`, le compte est affiché **même à 1**,
« ma » réaction n'est pas marquée (`reactionEntries` ne rend que `[emoji,
count]`), la pastille n'est pas cliquable (`<span>`, pas `<button>` — donc pas
de bascule), il n'y a pas de bouton « + » sur le dernier reçu, et pas
d'animation d'entrée. L'ordre est celui de `Object.entries`, donc l'ordre
d'insertion de l'objet JSON — stable par accident, pas par loi.

### 3.13 Les états protégés

**iOS.** `shouldBlur = content.isBlurred && !blurController.isRevealed`
(BSL:568). Le contenu est **rendu puis obscurci**, jamais remplacé :
`BlurRevealModifier` applique `.blur(radius: 20)` et un masque
`RoundedRectangle(cornerRadius: 18, style: .continuous).blur(radius: 5)`
(BSL:966-981), le tout monté conditionnellement sur `content.isBlurred` pour
qu'une bulle non floutable ne paie pas la passe hors-écran (BSL:961). Un
capteur transparent couvre la bulle avec son étiquette VoiceOver « Contenu
masqué » et son indice « Toucher pour révéler le contenu » (BSL:579-586). La
révélation passe par `BubbleBlurRevealController.requestReveal`
(BSL:1591-1600) ; pour un message à **vue unique**, elle exige la confirmation
serveur avant de révéler (`BubbleBlurRevealLifecycle.swift:60-64`), dure 5 s par
défaut (`:23`), et se referme sous un voile de brouillard radial
(BSL:1517-1547). Les phases sont `fogIn 0.4 / blurApply 0.4 / fogOut 0.5`
(`:15-17`).

Éphémère : badge `flame.fill` + minuteur monospacé en capsule `error`
(BSL:548-550, `BubbleMetaBadges.swift:150-169`), horloge de RÉCEPTION
(`BubbleEphemeralLifecycle.swift:68`, `Timer.publish(every: 1)`), et disparition
par `opacity 0` + `scaleEffect 0.8` (`ThemedMessageBubble.swift:360-361`) avant
que le dispatch ne rende `EmptyView()` (`:322-323`).

Vue unique consommée ⇒ `kind == .burned` ⇒ `BubbleBurnedView`
(`ThemedMessageBubble.swift:319-320`). Supprimé ⇒ `BubbleDeletedView` (`:317-318`).

**web-v2 : rien de tout cela.** `bubble.tsx` ne lit ni `isBlurred`, ni
`isViewOnce`, ni `expiresAt`, ni `deletedAt`. Un message flouté s'affiche **en
clair**, avec ses drapeaux (§ 3.11). C'est le seul écart de cette analyse qui
touche la dimension 1 (sécurité) plutôt que la dimension 13 (complétude).

---

## 4. Le FIL en mode Bulles

### 4.1 Le regroupement

`MessageDayGrouping.continues` (`MessageDayGrouping.swift:92-100`) — trois
conditions, **et rien d'autre** :

```swift
if earlier.isSystem || later.isSystem { return false }                            // :97
guard !earlier.senderId.isEmpty, earlier.senderId == later.senderId else { ... }  // :98
return calendar.isDate(earlier.createdAt, inSameDayAs: later.createdAt)           // :99
```

**Aucune fenêtre temporelle.** La seule frontière de temps est minuit local. Le
doc-comment (`:60-61`) désigne les deux miroirs :
`apps/web/utils/message-grouping.ts` et
`apps/android/.../MessageGrouping.kt`. `isGroupHead` et `isGroupTail`
(`:62-69`, `:78-85`) sont tous deux définis comme `!continues(...)`,
délibérément (`:73-77`).

En bulles, seul `isLastInGroup` est calculé
(`MessageListViewController.swift:1437-1455`, passé en `:1516`).

**web-v2** — `grouping.ts:23-27` reprend exactement les deux dernières
conditions et l'absence de fenêtre, avec le raisonnement écrit (`:8-14` :
« deux messages du même auteur séparés de six heures dans la même journée
restent groupés »). `place()` (`:47-59`) calcule `head`, `tail` et `opensDay`
en une passe. **Il manque la première condition** : `isSystem`. Un avis
d'arrivée porte l'identifiant de l'arrivant
(`MessageDayGrouping.swift:44-46`), donc le web groupera la première vraie
bulle d'un nouveau venu avec son propre avis d'arrivée — et cette bulle perdra
son avatar et son nom. Le défaut est latent tant que web-v2 n'a pas de messages
système, ce qui est le cas des fixtures.

### 4.2 Espacement et séparateurs

`bottomSpacing` (BSL:223-236) : **2 pt à l'intérieur d'une suite, 6 pt en fin de
suite** (32 / 31 avec une bande de réactions en débord). Le commentaire `:231`
date le passage de 10 à 6 au 2026-08-21.
**web-v2** : `marginBottom: tail ? 6 : 2` (`bubble.tsx:101`) — **conforme**,
sauf la variante « débord de réactions » (§ 3.12).

Les insets de section iOS valent `top 8, leading 12, bottom 8, trailing 12`
(`MessageListViewController.swift:1009-1014`) avec `interGroupSpacing = 0`
(`:1005`). web-v2 : `px-3.5 pt-2 pb-2` sur le `<main>` (`thread.tsx:461`) —
14 px horizontaux au lieu de 12, 8 px verticaux, conforme à 2 px près.

**Séparateurs de date.** iOS insère un `.dayHeader(dayStart:)` **après** chaque
groupe du tableau inversé, ce qui le place visuellement au-dessus
(`MessageListSnapshotPrep.swift:116-128`). Le libellé
(`MessageDayLabel.swift:38-48`) a six paliers :

| écart | iOS | web-v2 (`grouping.ts:61-72`) |
|---|---|---|
| 0 (y compris futur du jour) | « Aujourd'hui » | « Aujourd'hui » ✓ |
| 1 | « Hier » | « Hier » ✓ |
| **2** | **« Avant-hier »** (`:44`) | jour de semaine ✗ |
| 3–6 | jour de semaine, **1ʳᵉ lettre capitalisée** (`:45, 76-82`) | jour de semaine minuscule ✗ |
| 7+ même année | **« Lundi 9 mai »** (jour de semaine inclus, `:46-48, 60-73`) | « 9 mai » ✗ |
| autre année | **« Lundi 19 mai 2025 »** (`:47-48, 68-70`) | « 9 mai » — **sans millésime** ✗ |

Le dernier palier est le plus gênant : un message de l'an dernier et un message
de cette année portent le même libellé. Par ailleurs le web fige la locale à
`'fr-FR'` (`grouping.ts:70, 71, 75`), alors que iOS injecte la locale de
l'appareil et les trois libellés relatifs depuis le catalogue
(`MessageListViewController.swift:1140-1147`) — pour un produit qui sert sept
langues, c'est un écart de dimension 9.

Le dessin de la pastille (`MessageDaySeparator.swift:15-44`) : `.caption`
semibold, `padding(.horizontal, 12)` / `.vertical, 5`, `Capsule` en
`.ultraThinMaterial` + `strokeBorder(lineWidth: 0.5)`, `padding(.vertical, 6)`
autour, encre `indigo200`/`indigo700`, filet `indigo900`/`indigo200`, et un trait
d'accessibilité `.isHeader` (`:32`).
**web-v2** (`thread.tsx:517-530`) : `rounded-chip px-3 py-1 text-time
font-semibold backdrop-blur-md`, filet `0.5px solid var(--color-day-hairline)`,
fond `color-mix(--color-ios-card 70%)`, conteneur `py-1.5`. Encres et filets
sont **dérivés** (`ios.css:107-108, 125-126`). Cotes conformes à 1 px près
(`py-1` = 4 vs 5). **Manque le rôle d'en-tête** — le `<span>` n'a ni
`role="heading"` ni `aria-level`.

**La pastille STICKY n'existe pas côté web.** iOS pose un overlay
`UIHostingController` épinglé à `topInset + 60`
(`MessageDayStickyOverlay.swift:19`, `MessageListViewController.swift:735-738`),
qui rend le **même** `MessageDaySeparator` (`:59`), se masque quand l'en-tête
est déplié ou quand la tête visible est déjà un séparateur
(`MessageListViewController.swift:919-923`), et **n'est jamais escamotée en mode
bulles** (`MessageDayStickyOverlay.swift:42-47`).

### 4.3 Séparateur « nouveaux messages » et saut au non-lu

**Ni l'un ni l'autre n'existe sur iOS.** `MessageListItem` n'a que quatre cas —
`.message`, `.typingIndicator`, `.dayHeader`, `.conversationStart`
(`DiffableTypes.swift:7-28`) — et aucun marqueur de non-lu.
`firstUnreadMessageId` **est calculé**
(`ConversationViewModel+InitialLoad.swift:222-229`) et **n'est lu par personne**
hormis un préchauffage de propriété
(`Services/ConversationFirstRenderWarmup.swift:187`).

L'affordance de non-lu est entièrement portée par **le bouton flottant** :
`ConversationView.swift:1960-1971` le monte en bas à droite quand
`scrollState.isNearBottom == false`, et
`ConversationScrollControlsView.swift:158-160` le fait **changer de forme** —
cercle 44 pt au repos (`:206-209`), capsule dès qu'il y a du non-lu, une coupure
réseau ou une recherche de message cité. Le compte n'apparaît en titre qu'**au
delà de 5 non-lus** (`:311-313`) ; la pile de visages de frappe est plafonnée à
3 (`:97-99`) ; la couleur du contenu est choisie par luminance WCAG, seuil 0,6
(`:150-152`).

Le compteur (`MessageListViewController.swift:67`) ne s'incrémente que si le
message est réellement neuf, que la vue n'est pas près du bas, et que
**l'auteur n'est pas moi** (`:2059-2072`). Il se remet à zéro au retour près du
bas (`:2891-2894`) et dans `scrollToBottom` (`:2517-2520`).

**web-v2 n'a ni séparateur, ni bouton flottant, ni compteur de non-lus dans le
fil.** Le seul compte de non-lus affiché est celui des **autres** conversations,
sur le bouton retour (`thread.tsx:342-351`).

### 4.4 Ancrage bas

iOS **inverse la collection** : `collectionView.transform = CGAffineTransform(scaleX: 1, y: -1)`
(`MessageListViewController.swift:1035`), chaque cellule contre-inversant son
contenu (`:1771, 1122, 1151, 1191`). `contentInsetAdjustmentBehavior = .never`
(`:1031`), `scrollsToTop = false` (`:1039`), les insets sont croisés (le
composeur va dans `contentInset.top`,
`MessageListViewController+Insets.swift:36-42`).

L'auto-défilement au nouveau message exige quatre conditions
(`:2038-2042`) et n'a lieu que si l'on est déjà près du bas **et** qu'aucun
geste n'est en cours (`:2052-2058`), puis se fait **sans animation** (`:2117-2119`).
Le seuil « près du bas » vaut **200 pt** (`:452`). Directive « ROULEAU »
(`:2086-2091`) : aucune animation d'insertion, jamais.

**web-v2** ne peut pas inverser (le virtualiseur `@tanstack/react-virtual` ne le
propose pas) et remplace l'inversion par un **mécanisme d'ancrage** documenté en
D-15 (`decisions.md:335-342`) : `margin-block-start: auto` sur la liste
(`thread.tsx:497`, jamais `justify-content: flex-end`, dont le débordement par
le haut serait injoignable — mesuré, `:450-460`), plus une ré-ancre sur
**20 images** (`:214-219`) désarmée à la première intention de l'utilisateur
(`wheel`, `touchstart`, `keydown`, `:220-222`). C'est un bon mécanisme, et il
répond à la même exigence.

Ce qui manque : le désarmement par geste **n'a pas d'équivalent du seuil de
200 pt** — web-v2 ne suit jamais un nouveau message une fois l'ancre désarmée,
puisqu'il n'y a pas d'auto-défilement sur arrivée (il n'y a pas de temps réel,
#5493).

Le virtualiseur : `estimateSize: () => 88`, `overscan: 6`, `measureElement`
(`thread.tsx:183-186`). iOS estime **80** pour une rangée bulle
(`MessageListViewController.swift:417`) et **apprend** la valeur — médiane des
hauteurs visibles, minimum 6 échantillons, seuil d'adoption 12, borné à
`[32, 240]` (`MessageListLayout.swift:111-141`). Le web a l'estimation, pas
l'apprentissage.

### 4.5 Indicateur de frappe

iOS en fait une **vraie cellule**, préfixée en index 0 du tableau (donc en bas
de la liste inversée) : `MessageListViewController.swift:1888-1889`, type
`.typingIndicator` (`DiffableTypes.swift:9-12` : « Pas un overlay : un message
reçu en direct s'insère au-dessus d'elle »). Son apparition déclenche
l'auto-défilement (`:2052`). En mode bulles la variante est la **capsule** :
`HStack(spacing: 6)`, avatar 18 pt, libellé
`MeeshyFont.relative(12, weight: .medium)` en accent 0,85/0,7, trois points de
5 pt en `easeInOut(0.5).repeatForever` décalés de 0,18 s, `padding(.horizontal,
12)/.vertical, 8)`, `Capsule` remplie blanc 0,07 / noir 0,05 avec un contour
accent 0,25/0,18 (`:3129-3153, 3093-3115`). Les libellés distinguent 1, 2 et 3+
personnes (`:3063-3070`).

**web-v2** — `thread.tsx:574-602` : hors du `<ol>`, en fin de `<main>`. Avatar
18 (`--ios-avatar-typing`), trois points de 5 px, délai `i * 0.18` s, capsule
`rounded-chip px-3 py-2`. Les cotes sont **exactes**. Deux écarts : le libellé
est **codé en dur** (`Amina écrit`, `:585`) et l'indicateur est
**inconditionnel** (`const [typing] = useState(true)`, `:57`) — donc un
indicateur qui ment en permanence, sur une conversation où personne n'écrit.

### 4.6 Pagination

iOS charge la page suivante dès que la distance au bas descend sous **quatre
hauteurs d'écran** (`MessageListViewController.swift:2906`), avec un
debounce de 0,3 s côté ViewModel
(`ConversationViewModel.swift:469`) et une page de 50
(`ConversationViewModel+InitialLoad.swift:403`). **Il n'y a aucun spinner
haut** : `ConversationLoadingPhase.isBlockingSpinnerNeeded` ne vaut vrai que
pour `loadingInitial` (`Models/ConversationLoadingPhase.swift:59`) ; le seul
écran bloquant est le squelette de démarrage à froid — six
`SkeletonMessageBubble` (`ConversationView.swift:1369-1382`). La stabilité de
position est obtenue par un **verrou de scène** qui annule tout déplacement
d'offset non provoqué par l'utilisateur
(`MessageListViewController.swift:2144-2158, 2859-2865`).

**web-v2 : aucune pagination.** `messagesOf(id)` rend la totalité de la fixture
(`thread.tsx:56`).

---

## 5. Les états

| état | iOS | web-v2 |
|---|---|---|
| **chargement à froid** | squelette de 6 bulles, `VStack(spacing: 12)`, `padding(.top, 96)` (`ConversationView.swift:1369-1382`), gated `isBlockingSpinnerNeeded && messages.isEmpty` (`:1395-1406`) | **absent** — les fixtures sont synchrones |
| **vide** | pas d'état vide dédié (fin d'historique ⇒ bloc de notice E2E, `ConversationView.swift:631-654`) | **présent et meilleur** : « Aucun message pour l'instant » + sous-titre (`thread.tsx:473-490`), gaté par `check-thread-states.mjs:95-102`, motivé en D-16 (`decisions.md:368-374`) |
| **erreur** | phases de `ConversationLoadingPhase` | absent |
| **hors ligne** | l'état en vol devient un `hourglass` `warning` sur la coche (`BubbleDeliveryCheck.swift:32-36`) ; le bouton flottant prend la forme capsule `wifi.slash` (`ConversationScrollControlsView.swift:192-199`) | bandeau `role="status"` non bloquant sous l'en-tête (`thread.tsx:432-444`), `useSyncExternalStore` sur `navigator.onLine` ; **pas de sablier sur la coche** |
| **envoi optimiste** | `deliveryStatus == .sending`, horloge débouncée 0,2 s (`BubbleDeliveryCheck.swift:139`) | `localDelivery = 'pending'` posé **hors du domaine**, dans une `Map` à côté de la liste (`thread.tsx:69, 286`), rendu `clock` ; jamais confirmé faute de transport (`decisions.md:392-395`) |
| **échec / renvoi** | coche `exclamationmark.circle.fill` + bouton `arrow.clockwise` dans le pied (`BubbleFooter.swift:186-197`), et une bande de reprise réservant 34 pt (BSL:362, 1163-1169) | bande de reprise **dans la bulle** (`bubble.tsx:131-145`), « Non envoyé / Réessayer » ; hors ligne le message est marqué échoué **immédiatement** (`thread.tsx:286`), et « Réessayer » hors ligne **ne promet rien** (`:322`) — un arbitrage explicitement meilleur que la moyenne, gaté par `check-thread-states.mjs` |
| **supprimé** | `BubbleDeletedView` (`ThemedMessageBubble.swift:317-318`) | **absent** |
| **modifié** | badge inline « modifié », plus un état « Enregistrement… » animé (`BubbleMetaBadges.swift:27-61`) | **absent** |
| **traduction en cours** | shimmer de transcription (`AudioPlayerView+Transcription.swift:223-252`) ; le drapeau sans contenu déclenche une demande (`BubbleLanguageFlagController.swift:47-53`) | **absent** |
| **audio en lecture** | barres jouées à l'accent plein, timecode, chip de vitesse, karaoké actif (`AudioPlayerView.swift:1472-1673`) | **absent** (booléen local sans son) |

---

## 6. Les gestes

| geste | iOS | web-v2 |
|---|---|---|
| **tap drapeau** | 3 issues (§ 3.11), haptique, ressort `(0.3, 0.8)` | bascule du panneau seul (`bubble.tsx:192`) |
| **tap pastille translate** | ouvre la vue Langue du `MessageMoreSheet` (BSL:1229) | bascule le panneau de l'original (`message-blocks.tsx:57`) |
| **tap média** | plein écran, ou carrousel inline sur une tuile `+N` (`+Media:569-580`) ; vidéo par `simultaneousGesture` car le lecteur possède la couche tactile (`:483-491`) | aucun |
| **tap audio** | lecture, routée par le coordinateur (`AudioPlayerView.swift:1291-1298`) | booléen local |
| **tap lien** | `MessageTextRenderer` produit des liens réels | aucun lien détecté |
| **tap citation** | saut au message cité + flash (`MessageListViewController.swift:2610-2652, 2778-2801`) | `scrollToIndex({align:'center'})` + anneau 1,6 s (`thread.tsx:174-181`) — **présent, et honnête** |
| **appui long** | < iOS 26 : `LongPressGesture(minimumDuration: 0.35, maximumDistance: 6)` (`MessageListView.swift:348`) ; ≥ iOS 26 : `.contextMenu` natif (`:364-379`). Repositionnement préalable si la bulle est sous 60 % de la hauteur (`ConversationView+LongPressMenu.swift:14, 66`), délai 0,3 s (`:19`) | **absent** |
| — barre de réactions | 20 emojis (`MessageOverlayMenu.swift:99-104`), classés par usage puis rang canonique (`:1393-1428`), **au-dessus** de la bulle (`:250, 284`), largeur 280 (`:513`) | absent |
| — bulle élevée | une **vraie** `ThemedMessageBubble` rejouée (`:414-433`), **jamais agrandie** — seulement réduite, plancher 0,55 (`:243-246`) puis 0,4 (`:273-275`) ; la rangée vive disparaît en `opacity(0)` sur 0,016 s (`MessageListView.swift:167-168`) | absent |
| — fond | **pas de flou** : noir 0,5/0,4 + `RadialGradient` accent en `.screen`/`.multiply` (`:523-549`), pour ne pas empiler un flou sur le `glassEffect` iOS 26 | absent |
| — liste d'actions | ordre fixe `callDetail?, edit?, select, translate?, copy?, saveMedia?, compose?, more` (`MessageActionResolver.swift:253-274`) ; largeur 240, rayon 22, rangées 44 pt `@ScaledMetric` (`MessageActionsMenu.swift:18, 36, 44`), **sous** la bulle (`MessageOverlayMenu.swift:384-387`) | absent |
| — swipe-up « Plus… » | `openMoreThreshold = -80`, ou vitesse prédite ≤ −160 (`MessageOverlayDragLaw.swift:24, 27, 34-36`) | absent |
| — swipe-down fermeture | `dismissThreshold = +80`, ou ≥ +160 (`:25, 37-39`) ; élastique 0,3 au-delà (`:29, 43-51`) ; haptique d'armement **une fois par geste** (`MessageOverlayMenu.swift:561-565`) | absent |
| **swipe pour répondre** | `BubbleSwipeContainer` (`MessageListView.swift:32`) : distance minimale **22** (48 en zone résistante), dominance horizontale 3:1 (4:1) (`BubbleSwipeResistance.swift:10-16`), zone 72, élastique 15 % au-delà, **validation à 66** (`MessageListView.swift:298-321`), haptique légère au franchissement puis `success()` à la validation (`:308-326`), indicateur derrière la bulle : horodatage deux lignes sous 66, flèche 22 pt au-delà (`:224-262`). En rangée plate, **répondre est toujours vers la DROITE** (`BubbleSwipeResistance.swift:38-40`) | **absent** (le README le liste dans « ce que le POC ne fait pas », `:132-134`) |
| **double tap** | ouvre la barre de réaction rapide, `QuickReactionGesture.acceptsDoubleTap` vrai pour `.standard` seulement (`ThemedMessageBubble.swift:53-73, 345-347`) ; seconde surface par image (`+Media:369-372`) | absent |
| **effets d'apparition** | `.messageEffects(message.effects)` posé sur le ZStack de contenu (BSL:602) — **jamais sur la rangée**, sinon « le liseré arc-en-ciel encadrait du vide » (`ThemedMessageBubble.swift:348-359`) | absent |

**La loi des effets** (`apps/ios/CLAUDE.md:343-368`) mérite d'être citée telle
quelle, parce qu'elle prescrit déjà le web :

- 13 drapeaux sur trois axes — cycle de vie (bits 0-2), apparition one-shot
  (bits 8-13 : `shake zoom explode confetti fireworks waoo`), persistants
  (bits 16-19 : `glow pulse rainbow sparkle`) —
  `packages/shared/types/message-effect-flags.ts:4-21`.
- **Règle 1** (l.360) : « Un effet d'apparition joue une fois PAR AFFICHAGE À
  L'ÉCRAN, pas une fois par message. […] Il n'existe donc **aucune mémoire de
  lecture** — ni store, ni Set, ni booléen persisté. »
- **Règle 3** (l.362) nomme le mécanisme web : « le web, dont une animation CSS
  ne rejoue qu'au montage, réarme via `IntersectionObserver` + retrait/repose
  des classes à la frame suivante — jamais en remontant `children`, ce qui
  réinitialiserait le DOM de la bulle. »
- **Règle 6** : sous `reduceMotion`, aucune apparition ne joue, `glow` et
  `rainbow` deviennent FIXES, `pulse` et `sparkle` sont retirés
  (`MessageEffects.swift:120, 130-139`).
- **Règle 7** : `plan.isEmpty` court-circuite tout wrapper
  (`MessageEffectModifiers.swift:629-630`).

Le jumeau TypeScript déclaré (`resolveMessageEffectPlan()`) vit dans
**`apps/web/lib/message-effects.ts`** (106 lignes) — c'est-à-dire dans le
LEGACY, pas dans `packages/shared`. Un portage v3.1 devra le remonter dans
`shared` plutôt que d'en écrire un troisième.

---

## 7. Accessibilité

**iOS compose la bulle en UN SEUL élément.** BSL:650-652 :

```swift
.accessibilityElement(children: .combine)
.accessibilityLabel(messageAccessibilityLabel)
.accessibilityActions { quotedZoneAccessibilityActions }
```

`messageAccessibilityLabel` (BSL:462-510) joint par `", "`, dans cet ordre :
nom de l'expéditeur (ou « expéditeur inconnu ») · libellé de la citation ·
texte brut · nombre d'images puis de vidéos · nombre d'audios · lieu et
fichiers (via la fonction pure et testable `nonMediaAccessibilityParts`,
BSL:438-460) · heure · statut de remise si `isMe` · « modifié » · « épinglé » ·
« éphémère » · réactions sous forme `"emoji compte"`.

Parce que `.combine` + `.accessibilityLabel` **remplacent** les libellés des
enfants, iOS rend explicitement les deux capacités de la zone citée sous forme
d'**actions nommées**, et seulement si elles sont ARMÉES (BSL:404-436) :
« Affiche le profil de l'auteur cité », « Ouvrir le média cité ». Le
raisonnement est écrit : « une action nommée qui ne déclenche rien serait un
contrôle qui ment (loi 4 du dépôt), pire ici puisque le rotor la RÉCITE ».

Au niveau de la RANGÉE, trois actions nommées de plus compensent des gestes
invisibles au lecteur d'écran (`MessageListView.swift:157-159`) : répondre,
transférer, appui long.

Autres traits : voile flouté (« Contenu masqué » + indice, BSL:582-584),
séparateur de jour `.isHeader` (`MessageDaySeparator.swift:32`), overlay
`.isModal` + `.escape` (`MessageOverlayMenu.swift:469-470`), chips de langue
avec libellé « Afficher en <langue native> » et valeur « Affichée »
(`LanguageFlagChip.swift:198-257`), `.isSelected`.

Cibles : le plancher est 44 (`Accessibility.swift:122`,
`meeshyTapTarget(_ minSize: CGFloat = 44)`), avec deux exceptions **assumées et
documentées** — le chip de langue à 22 (`LanguageFlagChip.swift:68-71, 94`) et
les pastilles de réaction à 22, le bouton « + » compensant par une surface de
frappe 40×40 repliée à 22 de hauteur de layout
(`BubbleReactionsOverlay.swift:113-134`).

Dynamic Type : **`MeeshyFont.relative(_:weight:)` n'est pas une taille en
points** — elle projette la cote héritée sur le style de texte relatif le plus
proche, donc tout ce qui l'emploie suit le réglage système
(`packages/MeeshySDK/Sources/MeeshyUI/Theme/Accessibility.swift:157-163`). La
règle est gardée par `MeeshyTests/Unit/Guards/FixedFontSizeGuardTests.swift` ;
les mesures de l'overlay passent par `UIFontMetrics.default.scaledValue(for: 44)`
(`MessageActionsMenu.swift:84-94`), et le budget de troncature d'une citation
est lui-même fonction du `DynamicTypeSize`
(`QuotedReplyPresentation+DynamicType.swift:28-43`).

**web-v2 n'a aucun équivalent.** Toutes les cotes de texte sont des jetons en
**pixels** (`--ios-font-body: 15px`, `--ios-text-time: 12px`,
`packages/design-tokens/ios.css:75-89`), donc insensibles au réglage de taille
de police du navigateur (qui n'agit que sur `rem`/`em`). `html` pose
`-webkit-text-size-adjust: 100%` (`app.css:147`), ce qui coupe en plus
l'ajustement automatique de WebKit. Sur une coque Capacitor, le réglage
d'accessibilité du système n'aura donc **aucun effet** sur le fil — c'est un
écart de dimension 5 qui ne se voit sur aucune capture.

**web-v2.** La bulle n'est **pas** un élément composé : c'est un `<li>` sans
libellé, contenant jusqu'à huit nœuds atteignables (bouton de citation, tuile
`role="img"`, bouton de reprise, `<p>`, panneau secondaire, avatar `role="img"`,
pastille, jusqu'à quatre drapeaux, `<time>`, glyphe de coche). Un lecteur
d'écran parcourt donc ~8 arrêts par message là où iOS en a 1.

Ce qui est bien fait : `aria-pressed` sur la pastille et les drapeaux
(`message-blocks.tsx:66, 155`), `aria-label` explicite et **conditionnel** sur
la pastille (`:67-71`), `aria-label` de navigation sur la citation (`:241`),
`title` par langue (`:168`), texte hors écran pour le compte de réactions
(`:108-110`), `lang` sur tout texte servi dans une autre langue (`bubble.tsx:153`,
`message-blocks.tsx:208`), `dateTime` ISO sur `<time>` (`bubble.tsx:197`),
`STATUS_LABEL` porté en `title` du glyphe de coche (`:123`), zones tactiles
étendues sans grandir le dessin (`app.css:322-339`), et
`prefers-reduced-motion` coupant toute animation (`app.css:190-199`).

Ce qui manque : le libellé composé, la liste `<ol>` sans nom accessible, aucun
`aria-live`/`role="log"` pour un message entrant, le séparateur de jour sans
rôle d'en-tête, l'ordre de lecture qui place le PIED (avatar, nom) **après** le
texte alors que le nom de l'expéditeur devrait ouvrir l'énoncé, et aucune
action nommée compensant un geste absent — mais les gestes eux-mêmes étant
absents, ce dernier point est cohérent.

---

## 8. Tableau de conformité

| élément | iOS (fichier:ligne) | web-v2 (fichier:ligne) | verdict |
|---|---|---|---|
| loi de choix du mode | `ReadingModeOrchestrator.swift:288-318` | `decision.ts:89-122` (consomme `@meeshy/shared`) | **conforme** |
| règle de rendu `bulles` | `ReadingModeController.swift:120-127` | `decision.ts:106-108` | **conforme** |
| branche drapeau OFF ⇒ bulles | `ReadingModeOrchestrator.swift:291-293` | `decision.ts:65, 127, 130-132` (D-20) | **conforme depuis le 2026-09-08** |
| drapeau prioritaire sur le choix collant | `ReadingModeOrchestrator.swift:288-300` | `decision.ts:130-132` | **conforme** |
| drapeau ÉTEINT par défaut | `MeeshyFeatureFlags.swift:22-30` | `config.ts:90` (`!== 'off'` ⇒ allumé) | **divergent (assumé D-7)** |
| granularité du drapeau | env → `UserDefaults` → préférence bêta (`LentilleFeatureFlag.swift:119-128`) | `vite build` (`config.ts:85-90`) | **divergent** |
| puce, geste primaire | tap = cycle, `ConversationView.swift:2420-2429` | clic = menu, `reading-mode-chip.tsx:9-15` | **divergent (assumé)** |
| puce masquée drapeau OFF | `ConversationView.swift:2405-2407` | `thread.tsx:377` | **conforme depuis le 2026-09-08** |
| persistance `(lecteur, conv)` | `ReadingModePreferenceStore.swift:69-74` | `store.ts:35-36` (scope figé `'local'`) | **divergent** (multi-comptes non scopé) |
| alignement envoyé/reçu | BSL:518, 520, 640, 647 | `bubble.tsx:97, 104, 105` | **conforme** |
| largeur max compacte 70 % | `DeviceLayout.swift:94` | `bubble.tsx:104` | **conforme** |
| largeur max régulière 0,62 / 560 | `DeviceLayout.swift:94-95` | — | **absent** |
| rayon uniforme 18, sans queue | `BubbleBackground.swift:20, 23` ; BSL:1171 | `bubble.tsx:108` → `ios.css:86` | **conforme** |
| absence d'ombre / de dégradé | `BubbleBackground.swift:13-18` ; BSL:1172-1174 | `bubble.tsx:116` (`boxShadow: 'none'` au repos) | **conforme** |
| bulle envoyée = indigo de marque | `BubbleBackground.swift:21`, `MeeshyColors.swift:12, 41` | `bubble.tsx:111` → `ios.css:98` | **conforme** |
| bulle reçue = **blend 30/70 par EXPÉDITEUR** | `ThemedMessageBubble.swift:383-390`, `MessageModels.swift:742` | `bubble.tsx:92` (accent brut, un par conversation) | **divergent** |
| opacités 28/16 et filet 34/26 | `BubbleBackground.swift:21, 25-26` | `ios.css:100-101, 118-119` | **conforme** |
| rembourrage 14 / 10 | BSL:1124-1125 | `bubble.tsx:108` (`px-3.5 py-2.5`) | **conforme** |
| identité au PIED de la DERNIÈRE bulle | BSL:238-240 ; `MessageDayGrouping.swift:71-77` | `bubble.tsx:80, 162-179` | **conforme** |
| avatar 32 pt | `MeeshyAvatar.swift:58` | `bubble.tsx:170` → `ios.css:94` | **conforme** |
| `@username` sous le nom | `BubbleFooter.swift:104-109` | — | **absent** |
| badge de rôle | `BubbleFooter.swift:99, 253-262` | — | **absent** |
| nom tronqué à 16 caractères | `BubbleFooter.swift:96-98` | — | **absent** |
| pied : translate puis drapeaux | `BubbleFooter.swift:156-169` | `bubble.tsx:181-193` | **conforme** |
| pied : heure puis coche | `BubbleFooter.swift:181-197` | `bubble.tsx:195-204` | **conforme** |
| largeur du pied = largeur du corps | `BubbleBodyFooterLayout.swift:73-102` | `flex` + `flex-1` (`bubble.tsx:174, 194`) | **conforme par un autre moyen** |
| 4 paliers de coche, glyphe et taille | `BubbleDeliveryCheck.swift:65-80` | `message-blocks.tsx:24-29` | **conforme** |
| `.slow` / `.invisible` | `BubbleDeliveryCheck.swift:45, 54-64` | — | **absent** |
| sablier hors ligne | `BubbleDeliveryCheck.swift:32-36` | — | **absent** |
| débounce 0,2 s de l'horloge | `BubbleDeliveryCheck.swift:139, 152-176` | — | **absent** |
| pastille translate inconditionnelle | `BubbleFooter.swift:156-157` | `message-blocks.tsx:60` (masquée si non traduit) | **divergent** |
| bande ≤ 4 drapeaux, dédupliqués | `BubbleContentBuilder.swift:381-395` | `bubble.tsx:82` + `message-blocks.tsx:148` | **conforme sur le cap, divergent sur l'ORDRE** |
| langue servie retirée de la bande | `BubbleContentBuilder.swift:395` | — | **divergent** |
| ordre du prisme dans la bande | `BubbleContentBuilder.swift:383-394` | ordre du tableau `translations` | **divergent** |
| tap drapeau original ⇒ bascule du corps | `BubbleLanguageFlagController.swift:55-61` | — | **absent** |
| tap drapeau sans contenu ⇒ demande | `BubbleLanguageFlagController.swift:47-53` | — | **absent** |
| pas de drapeau sur un message VOILÉ | `reading-mode/meta.ts:31` (rangée plate) | `bubble.tsx:189` (inconditionnel) | **absent dans la bulle** |
| un jeu de drapeaux par SUITE | `reading-mode/meta.ts:31` (rangée plate, #3919) | `bubble.tsx:189` (chaque message) | **absent dans la bulle** |
| chip 22 px + soulignement 10×1,5 | `LanguageFlagChip.swift:94, 101-102` | `message-blocks.tsx:167, 174-179` | **conforme** |
| panneau secondaire inline | `BubbleSecondaryContent.swift:31-60` | `message-blocks.tsx:189-216` | **conforme** |
| descente du Prisme | `ReaderPrism.swift:57-63` (aucun repli `fr`) | `prism.ts:52` → `resolvePrismTranslation` (`conversation-helpers.ts:284-315`) | **conforme, site unique partagé** |
| troncature 512 car. + « Voir plus » | `BubbleExpandableText.swift:14, 112, 177-182` | — | **absent** |
| liens / mentions / hashtags / markdown | `MessageTextRenderer.swift:10-14` | — | **absent** |
| grille média 1/2/3/4+ et `+N` | `+Media:54-101, 509-516` | `message-blocks.tsx:307-342` (cas 1 seul) | **divergent** |
| image seule 300×240, rayon 16 | `+Media:63-66` ; BSL:817 | `message-blocks.tsx:320-321` | **conforme (cotes)** |
| image RÉELLEMENT affichée | `CachedAsyncImage.swift:457-504` | aucun `<img>` dans `src/` | **absent** |
| ThumbHash / vignette / anneau de progression | `CachedAsyncImage.swift:457-481` ; `ConversationMediaViews.swift:176-211` | — | **absent** |
| vidéo (poster, durée, play, consommation) | `+Media:455-492, 690-726` ; `MediaConsumptionProgressBar.swift:23-41` | — | **absent** |
| audio jouable | `AudioPlayerView.swift:1291-1298` | `message-blocks.tsx:277` (état local) | **absent** (contrôle sans effet) |
| onde 48/72 barres réelles | `AudioPlayerView.swift:1442` | 22 barres dérivées de l'id (`view/message.ts:81-84`) | **divergent (honnête)** |
| transcription + karaoké | `AudioPlayerView+Transcription.swift:456-520` | — | **absent** |
| piste traduite élue par le texte servi | `AudioTrackLanguageResolver.swift:62-81` | — | **absent** |
| citation : filet 4/rayon 2, carte rayon 12 | `BubbleQuotedReply.swift:489-491, 572` | `message-blocks.tsx:239-249` → `ios.css:88` | **conforme** |
| citation : nom et texte au fil | `BubbleQuotedReply.swift:425-446` | `message-blocks.tsx:250-259` | **conforme** |
| citation : 3 lignes de prévisualisation | `QuotedReplyPresentation.swift:65` ; `BubbleQuotedReply.swift:519` | `line-clamp-2` (`message-blocks.tsx:257`) | **divergent** |
| citation : budget 138→60 signes selon Dynamic Type | `QuotedReplyPresentation+DynamicType.swift:28-43` | — | **absent** |
| citation : avatar 22 / vignette 38 rayon 6 | `BubbleQuotedReply.swift:100, 104, 394-395` | — | **absent** |
| citation : LOI DES ZONES (3 cibles, non armée ⇒ zéro geste) | `BubbleQuotedReply.swift:16-63, 266-269, 305-310` | une seule zone (bouton entier) | **divergent** |
| citation : média protégé ⇒ ni cotes ni vignette | `QuotedReplyPresentation.swift:156, 177` | — | **absent** |
| saut au message cité | `MessageListViewController.swift:2610-2652` | `thread.tsx:174-181` | **conforme** |
| carte de citation de story 132 × 235, rayon 16 | `BubbleStoryCitationCard.swift:66, 69, 71, 106` ; BSL:557-565 | — | **absent** |
| règle de détachement de la citation de story | `BubbleStoryCitationCard.swift:285-293, 316-326` | — | **absent** |
| notice d'appel, 7 variantes, `minHeight: 44` | `BubbleCallNoticeView.swift:286-355, 135` | — | **absent** |
| rappel d'appel par DOUBLE tap (jamais simple) | `BubbleCallNoticeView.swift:87-90, 64-84` | — | **absent** |
| sticker sans chrome, 160 pt | `BubbleSticker.swift:5-8, 38` | — | **absent** |
| tombstone « Message supprimé » (aligné expéditeur) | `BubbleSystemViews.swift:13-48` | — | **absent** |
| « Vu et supprimé » (vue unique consommée) | `BubbleSystemViews.swift:50-85` | — | **absent** |
| notice système centrée, heure gravée en tête | `BubbleSystemViews.swift:98-137` | — | **absent** |
| avis d'arrivée + bande de droits d'entrée | `BubbleSystemViews.swift:175-321, 327-363` | — | **absent** |
| modèle de valeur `BubbleContent` | `BubbleContent.swift:8, 386-411` | `Message` lu directement | **absent** |
| `hasTextOrNonMediaContent` (audio ⇒ faux) | `BubbleContent.swift:336-361` | — | **absent** |
| polices relatives au Dynamic Type | `Accessibility.swift:157-163` | jetons en `px` (`ios.css:75-89`) | **absent** |
| badge « modifié » inline | `BubbleMetaBadges.swift:27-61` ; BSL:1064-1066 | — | **absent** |
| badges épinglé / transféré / éphémère | BSL:522, 535, 548 ; `BubbleMetaBadges.swift:75-169` | — | **absent** |
| flou, vue unique, éphémère | BSL:568, 966-981, 1591-1600 | — | **absent** |
| réactions en débord du coin intérieur | BSL:612-622 | `bubble.tsx:214-217` | **conforme** |
| réserve d'espace 31/32 sous les réactions | BSL:223-236 | `bubble.tsx:101` (6/2 toujours) | **absent** |
| cap 4 + `+N` | `BubbleReactionsOverlay.swift:15, 141-162` | — | **absent** |
| compte caché à 1 | `BubbleReactionsOverlay.swift:170` | `message-blocks.tsx:107` (toujours affiché) | **divergent** |
| « ma » réaction marquée | `BubbleReactionsOverlay.swift:189-199` | — | **absent** |
| pastille cliquable / bouton « + » | `BubbleReactionsOverlay.swift:93-137, 219-226` | `<span>` (`message-blocks.tsx:101`) | **absent** |
| regroupement même auteur + même jour | `MessageDayGrouping.swift:98-99` | `grouping.ts:25-26` | **conforme** |
| absence de fenêtre temporelle | `MessageDayGrouping.swift:92-100` | `grouping.ts:8-14` | **conforme** |
| message SYSTÈME hors suite | `MessageDayGrouping.swift:97` | — | **absent** |
| espacement 2 / 6 | BSL:232-235 | `bubble.tsx:101` | **conforme** |
| libellés « Avant-hier », jour capitalisé, millésime | `MessageDayLabel.swift:44-48, 76-82` | `grouping.ts:68-71` | **divergent** |
| pastille de jour (cotes, encres) | `MessageDaySeparator.swift:19-44` | `thread.tsx:519-528` | **conforme** |
| pastille de jour = en-tête a11y | `MessageDaySeparator.swift:32` | — | **absent** |
| pastille de jour STICKY | `MessageDayStickyOverlay.swift:19, 58` | — | **absent** |
| séparateur « nouveaux messages » | **inexistant sur iOS** (`DiffableTypes.swift:7-28`) | inexistant | **conforme (par absence)** |
| bouton flottant + compteur de non-lus | `ConversationView.swift:1960-1971` ; `ConversationScrollControlsView.swift:158-160` | — | **absent** |
| liste inversée / ancrage bas | `MessageListViewController.swift:1035` | `thread.tsx:497, 214-222` (mécanisme D-15) | **conforme par un autre moyen** |
| auto-défilement à 200 pt du bas | `MessageListViewController.swift:452, 2052-2058` | — | **absent** |
| virtualisation | `UICollectionView` + estimation apprise (`MessageListLayout.swift:111-141`) | `@tanstack/react-virtual`, `estimateSize 88` (`thread.tsx:183`) | **conforme, sans apprentissage** |
| pagination 4 hauteurs d'écran, page 50 | `MessageListViewController.swift:2906` ; `+InitialLoad.swift:403` | — | **absent** |
| indicateur de frappe (cellule, cotes) | `MessageListViewController.swift:1888, 3129-3153` | `thread.tsx:574-602` | **conforme sur les cotes** |
| indicateur de frappe piloté par la donnée | `typingParticipants` (`:1888`) | `useState(true)` en dur (`thread.tsx:57`) | **divergent (mensonger)** |
| appui long ⇒ menu + réactions | `MessageOverlayMenu.swift` ; `MessageOverlayDragLaw.swift:24-29` | — | **absent** |
| swipe pour répondre | `MessageListView.swift:298-326` ; `BubbleSwipeResistance.swift:10-16` | — | **absent** |
| double tap ⇒ réaction rapide | `ThemedMessageBubble.swift:345-347` | — | **absent** |
| effets d'apparition, rejouables | `MessageEffectModifiers.swift:619-662` ; `CLAUDE.md:360-362` | — | **absent** |
| libellé a11y composé | BSL:462-510, 650-652 | — | **absent** |
| actions a11y nommées et armées | BSL:404-436 ; `MessageListView.swift:157-159` | — | **absent** |
| état vide dessiné | — | `thread.tsx:473-490` | **web en avance** |
| bande de reprise dans la bulle | BSL:1163-1169 | `bubble.tsx:131-145` | **conforme** |
| bandeau hors ligne non bloquant | — | `thread.tsx:432-444` | **web en avance** |
| zone tactile étendue sans grandir le dessin | `LanguageFlagChip.swift:68-71` (constate le problème) | `app.css:286-339` (le résout, bornage au demi-gap) | **web en avance** |

---

## 9. Écarts à combler, par visibilité

L'ordre est celui de ce qu'un utilisateur voit en ouvrant le fil. La taille est
donnée en petit / moyen / grand.

1. **Les images ne s'affichent pas.**
   Swift : `BubbleStandardLayout+Media.swift:54-101` (grille) et
   `packages/MeeshySDK/Sources/MeeshyUI/Primitives/CachedAsyncImage.swift:457-504`
   (échelle ThumbHash → vignette → complet).
   Web : `apps/web-v2/src/components/message-blocks.tsx:313-327`.
   Témoin : étendre `scripts/check-reading-mode.mjs` avec un cas bulles qui
   compte les `main li img` sur une fixture portant un `fileUrl` servi par le
   serveur local du gate. **Grand** (grille 1/2/3/4+, `+N`, ThumbHash, politique
   de téléchargement, anneau de progression).

2. **L'audio ne joue pas** — bouton présent, sans effet, donc « absent » par la
   loi 4.
   Swift : `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift:1291-1298`
   (routage du tap), `:1442` (48/72 barres), `AudioTrackLanguageResolver.swift:62-81`
   (piste élue par le prisme).
   Web : `message-blocks.tsx:265-305`.
   Témoin : un gate navigateur qui clique le bouton et vérifie
   `document.querySelector('audio').paused === false`. **Grand.**

3. **Aucun geste sur une bulle** — ni appui long, ni swipe pour répondre, ni
   double tap. C'est la surface d'interaction entière du fil.
   Swift : `Components/MessageOverlayMenu.swift`, `Components/MessageOverlayDragLaw.swift:24-29`,
   `Views/MessageListView.swift:298-326`, `Views/BubbleSwipeResistance.swift:10-16`,
   `ThemedMessageBubble.swift:345-347`.
   Web : `bubble.tsx` (aucun `onPointerDown`, aucun `onContextMenu`).
   Témoin : `check-reading-mode.mjs` ouvrant le menu au clavier **et** au
   pointeur, puis vérifiant l'ordre des actions de `MessageActionResolver`.
   **Grand** — et à cadrer d'abord côté produit : le web n'a pas de vocabulaire
   de glissement horizontal sûr (le même arbitrage que D-17 pour la liste).

4. **La bulle reçue est de la mauvaise teinte, et identique pour tous les
   expéditeurs d'un groupe.**
   Swift : `ThemedMessageBubble.swift:383-390`,
   `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift:742`,
   `packages/MeeshySDK/Sources/MeeshySDK/Theme/ColorGeneration.swift:234-290`.
   Web : `bubble.tsx:92-93` ; `src/lib/accent.ts:26-30`.
   Témoin : un test unitaire comparant
   `blendTwo(colorForName(nom), 0.30, '6366F1', 0.70)` — porté depuis
   `packages/shared/utils/conversation-colors.ts`, qui contient déjà `blendColors`
   avec la troncature exacte (`:234-279`) — au hex passé à `--accent-bubble`.
   **Moyen** (la primitive de blend existe déjà en TS partagé ; il manque
   `blendTwo`, `colorForName` et le câblage par message).

5. **Le pied ment sur la protection et sur le regroupement des drapeaux.** La
   bulle affiche les drapeaux sur CHAQUE message et même sur un message voilé,
   alors que la rangée plate du même dépôt applique les deux gardes.
   Swift : `BubbleContentBuilder.swift:381-395` (composition), `Focal/Row/FocalMetaColumn.swift:62-68`
   (les deux gardes).
   Web : `src/lib/reading-mode/meta.ts:25-33` (la loi, déjà écrite et testée) et
   `bubble.tsx:189` (qui ne l'appelle pas).
   Témoin : `meta.test.ts` étendu, plus une assertion DOM du gate sur une
   fixture `isBlurred: true`.
   **Petit** — la loi existe, il suffit de la brancher.

6. **La bande de drapeaux ne suit pas l'ordre du Prisme et n'exclut pas la
   langue servie.**
   Swift : `BubbleContentBuilder.swift:381-395`.
   Web : `bubble.tsx:82`.
   Témoin : un test de rang — prisme `['fr','en']`, message anglais, traduction
   française : la bande ne doit PAS montrer `fr`, et doit montrer `en` en tête.
   C'est exactement la leçon 261 (« un témoin de rang s'écrit sur un rang autre
   que le premier »). **Petit.**

7. **Les états protégés ne sont pas rendus** — flouté, vue unique, éphémère,
   supprimé.
   Swift : BSL:568, 966-981, 1591-1600 ;
   `BubbleBlurRevealLifecycle.swift:15-23, 60-64` ;
   `ThemedMessageBubble.swift:317-323` ; `BubbleMetaBadges.swift:150-169`.
   Web : `bubble.tsx` (aucune lecture de `isBlurred`/`isViewOnce`/`expiresAt`/`deletedAt`).
   Témoin : fixtures portant les quatre états + assertions DOM (filtre de flou
   présent, texte non sélectionnable, minuteur décroissant).
   **Moyen** — et à traiter **avant** tout branchement de vraies données : servir
   en clair un message que le serveur a marqué flouté est un défaut de
   dimension 1, pas de dimension 13.

8. **Les réactions sont décoratives** : compte affiché à 1, pas de cap ni de
   `+N`, « ma » réaction non marquée, pastille non cliquable, aucune réserve
   d'espace (donc recouvrement de la bulle suivante).
   Swift : `BubbleReactionsOverlay.swift:15, 170, 189-199, 219-226` ; BSL:223-236.
   Web : `bubble.tsx:101, 210-222` ; `message-blocks.tsx:100-113`.
   Témoin : capture DOM comparant `getBoundingClientRect()` de la pastille et de
   la bulle suivante ; test unitaire de `summarizeReactions` porté en TS.
   **Moyen.**

9. **Le texte long n'est pas tronqué, et rien n'est cliquable dedans.**
   Swift : `BubbleExpandableText.swift:14, 112, 177-182` ;
   `packages/MeeshySDK/Sources/MeeshyUI/Utilities/MessageTextRenderer.swift:7-21`.
   Web : `bubble.tsx:147-156`.
   Témoin : fixture de 3 000 caractères ⇒ « Voir plus » présent ; fixture avec
   `@handle`, `#tag`, une URL et `**gras**` ⇒ quatre nœuds distincts.
   **Moyen** (le rendu de texte enrichi est une brique à écrire une fois pour
   les trois peaux).

10. **La pastille de jour ne colle pas, et son libellé diverge sur trois
    paliers** (« Avant-hier », capitalisation, millésime).
    Swift : `MessageDayLabel.swift:44-48, 76-82` ; `MessageDayStickyOverlay.swift:19, 58`.
    Web : `grouping.ts:61-72` ; `thread.tsx:517-530`.
    Témoin : tests de `dayLabel` sur J-2, J-5, J-400 ; observateur DOM pour la
    pastille collante. **Petit** pour le libellé, **moyen** pour le sticky.

11. **L'indicateur de frappe est câblé en dur à `true`.** Un fil sans personne
    qui écrit affiche « Amina écrit » en permanence — un contrôle qui ment, au
    sens exact de la loi 4.
    Web : `thread.tsx:57, 574-602`.
    Témoin : rendre `typing` dépendant d'une prop, et vérifier son absence sur
    une fixture au repos. **Petit.**

12. **Le message système peut casser une suite.** `continues()` ne connaît pas
    `isSystem`.
    Swift : `MessageDayGrouping.swift:97`, avec son commentaire explicatif `:54-58`.
    Web : `grouping.ts:23-27`.
    Témoin : `grouping.test.ts` avec un avis d'arrivée portant le `senderId` de
    l'arrivant, suivi de son premier message : les deux doivent être des groupes
    distincts. **Petit** — une ligne, un test, et une régression évitée pour
    plus tard.

13. **`QUOTE_RAIL_WIDTH` est dérivé, gardé, et n'atteint aucun pixel.**
    `src/lib/reading-mode/metrics.ts:37` déclare `2.5`, `scripts/check-curve.mjs:178`
    le compare à `FocalMetrics.swift:211` — et **aucun composant ne le lit** : la
    citation dessine `w-1` (4 px, `message-blocks.tsx:244`). Le gate prouve que
    la constante est juste, jamais qu'elle est servie.
    Témoin : un gate de style calculé (`getComputedStyle(...).width`) plutôt
    qu'un gate de texte. **Petit** — et l'enseignement dépasse cette cote : tout
    jeton dérivé devrait être vérifié au pixel, pas au littéral, exactement comme
    `check:tokens-resolved` le fait déjà pour les couleurs.

14. ~~**La branche « drapeau OFF » n'existe pas.**~~ **SOLDÉ le 2026-09-08 par
    le lot D-20**, pendant cette analyse : `VITE_READING_MODES` descend jusque
    dans la loi (`decision.ts:65, 127`), la branche `flag-disabled` prime sur le
    choix collant (`:130-132`), et la puce disparaît quand le drapeau est éteint
    (`thread.tsx:377`). Les témoins existent (`decision.test.ts`,
    garde de construction dans `vite.config.ts`).
    **Ce qui reste** : le DÉFAUT est inversé (iOS naît éteint, le web allumé —
    D-7, assumé), et le drapeau web est figé au déploiement là où iOS le résout
    par utilisateur (`LentilleFeatureFlag.swift:119-128`). **Décision produit**
    dans les deux cas ; il reste à écrire D-20 dans `decisions.md`, qui s'arrête
    encore à D-19 alors que le code et le README la citent.

15. **Aucun libellé d'accessibilité composé, aucune action nommée.**
    Swift : BSL:462-510, 650-652 ; `MessageListView.swift:157-159`.
    Web : `bubble.tsx` (le `<li>` n'a ni `aria-label` ni rôle).
    Témoin : un gate qui compte les arrêts du parcours accessible par message
    (`page.accessibility.snapshot()`), et vérifie que l'énoncé commence par le
    nom de l'expéditeur.
    **Moyen** — et à faire avant les gestes, puisque c'est le libellé composé
    qui rend ensuite les actions nommées lisibles.

16. **Pas de bouton flottant, pas de compteur de non-lus, pas de pagination.**
    Swift : `ConversationView.swift:1960-1971` ;
    `ConversationScrollControlsView.swift:158-160, 311-313` ;
    `MessageListViewController.swift:452, 2059-2072, 2906`.
    Web : absent de `thread.tsx`.
    Témoin : gate de défilement sur une fixture de 500 messages.
    **Moyen**, et dépendant du transport (#5493) pour le compteur.

17. **Le fil ne suit pas le réglage de taille de police** — dernier de la liste
    parce qu'il est le seul écart **invisible sur une capture**, et non parce
    qu'il est le moins grave.
    Swift : `packages/MeeshySDK/Sources/MeeshyUI/Theme/Accessibility.swift:157-163`
    (`MeeshyFont.relative` projette sur un style relatif), avec sa garde
    `MeeshyTests/Unit/Guards/FixedFontSizeGuardTests.swift`.
    Web : `packages/design-tokens/ios.css:75-89` (jetons en `px`) et
    `apps/web-v2/src/styles/app.css:147` (`-webkit-text-size-adjust: 100%`).
    Témoin : un gate qui pose `document.documentElement.style.fontSize = '24px'`
    et vérifie que la hauteur d'une bulle change.
    **Moyen** — la bascule `px → rem` est mécanique, mais elle touche la table
    de jetons, donc `check:tokens` et son générateur.

---

## 10. Ce que la charte du README affirme, et ce que le Swift en dit

Les quatre affirmations de `apps/web-v2/README.md:112-118` ont été vérifiées une
par une contre le Swift.

**1. « Bulle à rayon uniforme 18 px : ni queue, ni coin asymétrique, ni ombre,
ni dégradé — les ombres ont été retirées côté iOS pour la fluidité du
défilement. » → EXACT, dans ses quatre affirmations.**
Rayon 18 uniforme : `BubbleBackground.swift:20, 23` et BSL:1171, sans aucune
variation par position dans la suite. Pas de queue : aucun `Shape`
personnalisé, aucun `UnevenRoundedRectangle` sous `Views/Bubble/`. Pas d'ombre :
zéro `.shadow(` dans `BubbleStandardLayout.swift`, et BSL:1172-1174 assume le
choix. Pas de dégradé : `BubbleBackground.swift:13-18` le motive exactement dans
les termes du README (« 2 passes offscreen par cellule au scroll »). Le seul
raffinement à ajouter à la phrase : le **média** n'a pas le rayon 18 mais 16
(`MeeshyRadius.lg`, BSL:817), parce qu'il est un frère de la bulle, pas son
contenu.

**2. « La bulle envoyée est l'indigo de marque, la même dans toutes les
conversations » → EXACT.**
`BubbleBackground.swift:21` : `isMe ? MeeshyColors.brandPrimary`, sans
paramètre de conversation, sans bordure (`lineWidth: isMe ? 0`).
`MeeshyColors.swift:12, 41, 52` : `indigo500` = `#6366F1`.

**« ; seule la bulle reçue porte l'accent de la conversation » → INEXACT.**
La bulle reçue porte `blend(senderColor ?? accentDeLaConversation × 0,30,
indigo500 × 0,70)` (`ThemedMessageBubble.swift:383-390`), et `senderColor` est
un tirage **par expéditeur** (`MessageModels.swift:742`,
`ColorGeneration.swift:234-237`). Deux erreurs se composent : la teinte est
mêlée à 70 % d'indigo avant d'être servie, et elle n'est l'accent de la
conversation que dans le cas dégradé où le message ne porte pas de couleur
d'expéditeur. La phrase devrait se lire : *« la bulle reçue porte la couleur de
son EXPÉDITEUR, mêlée à 70 % d'indigo de marque ; l'accent de la conversation
n'est que le repli. »*

**3. « L'avatar et le nom vivent DANS le pied de la bulle, et seulement sur le
dernier message d'une suite (jamais le premier), en groupe, en réception. » →
EXACT, dans ses quatre conditions.**
`BubbleStandardLayout.swift:238-240` (`!isDirect && isLastInGroup &&
!content.isMe`), rendu par `BubbleFooter.swift:73-111` à l'intérieur du clip de
la bulle (BSL:1155, 1165, 1171). `MessageDayGrouping.swift:71-77` le redit.
Deux compléments : le paramètre `showAvatar` que le fil transmet est **mort**
(BSL:59, jamais lu) — un portage qui s'y fierait afficherait l'avatar sur chaque
bulle reçue ; et le pied porte aussi `@username` et un badge de rôle que le web
ne rend pas.

**4. « Regroupement : même auteur + même jour, sans fenêtre temporelle. » →
EXACT sur ce qu'il affirme, INCOMPLET sur la loi.**
`MessageDayGrouping.swift:98-99` confirme les deux critères et l'absence de
fenêtre. La loi en a un **troisième**, à `:97` : ni le prédécesseur ni le
successeur ne doit être un message SYSTÈME. Le README dit « la même loi que
iOS » ; c'est vrai à une condition près, et cette condition est celle qui
protège la première bulle d'un nouveau venu.

### Contradictions avec `decisions.md`

- **D-4 (`decisions.md:46-57`) — « le web ne porte aucune valeur iOS écrite à la
  main » — tient pour les COULEURS, pas pour toutes les GÉOMÉTRIES.** Le fond
  de citation (`rounded-quote` → 12 px), le rayon de bulle (18) et l'avatar (32)
  sont bien dérivés. Mais `rounded-card` du média (`message-blocks.tsx:320`)
  résout `--radius-lg` de **`tokens.css`** (`packages/design-tokens/tokens.css:93`),
  la table de la v3 — juste par coïncidence de valeur (16 px, comme
  `MeeshyRadius.lg`), et non par dérivation. D-4 dit que `tokens.css`
  « mourra avec la v3 » ; le jour où il meurt, cette cote-là n'a plus de source.
  De même, les cotes 300 et 240 de la tuile image sont écrites en littéral
  (`message-blocks.tsx:320-321`) là où `+Media:63-66` les porte côté Swift —
  aucun gate ne les compare.

- **D-15 (`decisions.md:308-361`) parle de « cinq cents bulles » comme argument
  de la virtualisation, alors que le mode par défaut est la rangée plate
  (D-7).** Ce n'est pas une contradiction de fond — la virtualisation sert les
  deux peaux, et `check-thread-virtualization.mjs` est écrit sur le comptage de
  cellules, pas sur la peau. Mais l'argumentaire n'a jamais été mesuré **en mode
  bulles**, dont la hauteur de rangée est plus variable (média, citation,
  panneau secondaire) et pour lequel `estimateSize: 88` (`thread.tsx:183`) est
  une constante, non une valeur apprise comme côté iOS
  (`MessageListLayout.swift:111-141`).

- **D-16 (`decisions.md:363-405`) énumère « quatre états dessinés » et les
  qualifie de complets pour le fil.** Ils le sont pour le fil ; ils ne le sont
  pas pour la BULLE, à laquelle il manque : supprimé, modifié, flouté, vue
  unique, éphémère, traduction en cours, et audio en lecture (§ 5). La
  formulation « les états du fil » n'est pas fausse, mais elle a été lue comme
  une clôture de la question des états, et c'est ce qui a laissé les états de
  message hors périmètre.

- **D-20 (`decisions.md:628`, #5672) — écrite pendant cette analyse, et elle
  contient une affirmation que le Swift contredit.** Sa description de ce que
  montre une capture prise drapeaux éteints est : « l'ANCIEN produit (liste en
  cartes `ThemedConversationRow`, **bulle à queue**) ». La première moitié est
  juste — la liste en cartes existe bien
  (`ConversationListView+Rows.swift`, `ThemedConversationRow.swift`). **La
  seconde est fausse : aucune bulle à queue n'existe dans ce dépôt**, drapeaux
  allumés ou éteints, parce que le mode Bulles rend le MÊME
  `BubbleStandardLayout` dans les deux cas (`MessageListViewController.swift:33,
  1559`) et que ce chemin ne connaît qu'un `RoundedRectangle(cornerRadius: 18)`
  (`BubbleBackground.swift:20, 23` ; clip BSL:1171).

  Les trois balayages qui le prouvent :
  1. Les seules conformances à `Shape` de l'app et du SDK sont
     `ConvBgWaveShape`, `DownwardExtendedTapShape`, `ArcShape`,
     `RevealCircleShape`, `RiverBubbleOutline`, `MeeshyDashesShape`,
     `LiquidRevealShape`, `RoundedCorner`, trois `Diamond`/`Triangle` de
     timeline et `CornerHandleShape` — **aucune n'est une queue de bulle**, et
     `RiverBubbleOutline` appartient au mode Rivière
     (`Riviere/View/RiverBubbleView.swift:129`), pas à Bulles.
  2. `RoundedCorner` (`packages/MeeshySDK/Sources/MeeshyUI/Theme/ViewModifiers.swift:317`),
     le seul type capable d'un coin asymétrique, **n'a aucun site d'appel**.
  3. `UnevenRoundedRectangle` n'apparaît que dans `MessageOverlayMenu.swift`,
     `MentionSuggestionPanel.swift` et `RiverBubbleView.swift` — jamais sous
     `Views/Bubble/`.

  L'enjeu n'est pas cosmétique : D-20 est le document qui **définit la cible**
  de la v3.1, et cette parenthèse invite à croire qu'une capture drapeaux
  éteints diffère de la cible sur la forme de la bulle. Elle en diffère sur la
  LISTE et sur le mode par défaut du fil, **pas sur la bulle** — qui est
  exactement la même vue, au pixel près, dans les deux configurations. Une
  session qui lirait D-20 littéralement pourrait « corriger » vers une queue que
  le produit n'a jamais eue ; le README de web-v2, lui, a raison
  (`:112-114`).

- **D-7 (`decisions.md:92-100`) est désormais une décision de VALEUR PAR DÉFAUT,
  plus une décision d'absence.** Sa formulation — « la loi iOS dit la même
  chose, mais son drapeau étant désactivé, ses utilisateurs voient des bulles.
  La v4 applique la loi telle qu'elle est écrite » — décrivait un web qui ne
  savait pas éteindre le drapeau. Depuis D-20 il le sait ; ce qui reste est le
  choix de le livrer allumé (`config.ts:90`). La phrase gagnerait à le dire,
  sans quoi une session future relira D-7 comme si la branche manquait encore.

- **D-19 (`decisions.md:586-615`) tranche `script ≠ river` et cite
  `THREAD_RENDERABLE_MODES = ['focal', 'script']` comme catalogue de rendu.
  `bubbles` n'y figure pas — et c'est correct**, puisque le mode bulles entre
  par la règle de consommation et non par la loi. Mais la conséquence n'est
  écrite nulle part : `threadCapabilities` (`decision.ts:48-62`) ne rend jamais
  `bubbles` dans `availableModes`, tandis que `catalog.ts:80-89` le déclare
  inconditionnellement `isAvailable: true`. Les deux sont justes séparément et
  se contredisent en apparence ; un commentaire au point de jonction éviterait
  qu'une future borne d'identité retire `bubbles` du menu sans que rien ne
  rougisse.

- **Le README (`:130-136`) liste « gestes de balayage sur les lignes et les
  bulles, menu au appui long » dans « ce que le POC ne fait pas », et conclut :
  « Aucun n'est bloquant pour l'arbitrage ».** C'était vrai pour un arbitrage de
  DESIGN ; ça ne l'est plus pour la cible du 2026-09-08, où le mode Bulles doit
  être ce que voit une installation iOS. Sans appui long, la bulle n'a **aucune**
  action : ni répondre, ni réagir, ni copier, ni transférer, ni traduire, ni
  supprimer. C'est l'écart n° 3 de la § 9, et le seul qui rende le mode
  inutilisable plutôt qu'incomplet.

---

## Annexe — quatre pièges pour la suite

1. **`showAvatar` est un paramètre mort côté iOS** (BSL:59). Un portage qui lit
   les signatures plutôt que les corps posera l'avatar sur chaque bulle reçue.
   La vraie porte est `showIdentityBar` (BSL:238-240).

2. **Le drapeau souligné ne dit pas « ce que je lis »** mais « quel panneau est
   ouvert » (BSL:1213), et la langue lue n'a **pas** de drapeau du tout
   (`BubbleContentBuilder.swift:395`). Un témoin qui vérifie « le drapeau de la
   langue servie est actif » passerait au vert sur une implémentation fausse.

3. **`resolvePrismTranslation` court-circuite quand la préférence de tête est la
   langue d'origine** (`packages/shared/utils/conversation-helpers.ts:308-309`) :
   elle rend `null` immédiatement au lieu de descendre vers un rang inférieur.
   web-v2 hérite gratuitement de ce comportement en appelant le site partagé
   (`src/lib/api/prism.ts:52`) ; toute réécriture locale le perdrait, et le
   symptôme ne serait pas une erreur mais l'ORIGINAL servi à la place d'une
   traduction qui existe. Le pendant Swift est
   `BubbleContentBuilder.resolveEffectiveContent` (`:339-362`) — deux
   implémentations distinctes, une seule règle, et c'est la règle qu'il faut
   comparer, jamais le code.

4. **Une capture ne prouve rien sur un jeton dérivé.** `QUOTE_RAIL_WIDTH` est
   généré depuis `FocalMetrics.swift:211`, gardé par
   `scripts/check-curve.mjs:178`, et n'atteint aucun pixel (§ 9.13). Le dépôt a
   déjà la bonne réponse pour les couleurs — `check:tokens` prouve que le
   fichier n'a pas dérivé, `check:tokens-resolved` prouve que **le navigateur
   peint bien ces valeurs** (`README.md:146-157`). Les géométries n'ont que le
   premier des deux.
