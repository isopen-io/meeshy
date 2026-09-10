> Dossier des cibles de la v3.1 (issue #5672) — analyse de conception produite le 2026-09-08 sur `claude/web-v3-parite` à `25937d3790`, en lecture seule, contre l'app iOS DRAPEAUX BÊTA ACTIVÉS. Les numéros de ligne cités valent pour ce commit ; `git log --since=2026-09-08 -- <fichier>` dit s'ils ont bougé. Les captures de référence sont dans ce même dossier (`*.png`, `*.a11y.txt`), listées par `README.md`.

# FOCAL et SCRIPT — l'app iOS drapeau ON, confrontée à la v3.1 web

> Analyse de conception, **lecture seule**. Aucun fichier du dépôt n'a été modifié.
> Dépôt : `/Users/smpceo/Documents/v2_meeshy-w3`, branche `claude/web-v3-parite`.
> Date : 2026-09-08. Directive porteur du jour : **la cible de la v3.1 est l'app iOS
> AVEC ses dernières features activées** — Lentille, Focal, Script, Bulles.
> Toute cote citée vient d'un littéral de `FocalMetrics.swift`, de
> `FocalFocusCurve.swift`, de `FocalScrollPerspective.swift` ou d'un jeton
> `metrics.ts` ; là où la cote n'existe dans aucun des deux, c'est écrit
> « à lire dans … » — aucun chiffre n'est inventé.

---

## 1. Sources lues

**iOS — la loi.** `Focal/Core/ReadingModeOrchestrator.swift` (512 l, les 5 branches, le clamp, les
catalogues), `Focal/Core/FocalRowInput.swift` (431 l, l'entrée figée et son gate `Equatable`),
`Focal/Core/FocalMetrics.swift` (397 l, **toutes** les cotes citées ici),
`Focal/Core/FocalScrollPerspective.swift` (330 l, la passe, la carte, `FocalMagnificationLaw`),
`Focal/Core/FocalFocusCurve.swift` (213 l, la courbe gelée, la bande, l'hystérésis).

**iOS — la peau.** `Focal/Row/FocalRow.swift` (1 154 l, **lu en entier**) et ses sous-vues
`FocalIdentityHeader` (165), `FocalMetaColumn` (122), `FocalMetaRow` (134), `FocalSystemRows` (159),
`FocalProtectedContent` (74), `FocalNonMediaBlock` (122), `FocalConversationStartRow` (50),
`FocalEphemeralBadge` (37) ; têtes de `FocalAttachmentBlock` (427), `FocalAudioBlock` (296),
`FocalQuotedReplyView` (479) ; `Focal/Chrome/FocalTimestampRevealState.swift` (108) ;
`Focal/Preferences/{ReadingModeController, ReadingModePreferenceStore, MeeshyFeatureFlags,
ConversationViewerIdentityResolver, MessageAccessibilityLabelComposer}.swift` ;
`Focal/Lens/{ReadingModeChip, ReadingModeLensSheet}.swift`.

**iOS — le montage.** `Views/ConversationView.swift` (2 903 l, régions ciblées : `init`, puce, panes
Rivière/Résumé, escamotage du chrome), `Views/MessageListViewController.swift` (3 421 l, régions
ciblées : mux bulle/rangée, construction de `FocalRowInput`, passe de défilement),
`Views/ConversationView+Header.swift` (vérifié : **aucun** sélecteur de mode n'y vit),
`Views/MessageListViewController+SeenTracking.swift:60-64`,
`Lentille/Mode/{LentilleModeMenu, LentilleModeLabels}.swift`, `Lentille/Core/LentilleFeatureFlag.swift`.
`Focal/Summary/` (1 060 l) n'a été ouvert que pour la puce et le catalogue : hors périmètre v3.1 (D-8).

**Loi partagée.** `packages/shared/utils/reading-modes.ts` (418 l),
`packages/shared/types/reading-modes.ts` (86 l), `packages/shared/utils/conversation-helpers.ts`
(via `prism.ts`), `packages/shared/fixtures/reading-modes/orchestrator.vectors.json` (existe).

**Histoire, en survol.** `tasks/focal-implementation-contract.md` (106 Ko — WS-0…WS-11, §3.1 mode,
§3.6 entrée de rangée, §4 la passe, §5 invité/inscrit), `tasks/lentille-focal-workshop.md`,
`tasks/lentille-workshop-execution.md`. Vocabulaire et intentions ; jamais la cible.

**web-v3.** `src/routes/thread.tsx` (610 l), `src/components/{focal-row, message-blocks,
reading-mode-chip, bubble}.tsx`, `src/lib/reading-mode/{decision, catalog, store, sync, perspective,
scene, meta, metrics}.ts` **et leurs tests** (`scene.ts` et `metrics.ts` sont les deux seuls sans
témoin dédié), `src/lib/{grouping, reader}.ts`, `src/lib/view/{message, conversation}.ts`,
`src/lib/api/{prism, types}.ts`, `scripts/check-reading-mode.mjs` (+ inventaire des 23 scripts et du
gate composite `package.json:16`), `apps/web-v3/decisions.md` (615 l), `apps/web-v3/README.md`,
`.cache/web-v3-workflow/specs/thread.md` (449 l), `.github/workflows/ci.yml` (jobs web-v3).

## 2. Le drapeau et la loi

### 2.1 Ce qui se monte drapeau ON

`reading_modes` se lit par `MeeshyFeatureFlags.isReadingModesEnabled`
(`Focal/Preferences/MeeshyFeatureFlags.swift:44-46`), qui **délègue intégralement** à
`LentilleFeatureFlag.readingModes` — cascade à trois étages
(`Lentille/Core/LentilleFeatureFlag.swift:173-192`) :

1. `ProcessInfo` `MEESHY_FLAG_READING_MODES` (`"1"`/`"0"`) **prime** ;
2. `UserDefaults` clé `meeshy.flag.reading_modes` **si posée explicitement** ;
3. sinon repli sur `BetaFeaturesPreference.isEnabled`, **qui naît OFF** depuis le 2026-08-22
   (`MeeshyFeatureFlags.swift:22-30`).

⇒ **Sur une installation neuve, le drapeau est OFF et le tap normal ouvre en BULLES.**
C'est très exactement l'état que D-7 qualifie d'« écart assumé avec iOS **en pratique** »
(`apps/web-v3/decisions.md:98-100`) — voir § 11.

Drapeau ON, `ConversationView.init` monte tout en **une seule fois**
(`Views/ConversationView.swift:555-582`) :

- l'identité par `ConversationViewerIdentityResolver.resolve(authManager:anonymousSession:)`
  (`Focal/Preferences/ConversationViewerIdentityResolver.swift:89-107`) — l'UNIQUE point de
  branchement invité/inscrit ;
- les capacités par `ReadingModeOrchestrator.resolveCapabilities`
  (`ConversationView.swift:560-570`), avec `isRiverFlagEnabled: LentilleFeatureFlag.isRiviereModeEnabled`
  (l.567) et **`activeParticipantCount: conversation?.memberCount ?? 0`** (l.569) ;
- le contrôleur `ReadingModeController` en `@StateObject` (déclaré `ConversationView.swift:272`,
  construit l.571-578), avec `forcedMode: forcedReadingMode` (l.220, override éphémère de la liste) ;
- `readingModeCapabilities` mémorisé tel quel (déclaré l.280, posé l.582) — **aucune seconde
  résolution** : la puce et son menu relisent cette valeur, jamais un recalcul.

La décision est prise dans `init` et non `onAppear` parce que `viewModel.start()` marque déjà lu
avant la première frame (commentaire `ConversationView.swift:261-266`) : un `unreadCount` lu plus
tard serait faux.

### 2.2 La décision à l'ouverture — priorités et seuils

`ReadingModeOrchestrator.resolveOrchestratorDecision`
(`Focal/Core/ReadingModeOrchestrator.swift:288-318`), miroir exact de
`resolveOrchestratorDecision` (`packages/shared/utils/reading-modes.ts:151-176`) :

| # | condition | mode / raison | clampé ? |
|---|---|---|---|
| 1 | `!isFlagEnabled` | `.bubbles` / `flag-disabled` | **non** (par définition hors catalogue) |
| 2 | `stickyChoice != .auto` | image de la préférence / `sticky` | oui |
| 3 | `unreadCount > 25` | `.summary` / `unread-over-cap` | oui |
| 4 | `unreadCount >= 10` **ET** absence | `.summary` / `stale-absence` | oui |
| 5 | défaut | `.focal` / `default` | non (c'est déjà le repli) |

Seuils, déclarés une fois : `unreadCap = 25` (`ReadingModeOrchestrator.swift:132` ↔ `reading-modes.ts:36`),
`absenceUnreadFloor = 10` (`:135` ↔ `:39`), `absenceWindowMs = 24 h` (`:138` ↔ `:42`).
« Absence » = `lastOpenedAt == nil` **ou** plus de 24 h (`:247-253` ↔ `:97-102`), une horloge illisible
comptant pour une absence.

**Le clamp** : `clampToCapabilities` (`:265-272` ↔ `:118-124`) — hors catalogue ⇒ `.focal` +
`clamped-unavailable`, pour que l'encoche « AUTO · … » dise que le mode a été *rabattu*, pas *choisi*.
Catalogues : inscrit `[.focal, .script, .summary]` (`:390` ↔ `:284`), invité `[.focal, .script]`
(`:391` ↔ `:285`), drapeau éteint `[.bubbles]` (`:392` ↔ `:286`) ; `.river` s'AJOUTE si
`isRiverFlagEnabled && riverEligible` (`:444-449`), seuil `riverEligibilityThreshold = 5` (`:142`),
jamais en `direct` (`:415`).

**Une règle de RENDU se pose par-dessus la loi, côté consommation** : `ReadingModeController.renderDecision`
(`Focal/Preferences/ReadingModeController.swift:120-127`) — un collant `.bubbles` drapeau ON est rendu
`.bubbles` / `.sticky` là où la loi partagée le clamperait sur `.focal`. La loi reste intacte (vecteurs
TS↔Swift), la règle vit chez l'appelant.

### 2.3 La préférence collante, le retour auto

Magasin : `ReadingModePreferenceStore` (`Focal/Preferences/ReadingModePreferenceStore.swift:67-113`),
`UserDefaults`, clés `meeshy_readmode_<scopeKey>_<conversationId>` et
`meeshy_lastopen_<scopeKey>_<conversationId>` (`:69-78`). Le `scopeKey` est `u_<userId>` pour un
inscrit, `a_<sha256 tronqué 16>` pour un invité
(`ConversationViewerIdentityResolver.swift:62-80`) — jamais l'identifiant brut au repos
(fuite multi-comptes du 2026-05-26).
`select(_:)` fige (`ReadingModeController.swift:131-134`), `resetToAuto()` **efface la clé**
(`:138-141`) : `nil` = auto, jamais un troisième état.
La traduction mode rendu ⇄ préférence a UN domicile : `ReadingModePreferenceMapping`
(`ReadingModePreferenceStore.swift:136-181`), et l'aller-retour `.bulles` ⇄ `.bubbles` est TOTAL (`:150-180`).

> **Défaut relevé côté iOS.** `noteOpened(_:scope:at:)` est déclaré (`ReadingModePreferenceStore.swift:57, 110-113`)
> mais **n'a aucun site d'appel de PRODUCTION** (`grep -rn "noteOpened" apps/ios` → protocole,
> implémentation, doubles de test seulement). Donc `lastOpenedAt` reste éternellement `nil`, donc
> `isReaderAbsent` rend toujours `true`, donc la branche 4 se déclenche **dès 10 non-lus** au lieu de
> « 10 non-lus après 24 h d'absence ». La v3.1 web, elle, l'écrit (`thread.tsx:107-112`) : **sur ce
> point précis, le web est plus juste que sa cible.**

### 2.4 L'écriture serveur (D-10)

`apps/web-v3/src/lib/reading-mode/sync.ts` définit la FORME du port :
`pushPreference(transport, conversationId, preference)` compose le `PUT
/api/v1/user-preferences/conversations/:id` avec le corps `{ readingMode }` seul (`sync.ts:31-41`), et
`applyRemotePreference` arbitre par version (`incoming.version <= local ⇒ drop`, `:65-72`).
Les deux routes citées existent réellement (`services/gateway/src/routes/conversation-preferences.ts:191` et `:349`).

> **Mais `sync.ts` n'a AUCUN consommateur** : `grep -rn "reading-mode/sync\|pushPreference\|applyRemotePreference"`
> sur `apps/web-v3/src` et `apps/web-v3/scripts` ne rend que le fichier lui-même et son test.
> D-10 (`decisions.md:131-139`, « la v4 devient le premier client qui écrit ») est donc, à ce jour,
> **une promesse de forme, pas un comportement** : rien n'écrit vers le serveur, et le magasin local
> `localStorage` (`store.ts:35-38`, clés `meeshy.reading-mode.<scope>.<id>`) est seul.

### 2.5 Ce que la v3.1 IMPORTE de `@meeshy/shared`, et ce qu'elle RÉÉCRIT

**Importé (D-14, `decisions.md:253`)** — `decision.ts:1-9` :
`resolveCapabilities`, `resolveOrchestratorDecision`, les types `OrchestratorDecisionReason`,
`ReadingModeCapabilities`, `RiverEligibilityReason`, `ConversationReadingMode`, `ReadingModePreference`,
`ConversationType`. Le Prisme aussi : `resolvePrismTranslation` + `buildTranslationRecord`
(`src/lib/api/prism.ts:1-4`), `resolveUserLanguagesOrdered` (`src/lib/reader.ts:1`),
`getUserPresenceStatus` (`src/lib/view/conversation.ts:1`), `messageTypeFromMimeTypes`
(`src/lib/view/message.ts:1`). **C'est juste, et c'est la bonne moitié.**

**Réécrit / dérivé** (chacun avec sa raison écrite dans son en-tête) :

| fichier web | ce qu'il redit | source iOS/TS |
|---|---|---|
| `decision.ts:27` `THREAD_RENDERABLE_MODES = ['focal','script']` | le catalogue de RENDU de l'écran | (propre au web — D-8) |
| `decision.ts:89-122` `resolveThreadMode` | la règle de rendu `bulles → bubbles/sticky` | `ReadingModeController.swift:120-127` |
| `decision.ts:140-172` | la table préférence ⇄ mode | `ReadingModePreferenceMapping` (`ReadingModePreferenceStore.swift:150-180`) |
| `store.ts` (143 l) | le magasin scopé | `ReadingModePreferenceStore.swift:67-113` |
| `catalog.ts` (113 l) | libellés, ordre, raisons | `ReadingModeLensCatalog` (`ReadingModeLensSheet.swift:46-186`) |
| `metrics.ts` (40 l) | **7 cotes** sur les ~40 de `FocalMetrics` | `FocalMetrics.swift` |
| `perspective.ts` (52 l) | la courbe `thread` | `focus-curve.ts` / `FocalFocusCurve.swift:58-60` |
| `meta.ts` (33 l) | `mountsBottomLine` | `FocalMetaColumn.swift:62-68` |

La justification du non-import (poids : `zod` + `@prisma/client` dans une app de 25 Ko) est écrite et
tenue par un gate texte-à-texte (`scripts/check-curve.mjs`). Elle est acceptable ; **ce qui ne l'est
pas, c'est la COUVERTURE** : `metrics.ts` ne porte que 7 valeurs, et l'interligne, les drapeaux et la
colonne méta divergent déjà en silence (§ 3.5, § 9).

Trois entrées sont **forcées** côté web : `isFlagEnabled: true` (`decision.ts:103`),
`isAnonymous: false` (`thread.tsx:132`), `activeParticipantCount: null` (`decision.ts:56`).
Les deux premières sont documentées comme dettes de session (#5555) ; la troisième est plus honnête
qu'iOS, qui passe `memberCount` (un compte de MEMBRES, pas d'ACTIFS) là où la loi attend des actifs.

---

## 3. Anatomie de la RANGÉE PLATE (`FocalRow`), de haut en bas

`FocalRow` (`Focal/Row/FocalRow.swift:27-1134`) est une vue **PURE** : aucun `@State`
(contrainte dure §WS-4, gardée par `FocalRowSourceGuardTests`), tout vient de `input` /`actions`.
Le gate de re-render est `EquatableFocalRow` (`:1145-1153`), qui compare `row.input` seul.

### 3.0 L'enveloppe — `body` (`:63-94`)

```
switch content.kind:
  .deleted/.burned/.system  → systemBody           (:66-67)
  .ephemeralExpired         → EmptyView            (:68-69)
  .standard                 → standardBody         (:70-71)
```
puis, dans l'ordre :
`.padding(.top, isFirstInGroup ? groupTopPadding : 0)` (`:74`) →
`.padding(.vertical, Row.paddingVertical)` (`:75`) →
`.padding(.horizontal, Row.paddingHorizontal)` (`:76`) →
`.frame(maxWidth:.infinity, maxHeight:.infinity, alignment:.topLeading)` (`:81`, pour qu'une cellule à
hauteur ESTIMÉE ne centre ni n'étire son contenu) →
`.opacity(isOptimistic ? 0.7 : 1)` (`:85`) →
`.environment(\.layoutDirection, …)` (`:86`) →
`.accessibilityElement(children:.combine)` + libellé composé (`:91-92`) + actions nommées (`:93`).

**Cotes** : `Row.paddingVertical = 3` (`FocalMetrics.swift:79`, ramenée de 5 à 3 le 2026-08-24 —
elle joue DEUX fois entre deux rangées de suite), `Row.paddingHorizontal = 16` (`:80`),
`Row.groupTopPadding = 8` (`:86`, cote **absente** du token `thread.*`, repli documenté).

### 3.1 Les deux colonnes — `standardBody` (`:163-221`)

`HStack(alignment: .bottom, spacing: FocalMetrics.MetaColumn.spacing)` — la bulle à gauche,
**la date et l'accusé au BAS de sa droite** (#5135, directive porteur 2026-09-04) :

- `contentColumn` (`:166`) ;
- `FocalMetaColumn(...)` (`:171-181`), `.equatable()`, `.opacity(isFocused ? 0 : 1)` ;
- `spacing = 6` (`FocalMetrics.swift:370`), `reservedWidth = 62` en `minWidth` et non `width`
  (`:366`, `FocalMetaColumn.swift:120`) — un plancher aligne les dates entre rangées **sans jamais
  tronquer l'heure** en Dynamic Type XXL.

Puis, **en superposition seulement** (aucune hauteur réservée, donc zéro relayout à l'élection) :
fond de carte `focusCardBackground` si `isFocused` (`:190-194`), chip d'identité en `topLeading`
(`:195-201`), bande basse + tampon en `bottom` (`:202-212`), et `.messageEffects(input.effects)`
sur les DEUX colonnes (`:220`).

### 3.2 `contentColumn` (`:226-328`) — l'ordre exact

1. **badges** `badgesSection` (`:233`, défini `:365-376`) : `BubblePinnedIndicator` si `isPinned`,
   `BubbleForwardedIndicator` avec son `forwardAttribution` (attribution nominative depuis #5058),
   `FocalEphemeralBadge` avec countdown vivant (`FocalEphemeralBadge.swift:22-36`).
   **Au-dessus de l'identité**, et indépendants de `isFirstInGroup` : ce sont des propriétés du
   MESSAGE, pas du groupe.
2. **en-tête d'identité** — `FocalIdentityHeader`, **uniquement si `input.isFirstInGroup`** (`:241-270`),
   effacé en focus (`.opacity(isFocused ? 0 : 1)`, `:269`).
3. **bloc contenu**, enveloppé de `FocalProtectedContent` **si et seulement si `content.isBlurred`**
   (`:284-295`) — le wrapper ne se monte pas pour la majorité des messages.
4. `failedRetrySection` (`:297`, défini `:475-483`).
5. **ligne basse**, conditionnelle : `if mountsBottomLine` (`:317-322`).

### 3.3 Quand l'en-tête se monte, et ce qu'il porte

**La règle de groupe n'est PAS dans la rangée** : `isFirstInGroup` est calculé par l'hôte
(`Views/MessageListViewController.swift:1580-1598`) via `MessageDayGrouping.isGroupHead(previous:current:)`
sur le voisin **chronologiquement précédent** — changement d'expéditeur **ou** de jour calendaire,
**aucune fenêtre temporelle**. (Le web dit la même chose, `src/lib/grouping.ts:23-27`, et le documente
explicitement comme différence avec iMessage.)

`FocalIdentityHeader` (`Focal/Row/FocalIdentityHeader.swift:29-165`) porte, dans un `Button(.plain)`
qui ouvre le profil (`:101-108`) :
`MeeshyAvatar` avec **anneau de story, emoji d'humeur, pastille de présence** (`:111-122`),
`.agentAuthoredAvatarRing(agentStyle, …)` (`:123`), le **fantôme** `theatermasks.fill` pourpre si
`senderIsAnonymous` (`:129-139`), le nom (`:141-144`, « Toi » en indigo si `isMe`, `:90-98`),
l'étincelle ✦ si `agentStyle.showsSpark` (`:146-148`).
**Il ne date plus rien** depuis la directive 2026-08-23 (`:13-18`).
Hauteur RÉSERVÉE en permanence : `.frame(minHeight: FocalMetrics.Focus.avatarSize)` = **34**
(`:161`, `FocalMetrics.swift:200`) — la pastille RENDUE reste 22 (`:93`) dans ce cadre de 34.

### 3.4 Le retrait, la police, l'interligne

- **retrait CONSTANT** `indent = FocalMetrics.Focus.textIndent = 34 + 7 = 41`
  (`FocalRow.swift:41-43`, `FocalMetrics.swift:204`). Constant *par décision* : « le retrait fixe la
  largeur disponible, donc le retour à la ligne, donc la hauteur » (`FocalRow.swift:33-40`).
  (`FocalMetrics.Text.indent = 29` (`:122`) subsiste pour `FocalMetaRow` et les rangées système.)
- **texte** : `BubbleExpandableText` résout `MeeshyFont.bodySize` en interne ; la rangée ne pose que
  l'interligne et le retrait (`FocalRow.swift:650-690`). Le « 15 → 16 » de l'élue est **abandonné**
  et la raison est écrite (`:45-58`) : grossir relance le calcul de retour à la ligne, donc la hauteur.
- **interligne** : `lineHeightRatio = 1.42`, converti en points additifs
  `s * 0.42` arrondi au demi-point (`FocalMetrics.swift:119, 127-129`).
- **cross-fade de traduction** : `.id(effectiveText)` + `.transition(.opacity)` +
  `.animation(.easeInOut(duration: 0.15))` (`FocalRow.swift:685-689`).
- `effectiveText = content.text?.raw` (`:646-648`) — le texte **déjà résolu** par
  `BubbleContentBuilder` (Prisme + bascule manuelle) : aucune seconde résolution dans la peau.

### 3.5 Les blocs de contenu — `contentSections` (`:416-461`)

Ordre : citation → visuel → audio → non-média → texte/emoji.

- **Citation** : `BubbleStoryCitationCard` si `content.detachedStoryCitation` (`:429-436`), sinon
  `FocalQuotedReplyView` si `showsQuotedReply` (`:437-453`) — la règle `reply != nil && !audioHostsReply
  && !visualHostsReply` (`:398-400`) évite la double citation. Filet **2,5** (`FocalMetrics.swift:211`),
  couleur de l'auteur cité, deux lignes de budget partagé
  (`QuotedReplyPresentation.previewLineLimit(for: .focal)`, `FocalQuotedReplyView.swift:16-19`).
  **Loi des zones** (`:43-55`) : avatar → profil, miniature/lecture → plein écran, **tout le reste, le
  NOM compris** → retour au message cité. `.fixedSize(horizontal:false, vertical:true)`
  (`FocalRow.swift:453`) — sinon la citation s'étire dans une cellule à hauteur estimée.
- **Visuel** : `FocalAttachmentBlock` (`:487-499`), grille 1/2/3/4+ **arithmétiquement identique** à la
  bulle (`gridMaxWidth 300`, `gridSpacing 2`, `FocalAttachmentBlock.swift:45-47`), radius 16
  (`FocalMetrics.swift:227`).
- **Audio** : `FocalAudioBlock` (`:501-528`), routé par `FocalAudioRouting.mode(for:)` sur 6 modes
  (`FocalAudioBlock.swift:10-27`) ; **le drapeau-toggle de la rangée pilote aussi la piste audio et ses
  segments karaoké** (`FocalRow.swift:512-515`).
- **Non-média** : `FocalNonMediaBlock` sous `FocalNonMediaGate.shouldRender(...)` (`:550-570`,
  `FocalNonMediaBlock.swift:15-19`) — cartes lieu et fichier RÉELLES, ouvrables.
- **Texte / emoji / sticker** (`:576-585`) : sticker d'abord (`MessageStickerArtwork`, côté
  `FocalMetrics.Sticker.side = 112`, `:223` — plus petit que les 160 de la bulle, « ces trois modes
  tiennent une COLONNE de texte »), puis emoji-only sans citation (`:619-624`), puis texte.

### 3.6 La colonne méta et la ligne basse

- **`FocalMetaColumn`** (`Focal/Row/FocalMetaColumn.swift:44-121`) : `FocalMetaRow` en
  `fillsWidth: false`, `.frame(minWidth: 62, alignment: .trailing)` (`:120`).
- **`FocalMetaRow`** (`Focal/Row/FocalMetaRow.swift:33-133`) : indicateur « modifié »
  (`BubbleEditedIndicator`, `:128-133`), l'heure via `FocalRevealedTime` (`:124-126`), et
  **les coches sous `FocalRevealedDetail`** (`:88-95`).
  Teinte : `MetaText.lightOpacity = darkOpacity = 0.55` (`FocalMetrics.swift:343-344`) — palier
  unique **calculé** (0,50 mesure 3,98:1, sous AA ; 0,55 mesure 4,76:1 clair et 6,26:1 sombre,
  `:325-341`).
  `.accessibilityHidden(true)` sur toute la ligne (`FocalMetaRow.swift:98`) : l'heure et l'accusé sont
  déjà dans le libellé composé.
- **Le révélé** — `FocalTimestampRevealState` (`Focal/Chrome/FocalTimestampRevealState.swift:33-61`)
  et `FocalRevealedDetail` (`:83-93`) : **heure et coches sont MASQUÉES au repos** et n'apparaissent
  que pendant le défilement, plus `lingerMs` (loi gelée `ScrollTimePillLaw`), fondu
  `FocalMetrics.Pill.fadeDuration = 0,28 s` (`FocalMetrics.swift:296-298`), `allowsHitTesting` suivant
  l'opacité (`:90`) pour que le fil au repos ne soit pas semé de boutons invisibles.
  C'est un `ObservableObject` **observé par la plus petite feuille possible** — le gate
  `EquatableFocalRow` n'est jamais traversé (`:24-31`).
- **Ligne basse** — `flagAndReactionsRow` (`FocalRow.swift:760-800`), montée **seulement si**
  `FocalMetaColumn.mountsBottomLine(hasTranslation:isBlurred:isLastInGroup:hasReactions:)`
  (`FocalMetaColumn.swift:62-68`) : drapeaux d'abord, réactions ensuite, retrait `indent`.
  Deux gardes portées par la règle : **jamais de drapeau en clair sur un message voilé**, et
  **un seul jeu de drapeaux par groupe, sur son DERNIER message** (#3919).
- **Drapeaux d'une rangée ordinaire** : `plainLanguageFlags` (`:1056-1086`), **trois au plus**
  (`FocalMetrics.FocusStrip.flagLimitPlain = 3`, `:269`), ordonnés par
  `FocalRow.focusFlagCodes(originalLangCode:availableFlags:activeLangCode:limit:)` (`:825-838`) :
  original → traductions → langue affichée, dédupliqué en minuscules, et **la langue ACTIVE est
  ramenée en tête de la coupe si le plafond l'aurait éliminée** (« un drapeau ACTIF invisible serait
  un état sans son témoin »). Le tap applique la langue **à tout le groupe**
  (`onSetActiveDisplayLanguageForGroup`, `:1082`).
- **Réactions** : `BubbleReactionsOverlay` réutilisé tel quel, monté selon
  `BubbleReactionsOverlay.isMounted(hasReactions:isMe:isLastReceivedMessage:)` (`:739-745`).

### 3.7 Ce que l'élection ajoute (Focal seul)

- **carte** : `focusCardBackground` (`:965-970`) — accent à `focusCardFillOpacityDark = 0,16` /
  `…Light = 0,10` (`FocalScrollPerspective.swift:193-194`), rayon
  `focusCardCornerRadius = 18` (`:163`), débord `focusCardHorizontalInset = 6` (`:164`) et
  `focusCardInnerMargin = Row.paddingVertical` (`:188`).
- **chip d'identité** en haut-gauche (`FocalRow.swift:994-1020`) : c'est **le même
  `FocalIdentityHeader`**, à un gabarit plus grand (`identityAvatarSize = 26`,
  `identityChipHeight = 34`, `identityNameSize = 13,5` — `FocalMetrics.swift:261-263`), sans fond ni
  capsule, décalé de `identityOverhang` (`:275`).
- **bande basse** `focusStrip` (`:871-931`) : icône `character.bubble` (détails de traduction) →
  jusqu'à **cinq** drapeaux (`flagLimitMagnified = 5`, `:270`) → `face.smiling` (picker) → les
  réactions, chacune en `focusChip` (`:848-864`) de hauteur `chipHeight = 24`,
  `chipMinWidth = 32` (`:245-246`), fond selon
  `FocalScrollPerspective.focusChipFillOpacity(isDark:isActive:)` (`:206-213`, quatre valeurs).
- **tampon** `focusStampChip` en bas-droite (`:1027-1047`) : la date COMPLÈTE **pré-calculée**
  (`input.focusTimestamp`, posée par l'hôte `MessageListViewController.swift:1654`) + la coche ;
  le tap ouvre les détails de lecture.
  Repli calculé en `body` seulement en filet (`FocalRow.swift:698-712`).
- Sur la rangée élue, la colonne méta et la ligne basse **s'effacent** (`:182`, `:321`) mais
  **gardent leur place** : la hauteur ne dépend jamais du focus.

---

## 4. Ce qui DISTINGUE Script de Focal

### 4.1 Ce qui NE les distingue PAS

**`FocalRowInput.density` (`Focal/Core/FocalRowInput.swift:68-71`, posée
`MessageListViewController.swift:1604`) n'est LUE par personne.** `FocalRow` le déclare en tête
(`FocalRow.swift:9-14` : « `input.density` n'est PAS lu par ce fichier ») et une garde de source
l'interdit (`MeeshyTests/Unit/Focal/FocalRowSourceGuardTests.swift:108`), une autre vérifie que les
deux modes rendent la même classe de largeur (`FocalRowMetricsTests.swift:69`).
Le champ subsiste dans l'entrée figée et participe à l'`Equatable` (`FocalRowInput.swift:274`) —
il force donc une reconfiguration au changement de mode, ce qui est son seul effet observable.

`usesFlatRow` (`MessageListViewController.swift:33`) est vrai pour les deux, et c'est **le seul point
de branchement** du mux de rangée (`:1559`). Partagent donc *tout* : rangée, groupement, présence,
actions, swipe uniforme (`:1743`), estimation de hauteur apprise (`:3004-3008`), indicateur de frappe
plat (`:1114`), escamotage du chrome au défilement (`ConversationView.swift:2134-2148` et `:2160-2184`),
révélé des heures.

### 4.2 Ce qui les distingue vraiment — et la surprise

Le mode `.focal` ouvre **la scène** :

1. **Armement** — `FocalMagnificationLaw.isArmed(alreadyArmed:scrollStartedAt:now:velocity:)`
   (`FocalScrollPerspective.swift:317-329`), appelée depuis `noteScrollTimePillActivity`
   (`MessageListViewController.swift:864-876`). Deux portes : **vitesse ≥ 1 200 pt/s**
   (`FocalScrollPerspective.swift:310`) **ou** défilement soutenu ≥ **4 000 ms** (`:306`).
   « Une fois armée, elle le reste » (`:293-296`).
   **Tant qu'elle n'est pas armée, Focal défile EXACTEMENT comme Script**
   (`MessageListViewController.swift:3295-3302` — toutes les couches sont remises à l'identité).
2. **Activation de scène** — `noteFocalScrollTick` (`:3210-3219`), gardée `readingMode == .focal`
   **et** geste utilisateur (`isDragging || isDecelerating`) : jamais sur un défilement programmé.
3. **Élection** — `FocalScrollPerspective.focusedId(cells:focusY:currentId:)` (`:127-138`), avec
   hystérésis `FocalFocusCurve.threadFocusBandHysteresis = 95` (`FocalFocusCurve.swift:104`).
   La ligne de focus est `focusY(visibleTop:visibleBottom:offsetFromBottom:)`
   (`FocalScrollPerspective.swift:49-55`) : le **centre** de la région visible, qui **descend au bord
   bas** au repos sur le dernier message.
4. **Reconfiguration ciblée** — `syncFocalFocusDetails` (`:3372-3380`) → `reconfigureFocalItems`
   (`:3399-3415`) sur **deux items seulement** (ancien et nouvel élu), différée et coalescée pour ne
   jamais imbriquer un `apply` diffable.
5. **Aplatissement** — `scheduleFocalFlatten` (`:3223-3229`) après
   `FocalMetrics.Scene.restDelay = 4,5 s` (`FocalMetrics.swift:177`), animé sur
   `flattenDuration = 0,45 s` (`:179`), `beginFromCurrentState` (`:3261`).

> **LA SURPRISE, et c'est le fait le plus important de cette analyse : la COURBE N'EST PLUS APPLIQUÉE.**
> `applyFocalPerspectiveToVisibleCells` (`MessageListViewController.swift:3283-3345`) calcule les
> géométries, élit — puis **`for cell in cells { FocalScrollPerspective.reset(cell.contentView.layer) }`**
> (`:3328`). `FocalScrollPerspective.poses(cells:focusY:reduceMotion:)` (`:101-123`)
> **n'a aucun appelant de production** (`grep` : uniquement les tests et deux commentaires).
> La raison est écrite ligne 3314-3327 (directive 2026-08-24) : *« JE NE VEUX aucune animation entre
> les messages — une fois dans la planche ils sont fixes »*. `apps/ios/decisions.md:328` confirme et
> tire la conséquence : la sur-réserve tombe à **zéro** (`layout.focalOverscan = 0`), la compaction
> n'étant plus jouée.
>
> **Donc, sur iOS drapeau ON : ni échelle, ni opacité, ni compaction ne varient avec la distance.
> Ce qui distingue Focal de Script est la CARTE et les CHIPS du message élu, rien d'autre.**

`FocalFocusCurve.focusCurve(distance:variant:.thread)` (`:133-141`) et ses constantes
(380 / 0,40 / 0,82, `:58-60`) restent **écrites et testées** — loi gelée, point de rebranchement.
`FocalScrollPerspective.alphaFloor = 0,62` (`:29`) et `overscanFraction = 0,3` (`:151`) idem.

### 4.3 Le bouton de densité

**Il n'existe plus.** `ReadingModeDensityButton` n'apparaît que dans un commentaire périmé
(`ConversationView.swift:2398`) et dans un témoin qui **assert son absence**
(`MeeshyTests/Unit/Focal/ConversationViewReadingModeAffordanceTests.swift:100-109`, y compris
`toggledDensity`). Le lot P2 (spec Magnificence 2026-08-17) l'a supprimé : la puce unique porte le
cycle (tap) et le menu (appui long).

### 4.4 Côté web

`useThreadPerspective(scroller, readingDecision.mode === 'focal')` (`thread.tsx:195`) →
`scene.ts:26-70` : une passe hors React, une lecture de géométrie par image
(`requestAnimationFrame`), et pour chaque `[data-row]` : `visual.style.opacity = alpha` et
`visual.style.transform = scale(...)` (`:41-44`), avec `threadPerspective(bandY - midY)`
(`perspective.ts:46-52`, constantes 380 / 0,4 / 0,82 et bande `bas − 150`, `:28-33`).
`prefers-reduced-motion` coupe la passe entière avant son premier `rAF` (`scene.ts:29`), et le
démontage nettoie les styles (`:60-68`).

⇒ **La v3.1 applique la courbe qu'iOS a explicitement retirée le 2026-08-24, et n'a pas l'élection
qui l'a remplacée.** `perspective.ts:10-25` le dit à moitié (« l'ÉLECTION … reste hors périmètre :
c'est une seconde issue ») mais présente le résultat comme un rapprochement d'iOS, alors que c'en est
une divergence *dans les deux sens*.

---

## 5. La PUCE et la FEUILLE

### 5.1 iOS — la puce

`ReadingModeChip` (`Focal/Lens/ReadingModeChip.swift:44-128`).
**Montage** : `ConversationView.readingModeAffordanceCluster` (`ConversationView.swift:2401-2434`),
inséré dans `headerButtonsCluster` **après** `expandedHeaderSearchButton` et **jamais avant**
`headerCallButtons.layoutPriority(1)` (`:2347-2349`, interdiction de contrat), le tout portant
`.hiddenWhileScrolling()` (`:2350`, `:2384`). Ce n'est **ni** une `toolbar` **ni** un
`safeAreaInset` : c'est un enfant du ZStack, dans l'en-tête flottant (`.zIndex(100)`, `:2242`).
**Garde d'affichage** : `readingModeCapabilities.availableModes.contains(where: { $0 != .bubbles })`
(`:2405`) — drapeau OFF, le catalogue vaut `[.bubbles]` et la puce **disparaît intégralement**.

**Contenu** : préfixe « AUTO » à 9 pt `.heavy`, opacité 0,65, si `model.isAuto`
(`ReadingModeChip.swift:63-68`), puis le titre du mode à `MeeshyFont.subheadSize` `.semibold`
(`:69-73`) ; capsule accent à **0,28** de fond et **0,5** de contour (`:77-78`) ; `.fixedSize()` sur
les deux textes (`:67`, `:73`) ; `.meeshyTapTarget()` (`:83`).
`isAuto` = `decision.reason != .sticky && != .flagDisabled` (`ConversationView.swift:2443-2444`) —
c'est-à-dire **AUCUNE raison n'est affichée** : la puce dit « AUTO », jamais « AUTO · absence ».
Le libellé « AUTO · <raison> » que la loi promet (`ReadingModeOrchestrator.swift:109-110`) n'a donc
**aucun consommateur visuel** dans le fil.

**Gestes** : tap → `onCycle` → `ReadingModeCycle.next(after:availableInOrder:)` (`:20-31`) sur
`cycleOrder = [.focal, .script, .bubbles]` (`ReadingModeLensSheet.swift:56`), filtré par les capacités
mais `.bubbles` toujours autorisé (`ConversationView.swift:2424-2426`), avec `HapticFeedback.light()`.
Appui long → `.contextMenu { menuContent }` (`:82`, `:104-127`) : les **cinq** lignes de
`ReadingModeLensCatalog.rows(...)`, chacune désactivée si `!isAvailable || isCurrent` (`:116`),
puis un `Divider()` et « Automatique » (`wand.and.stars`) qui appelle `resetToAuto()` (`:118-126`).

### 5.2 iOS — la feuille n'existe plus

`ReadingModeLensSheet.swift:188-190` : *« la feuille Lentille est REMPLACÉE par le menu d'appui long
du chip »*. Le fichier ne contient plus que `LensRowModel` (`:34-42`) et
`ReadingModeLensCatalog` (`:46-186`) — `displayOrder = [.focal, .script, .bubbles, .summary, .river]`
(`:52`), `rows(capabilities:currentMode:)` (`:61-115`), `title(for:)` (`:117-125`),
`defaultSubtitle(for:)` (`:127-135`), `subtitle(for:)` (`:149-185`).
Aucun `.sheet` ne la présente ; le seul `.sheet` Focal restant est `FocalReadMoreSheet`
(`ConversationView.swift:913-915`).

> **Un producteur sans lecteur, côté iOS.** `menuContent` ne rend que
> `ReadingModeLensCatalog.title(for:)` (`ReadingModeChip.swift:111-113`) : la trifurcation de la
> raison Rivière (`subtitle(for:)`, `ReadingModeLensSheet.swift:149-185`, avec ses trois clés
> `reading_mode.river.never` / `.threshold_only` / `.unavailable_reason`) **n'est affichée nulle part
> dans le fil**. Elle n'a de lecteur que côté LISTE (`LentilleModeLabels.riverReason`) et dans les
> tests. La v3.1, elle, l'affiche (`catalog.ts:55-59`, `reading-mode-chip.tsx:210-212`) —
> **le web est ici en avance sur sa cible.**

### 5.3 `LentilleModeMenu` — le menu de la LISTE, pas du fil

À ne pas confondre. Il sert la liste de conversations : sous-menu du `.contextMenu` natif iOS 26+
(`Views/ConversationListView+Overlays.swift:175-178`, gardé par `LentilleFeatureFlag.isLentilleListEnabled`)
et encoche `ModeNotch` (`LentilleMagnification.swift:299-321`) ; le fallback < iOS 26
(`ConversationContextMenuView.swift`) **ne le monte pas**. Son ordre (`LentilleModeMenu.swift:83`) est
`[.auto, .focal, .script, .bulles, .resume, .riviere]` — **six** entrées, alors que sa docstring (`:6-9`)
et `ReadingModeOrchestrator.swift:60-61` en affirment cinq (vestiges d'avant l'AMENDEMENT S1).
Les deux surfaces **partagent le même magasin** via `FocalReadingModePreferenceStoring.preference/setPreference`
(`ReadingModePreferenceStore.swift:198-217`, arbitrage REV-3/B2 `:116-135`) : choisir « Script » depuis la
liste positionne bien le fil en Script à l'ouverture.

### 5.4 Ce que la v3.1 en fait

`ReadingModeChip` (`src/components/reading-mode-chip.tsx:36-236`) :
- **clic = ouvre le menu**, écart assumé et argumenté (`:9-15` : pas d'équivalent accessible à
  l'appui long sur le web, clic droit hostile, longpress inatteignable au clavier) ;
- **il n'y a donc PAS de cycle** : passer de Focal à Script coûte 2 gestes au lieu d'1 ;
- préfixe AUTO (`:143-150`), capsule accent 28 % + contour 50 % (`:138-141`) — mêmes proportions
  qu'iOS ; hauteur 44, largeur au contenu (`:134`), avec l'explication mesurée du débord qui volait le
  clic d'« Appeler » (`:128-133`) ;
- mécanique clavier partagée `useRovingMenu` (`:83-99`), focus initial sur la ligne COURANTE (`:94-97`) ;
- `role="menu"` / `menuitemradio` + `aria-checked` (`:160`, `:184-185`) — **plus riche qu'iOS**, dont
  le `.contextMenu` ne porte qu'une coche visuelle ;
- lignes indisponibles **listées, désactivées, motivées** (`:171-216`), avec la raison gardée en encre
  secondaire pleine plutôt que voilée avec la ligne (`:192-197`, contraste mesuré) ;
- « Automatique » en ligne séparée (`:218-231`).

`catalog.ts:12` reprend l'ordre iOS exact, `catalog.ts:25-39` les titres et sous-titres mot pour mot,
`catalog.ts:55-59` la trifurcation Rivière. **Le seul écart de contenu** : `summary` est déclaré
indisponible pour TOUT lecteur avec la raison « Pas encore disponible sur le web »
(`catalog.ts:41-48, 91-100`), là où iOS le sert aux inscrits.

---

## 6. États

| état | iOS (drapeau ON) | web-v3 |
|---|---|---|
| fil vide | `FocalConversationStartRow` (`Row/FocalConversationStartRow.swift:11-49`) : glyphe, « Début de la conversation avec X », libellé de jour du 1ᵉʳ message | écran vide dédié `thread.tsx:473-490` (titre + phrase) — **pas** de rangée « début de conversation » |
| chargement | hauteur estimée + auto-dimensionnement ; `estimatedFlatRowLayoutHeight = 150`, apprise ensuite (`MessageListViewController.swift:416`, `:3000-3009`) | **absent** (fixtures synchrones) — aucun squelette |
| erreur | hors de la rangée (bandeaux de l'hôte) | **absent** |
| hors-ligne | chrome existant | bandeau non bloquant `thread.tsx:432-444`, `role="status"`, D-16 |
| envoi optimiste | `.opacity(0.7)` (`FocalRow.swift:85`), états `[.draft,.queued,.sending]` (`MessageListViewController.swift:406`) | `localDelivery: 'pending'` → coche horloge (`message-blocks.tsx:25`) ; **pas d'opacité 0,7** |
| échec d'envoi | `BubbleFailedRetryBar` 72×28, rayon 8, au retrait (`FocalRow.swift:475-483`) | bouton pleine largeur « Non envoyé / Réessayer » (`focal-row.tsx:178-192`) — même intention, autre forme |
| message supprimé | `FocalDeletedRow` italique sans fond, clé `bubble.system.deleted` (`FocalSystemRows.swift:32-43`) | **absent** |
| éphémère consommé | `.ephemeralExpired → EmptyView` (`FocalRow.swift:68-69`) ; `FocalBurnedRow` (`FocalSystemRows.swift:47-58`) | **absent** |
| message système / appel | `FocalSystemNoticeRow`, `FocalCallNoticeRow` réutilisée telle quelle (`FocalSystemRows.swift:22-28`) | **absent** |
| protégé (flou / vue unique) | `FocalProtectedContent` (`Row/FocalProtectedContent.swift:20-48`) : flou 18, `allowsHitTesting(false)`, brouillard `.ultraThinMaterial`, tap → révélation 5 s → re-flou, `consumeViewOnce` | **ABSENT et dangereux** : `focal-row.tsx:119` ne lit `isBlurred` que pour décider si la ligne basse se monte ; le contenu s'affiche **en clair**. `isViewOnce` n'est lu nulle part. C'est la régression iOS du 2026-08-18 rejouée. |
| éphémère en cours | `FocalEphemeralBadge` avec countdown vivant (`FocalEphemeralBadge.swift:22-36`) | **absent** |
| épinglé / transféré | `BubblePinnedIndicator` / `BubbleForwardedIndicator` + `forwardAttribution` (`FocalRow.swift:365-376`) | **absent** |
| audio + transcription | `FocalAudioBlock`, 6 modes de routage, karaoké, pistes traduites, file de lecture continue | `Voice` (`message-blocks.tsx:265-305`) : onde **fabriquée depuis l'id**, aucune transcription, aucune piste traduite, la lecture ne joue rien (`useState(playing)` seul) |
| réponse citée | `FocalQuotedReplyView` (479 l), loi des zones à 3 classes | `Quote` (`message-blocks.tsx:218-263`) : une seule zone → saut. Nom et texte dans le même paragraphe (parité #5103 ✅) |
| story citée | `BubbleStoryCitationCard` (`FocalRow.swift:429-436`) | **absent** |
| en frappe | cellule du flux, pastille 22 + 3 points sans capsule quand `readingMode != .bubbles` (`MessageListViewController.swift:1114`, `:3051-3058`) | cellule du flux hors virtualiseur, **avec** capsule et libellé « Amina écrit » (`thread.tsx:574-602`), `typing` **codé en dur à `true`** (`:57`) |
| message édité | `BubbleEditedIndicator` (`FocalMetaRow.swift:128-133`) | **absent** |
| sticker | `MessageStickerArtwork`, côté 112 (`FocalRow.swift:608-613`) | **absent** |
| lieu partagé | `LocationMessageView` ouvrable plein écran (`FocalNonMediaBlock`) | **absent** (`message-blocks.tsx:307-341` ne connaît que image / audio / fichier) |

---

## 7. Gestes

| geste | iOS | web-v3 |
|---|---|---|
| tap avatar / nom | `Button(.plain)` → `onOpenProfile(profileSheetUser)` (`FocalIdentityHeader.swift:101-108`), routé vers profil ou fiche de participation | **inerte** — `Avatar` est un `<span>` (`avatar.tsx`), aucun `onClick` |
| tap drapeau | `LanguageFlagChip` → `onSetActiveDisplayLanguageForGroup` (groupe entier) (`FocalRow.swift:1075-1083`) | `Flags` → `setOpenLanguage` **local à la rangée** (`message-blocks.tsx:151-182`) : ouvre un panneau `SecondaryText` SOUS le texte au lieu de remplacer le texte servi |
| tap pastille Prisme | pas d'icône translate en rangée ordinaire (arbitrage 2026-08-18) ; `character.bubble` seulement sur la bande de l'élue (`FocalRow.swift:873-884`) | `PrismPastille` sur chaque message traduit (`message-blocks.tsx:49-86`) — **en avance**, mais pas la même grammaire |
| tap coches | ouvre les détails de lecture (`FocalMetaRow.swift:104-118`), touchable **seulement pendant le révélé** | `Check` est un glyphe non cliquable (`message-blocks.tsx:115-127`) |
| tap réaction | bascule + `HapticFeedback.light()` ; appui long → qui a réagi (`FocalRow.swift:935-957`) | `ReactionChip` est un `<span>` (`message-blocks.tsx:100-113`) — **contrôle sans effet ⇒ absent** |
| appui long message | `.nativeMessageContextMenu` iOS 26+, **aperçu = la rangée plate elle-même** (`MessageListViewController.swift:1781-1798`) ; overlay custom < iOS 26 | **absent** ; `RowActions` existe mais n'est monté que par `lens-row.tsx:319` (liste) |
| swipe | `BubbleSwipeContainer`, `uniformFlatDirection: usesFlatRow` — réponse à droite, transfert à gauche, résistance accrue sur média temporel (`MessageListViewController.swift:1733-1752`) | **absent** ; D-17 tranche explicitement « menu, pas swipe » pour la LISTE, rien n'est dit pour le fil |
| défilement | perspective (§4), escamotage total du chrome en rangée plate (`ConversationView.swift:2150-2174`), révélé des heures | perspective seule ; **l'en-tête et le composeur ne s'escamotent jamais** |
| ancrage bas | mécanisme UIKit générique, `nearBottomFollowThreshold = 200` (`MessageListViewController.swift:452`) | `scrollTop = scrollHeight` **ré-armé sur 20 images**, désarmé à la première intention (`wheel`/`touchstart`/`keydown`) (`thread.tsx:239-259`) — mécanisme propre et documenté (D-15) |
| saut au non-lu | `scrollToMessage(localId:)` + visée vérifiée `ScrollToMessageSettleLaw` (`:2612`, `:2968`) | **absent** ; seul le saut de citation existe (`thread.tsx:205-212`, avec surbrillance 1 600 ms) |
| scrub | hors périmètre du fil | — |

---

## 8. Accessibilité

**iOS.** Une rangée = **un** élément VoiceOver : `.accessibilityElement(children: .combine)` puis
**remplacement** du libellé par `MessageAccessibilityLabelComposer.compose(content)`
(`FocalRow.swift:91-92`). L'ordre du libellé est gelé
(`Focal/Preferences/MessageAccessibilityLabelComposer.swift:38-98`) : expéditeur → citation → texte →
images → vidéos → audios → lieu/fichiers → heure → accusé → modifié → épinglé → éphémère → réactions.
Parce que la fusion supprime tout tap localisé, les zones de la citation sont ré-offertes en **actions
nommées** (`FocalRow.swift:114-128`, clés `bubble.reply.author_hint` / `bubble.reply.open_media`),
et **elles suivent l'ARMEMENT, pas la présence à l'écran** (`:106-108`).
`FocalMetaRow` est `accessibilityHidden(true)` (`:98`) — l'information est déjà dans le libellé.
Les drapeaux portent trait `.isSelected` + « Afficher en <langue> » via `.languageFlagAccessibility`
(`FocalRow.swift:908-911`) et des libellés formatés pour le toggle (`:1123-1131`).
Dynamic Type : toutes les tailles passent par `MeeshyFont.relative(...)`, et `minWidth` (jamais
`width`) sur la colonne méta est motivé par XXL (`FocalMetrics.swift:355-364`).

**web-v3.** Points forts, dont certains **absents d'iOS** : `lang={rendered.language}` sur le
paragraphe servi (`focal-row.tsx:197`) et sur le texte secondaire (`message-blocks.tsx:208`) — un
lecteur d'écran ne prononce plus du français avec une voix anglaise ; `<time dateTime>` (`:245`) ;
`aria-label` sur la citation (`message-blocks.tsx:241`), `aria-pressed` sur la pastille (`:66`) et les
drapeaux (`:154`) ; texte hors écran sur les réactions (`:108-110`) ; menu ARIA complet
(`reading-mode-chip.tsx:160`, `:184-188`) ; cibles tactiles étendues sans grandir le dessin
(`tap-target-22` / `tap-target-34`, bornées à la moitié du gap pour ne pas voler le clic du voisin,
`message-blocks.tsx:72-79`, `:156-166`).
Manquent : le regroupement en **un** élément par rangée, le libellé COMPOSÉ dans l'ordre gelé,
les actions nommées, tout rôle sur la rangée elle-même, et le pendant du `accessibilityHidden` méta
(l'heure y est lue deux fois : par `<time>` et par le contenu).

---

## 9. Tableau de parité

Verdict exigeant : **un contrôle sans effet est « absent ».**

| élément | iOS (`fichier:ligne`) | web-v3 (`fichier:ligne`) | verdict |
|---|---|---|---|
| loi d'orchestration | `ReadingModeOrchestrator.swift:288-318` | importée : `decision.ts:2,97-104` | **conforme** |
| catalogue de capacités | `ReadingModeOrchestrator.swift:411-451` | importé + intersecté `decision.ts:48-62` | **conforme** |
| règle de rendu `bulles` | `ReadingModeController.swift:120-127` | `decision.ts:106-108` | **conforme** |
| seuils 25 / 10 / 24 h | `:132,135,138` | via `@meeshy/shared` | **conforme** |
| clamp hors catalogue | `:265-272` | `decision.ts:110-121` (branche écrite, inatteignable) | **conforme** |
| magasin scopé | `ReadingModePreferenceStore.swift:69-113` | `store.ts:35-38,106-137` | **divergent** : scope figé à `'local'` (`thread.tsx:39`) — un seul jeu de préférences pour tous les lecteurs de la WebView |
| `noteOpened` | **jamais appelé** (`grep`) | `thread.tsx:107-112` | **divergent** (le web est plus juste) |
| `activeParticipantCount` | `memberCount` (`ConversationView.swift:569`) | `null` (`decision.ts:56`) | **divergent** (le web est plus honnête) |
| écriture serveur (D-10) | inexistante | `sync.ts:31-41` **sans consommateur** | **absent** |
| drapeau `reading_modes` | `LentilleFeatureFlag.swift:173-192`, défaut OFF | `isFlagEnabled: true` en dur (`decision.ts:103`) | **divergent assumé** (D-7) |
| mux rangée/bulle | `MessageListViewController.swift:1559` | `thread.tsx:537` | **conforme** |
| `usesFlatRow` | `MessageListViewController.swift:33` | `decision.ts:129-131` | **conforme** |
| retrait 41 constant | `FocalMetrics.swift:204` | `metrics.ts:34` + `gridTemplateColumns` (`focal-row.tsx:131`) | **conforme** |
| paddings 3 / 16 / 8 | `FocalMetrics.swift:79,80,86` | `metrics.ts:17,18,21` (`focal-row.tsx:132-134`) | **conforme** |
| pastille 22 | `FocalMetrics.swift:93` | `metrics.ts:24` (`focal-row.tsx:142`) | **conforme** |
| cadre d'avatar réservé 34 | `FocalIdentityHeader.swift:161` | `metrics.ts:32` **exporté, jamais consommé** | **absent** (la hauteur d'en-tête n'est pas réservée) |
| identité en tête de groupe | `FocalRow.swift:241` | `focal-row.tsx:146` | **conforme** |
| présence / anneau de story / humeur / fantôme / ✦ | `FocalIdentityHeader.swift:111-148` | `Avatar` initiales seules | **absent** |
| interligne 1,42 | `FocalMetrics.swift:119,127-129` | `leading-[1.35]` (`focal-row.tsx:196`), **absent de `metrics.ts`** | **divergent** |
| colonne méta, `minWidth 62` | `FocalMetrics.swift:366`, `FocalMetaColumn.swift:120` | pas de largeur réservée (`focal-row.tsx:237`) | **divergent** (les dates ne s'alignent pas d'une rangée à l'autre) |
| espacement colonne 6 | `FocalMetrics.swift:370` | `gap-2` = 8 px (`focal-row.tsx:162`) | **divergent** |
| opacité méta 0,55 | `FocalMetrics.swift:343-344` | `metrics.ts:40` (`focal-row.tsx:244`) | **conforme** |
| heure sur CHAQUE rangée | `FocalRow.swift:171-181` | `focal-row.tsx:237-248` | **conforme** |
| heure et coches **masquées au repos** | `FocalTimestampRevealState.swift:83-93` | toujours visibles | **absent** |
| `showsDeliveryChecks(isMe:hasStatus:)` | règle nommée `FocalMetaColumn.swift:74-76` (**non consommée** par `FocalMetaRow.swift:88`) | `Check` : `isMine` seul (`message-blocks.tsx:115-118`) | **divergent** — la règle n'est appliquée nulle part des deux côtés |
| `mountsBottomLine` | `FocalMetaColumn.swift:62-68` | `meta.ts:25-33`, appelé `focal-row.tsx:117-122` | **conforme** |
| plafond de drapeaux | 3 ordinaire / 5 magnifiée (`FocalMetrics.swift:269-270`) | `slice(0, 4)` (`message-blocks.tsx:148`) | **divergent** |
| ordre + réinsertion de la langue active | `FocalRow.focusFlagCodes` (`:825-838`) | `[original, ...traductions]` brut (`focal-row.tsx:95`) | **absent** |
| drapeau ⇒ change le TEXTE servi | `onSetActiveDisplayLanguageForGroup` (`FocalRow.swift:1082`) | ouvre un panneau secondaire (`focal-row.tsx:204-206`) | **divergent** |
| un seul jeu de drapeaux par groupe | `FocalRow.swift:776` + `meta.ts` | `meta.ts:31` (via `tail`) | **conforme** |
| pas de drapeau sur message voilé | `FocalRow.swift:776`, `FocalMetaColumn.swift:66` | `meta.ts:31` | **conforme** |
| **flou de confidentialité** | `FocalProtectedContent.swift:31-48` | néant | **absent (fuite)** |
| vue unique / consommation | `FocalRow.swift:284-295`, `onConsumeViewOnce` | néant | **absent** |
| citation | `FocalQuotedReplyView.swift` (479 l), 3 zones, filet 2,5 | `Quote` 1 zone (`message-blocks.tsx:218-263`) ; filet `w-1` = 4 px, **`QUOTE_RAIL_WIDTH` (`metrics.ts:37`) jamais consommé** | **divergent** |
| saut vers le message cité | `MessageListViewController.swift:2612` + visée vérifiée | `thread.tsx:205-212` (+ surbrillance) | **conforme** |
| grille média 300 / 2 | `FocalAttachmentBlock.swift:45-47` | image seule 300×240 (`message-blocks.tsx:317-321`), pas de grille 2/3/4+ | **divergent** |
| audio | `FocalAudioBlock` 6 modes + karaoké + file | onde fabriquée, lecture inerte (`message-blocks.tsx:265-305`) | **absent** |
| réactions | `BubbleReactionsOverlay` + `isMounted` + (+) | `ReactionChip` sans effet | **absent** |
| effets de message | `.messageEffects` (`FocalRow.swift:220`) | néant | **absent** |
| élection + carte + chips (Focal) | `MessageListViewController.swift:3329`, `FocalRow.swift:190-212` | néant | **absent** |
| armement de la magnificence | `FocalMagnificationLaw.swift:317-329` (4 000 ms / 1 200 pt/s) | passe active dès le 1ᵉʳ rAF (`scene.ts:55`) | **divergent** |
| aplatissement au repos 4,5 s | `FocalMetrics.swift:177`, `:3223-3229` | jamais | **absent** |
| courbe appliquée | **NON** (`:3328`) | **OUI** (`scene.ts:39-44`) | **divergent (inversé)** |
| `prefers-reduced-motion` | `FocalScrollPerspective.pose(…, reduceMotion:)` (`:38-42`) | `scene.ts:23-29` | **conforme** |
| chrome escamoté au défilement | `ConversationView.swift:2134-2148, 2160-2184` | néant | **absent** |
| puce : tap | cycle 3 modes (`ReadingModeChip.swift:61`) | ouvre le menu (`reading-mode-chip.tsx:121-124`) | **divergent assumé** (§1.7 de la spec) |
| puce : appui long | menu natif (`:82`) | néant | **absent** |
| menu : 5 lignes + Automatique | `ReadingModeLensSheet.swift:52`, `ReadingModeChip.swift:118-126` | `catalog.ts:12`, `reading-mode-chip.tsx:218-231` | **conforme** |
| raisons motivées des lignes grisées | produites (`:149-185`) mais **non affichées** | affichées (`reading-mode-chip.tsx:210-212`) | **divergent (le web est en avance)** |
| encoche « AUTO » | `ReadingModeChip.swift:63-68` | `reading-mode-chip.tsx:143-150` | **conforme** |
| « AUTO · raison » | jamais rendu | jamais rendu | **absent des deux côtés** |
| libellé VoiceOver composé | `MessageAccessibilityLabelComposer.swift:38-98` | néant | **absent** |
| `lang` sur le texte servi | néant | `focal-row.tsx:197` | **divergent (le web est en avance)** |
| appui long message | `MessageListViewController.swift:1781-1798` | néant | **absent** |
| swipe répondre / transférer | `:1743-1745` | néant | **absent** |
| virtualisation | `UICollectionView` diffable | `useVirtualizer` (`thread.tsx:180-186`) | **conforme** |

---

## 10. Écarts à combler, par visibilité décroissante

| # | écart | source Swift | fichier web | témoin | taille |
|---|---|---|---|---|---|
| 1 | **Focal et Script se distinguent par la mauvaise chose** : le web applique la courbe qu'iOS a retirée, et n'a ni élection, ni carte, ni chips. C'est *l'écran entier* qui diffère de la cible. | `MessageListViewController.swift:3314-3345`, `FocalRow.swift:190-212`, `FocalScrollPerspective.swift:163-213` | `scene.ts`, `perspective.ts`, `focal-row.tsx` | étendre `check-reading-mode.mjs` §10 : au lieu de « transform posée en Focal / absente en Script », exiger **une rangée élue portant carte + bande** et **aucune transform** ; ajouter un `election.test.ts` sur `focusedId`+hystérésis 95 | **grand** |
| 2 | **Un message protégé s'affiche en clair.** `isBlurred` n'est lu que pour la ligne basse ; `isViewOnce` n'est lu nulle part. | `FocalProtectedContent.swift:20-48`, `FocalRow.swift:284-295` | `focal-row.tsx:119` | gate : une fixture `isBlurred:true` ⇒ le texte n'est **pas** dans le DOM lisible / `filter: blur` posé ; tap → révélation 5 s → re-flou | **moyen** |
| 3 | **Les réactions sont inertes** ; l'avatar aussi ; les coches aussi. Trois contrôles qui mentent. | `FocalRow.swift:935-957`, `FocalIdentityHeader.swift:101-108`, `FocalMetaRow.swift:104-118` | `message-blocks.tsx:100-127`, `avatar.tsx` | `check-list-actions.mjs` a le patron : « cliquer change quelque chose » | **moyen** |
| 4 | **Le tap d'un drapeau ne change pas le texte servi** : il ouvre un panneau sous le message, et il est local à la rangée là où iOS l'applique **au groupe**. | `FocalRow.swift:1056-1086`, `:1075-1083` | `focal-row.tsx:204-231`, `message-blocks.tsx:130-186` | gate : cliquer le drapeau `en` change le `lang` **et** le texte des N rangées du groupe | **moyen** |
| 5 | **Heure et coches visibles en permanence** — iOS les masque au repos et les révèle au geste ; c'est la moitié du blanc du fil. | `FocalTimestampRevealState.swift:83-93`, `FocalMetaRow.swift:88-95` | `focal-row.tsx:237-250` | gate : au repos `opacity: 0`, après un `scroll` `opacity: 1`, puis `0` après la fenêtre | **petit** |
| 6 | **Aucun menu d'appui long sur un message, aucun swipe** — répondre, transférer, éditer, supprimer, signaler sont inatteignables. | `MessageListViewController.swift:1733-1798` | (nouveau composant ; réemployer `useRovingMenu`) | gate : long-press/clic-droit ouvre un menu dont l'aperçu est **la rangée plate** | **grand** |
| 7 | **États de message manquants** : supprimé, brûlé, système, appel, édité, épinglé, transféré, éphémère, sticker, lieu, story citée. | `FocalSystemRows.swift`, `FocalRow.swift:365-376`, `:429-436`, `:608-613`, `FocalNonMediaBlock.swift` | `focal-row.tsx`, `message-blocks.tsx` | étendre `check-thread-states.mjs` : une fixture par état, une assertion par état | **grand** |
| 8 | **L'identité est amputée** : ni présence, ni anneau de story, ni humeur, ni fantôme d'anonyme, ni grammaire ✦ ; et le cadre de 34 n'est pas réservé (la liste peut sauter au changement de tête de groupe). | `FocalIdentityHeader.swift:111-161`, `FocalMetrics.swift:200` | `focal-row.tsx:141-156`, `avatar.tsx` | gate : `min-height` de la ligne d'identité = 34 ; pastille de présence rendue selon `presenceOf` (déjà importé, `view/conversation.ts:81`) | **moyen** |
| 9 | **Le chrome ne s'escamote pas au défilement** en rangée plate (en-tête ET composeur, iOS). | `ConversationView.swift:2134-2148, 2150-2184` | `thread.tsx:331-445, 605-607` | gate : après un `scroll` soutenu, `opacity` de l'en-tête et du composeur → 0 ; retour à la pose ; exception si panneau emoji / mentions ouverts | **moyen** |
| 10 | **Cotes divergentes non gardées** : interligne 1,35 vs 1,42 ; drapeaux 4 vs 3 ; espacement méta 8 vs 6 ; filet de citation 4 px vs 2,5 (constante exportée non consommée) ; largeur méta réservée absente. | `FocalMetrics.swift:119, 269, 370, 211, 366` | `metrics.ts`, `focal-row.tsx:196, 162`, `message-blocks.tsx:148, 244` | **élargir `check-curve.mjs`** aux cotes manquantes, **et** exiger que chaque constante exportée de `metrics.ts` ait au moins un consommateur | **petit** |
| 11 | **Le cycle au tap n'existe pas** : Focal↔Script coûte 2 gestes. L'écart est assumé sur le *geste* (appui long inaccessible au web) mais rien ne remplace le **cycle**. | `ReadingModeChip.swift:20-31, 61`, `ConversationView.swift:2420-2429` | `reading-mode-chip.tsx:121-124` | gate : un second contrôle (ou un `Alt+clic`, ou un bouton dédié) fait avancer le mode en **un** geste, clavier compris | **petit** |
| 12 | **D-10 n'écrit rien** : `sync.ts` est un port sans câble. | `services/gateway/src/routes/conversation-preferences.ts:349` | `sync.ts`, `thread.tsx:151-158` | témoin : `selectReadingMode` appelle `pushPreference` sur un transport bouchonné ; `applyRemotePreference` branché sur `user:preferences-updated` | **moyen** |
| 13 | **Le scope du magasin est `'local'`** : deux comptes sur le même navigateur partagent leurs préférences — exactement la fuite que le `sha256` tronqué iOS ferme. | `ConversationViewerIdentityResolver.swift:58-80` | `thread.tsx:39` | témoin : deux scopes distincts ⇒ deux préférences (déjà couvert par `store.test.ts`, il manque le **câblage**) | **petit** |
| 14 | **Aucun libellé VoiceOver composé, aucune action nommée** ; une rangée est lue comme une dizaine d'éléments. | `MessageAccessibilityLabelComposer.swift:38-98`, `FocalRow.swift:91-93, 114-128` | `focal-row.tsx` | portage direct du composeur en TS (fonction pure, testable) + `role="article"`/`aria-label` sur la rangée | **moyen** |
| 15 | **`typing` est codé en dur à `true`** — un indicateur permanent est un indicateur qui ne dit rien ; et il porte une capsule là où iOS le rend plat en Focal/Script. | `MessageListViewController.swift:1114, 3051-3058` | `thread.tsx:57, 574-602` | gate : sans événement de frappe, aucun indicateur ; en rangée plate, pas de capsule | **petit** |
| 16 | **Les trois gates du fil les plus récents ne tournent pas en CI** : `check-reading-mode.mjs`, `check-list-actions.mjs`, `check-shell-dist.mjs`, `check-offline.mjs` ne figurent dans aucun workflow (le composite `bun run gate` n'est délibérément pas lancé, `\.github/workflows/ci.yml:276`). Tout le § 10 ci-dessus est donc gardé **localement seulement**. | — | `.github/workflows/ci.yml:261-285, 611-703` | ajouter les quatre maillons aux étapes qui énumèrent déjà les autres | **petit** |

---

## 11. Contradictions avec `apps/web-v3/decisions.md`

### 11.1 D-7 — « écart assumé avec iOS EN PRATIQUE » ne tient plus tel quel

Texte actuel (`decisions.md:98-100`) :
> « C'est un écart assumé avec iOS **en pratique** — pas en droit : la loi iOS dit la même chose, mais
> son drapeau étant désactivé, ses utilisateurs voient des bulles. La v4 applique la loi telle qu'elle
> est écrite. »

Cette phrase est **exacte sur les faits** (le drapeau naît OFF, `LentilleFeatureFlag.swift:65-67`,
`MeeshyFeatureFlags.swift:22-30`) mais son **statut a changé le 2026-09-08** : la cible n'est plus
« iOS tel que ses utilisateurs le voient » mais « iOS avec ses dernières features **activées** ».
Ce qui en découle, sans rien éditer aujourd'hui :

1. **Ce n'est plus un écart.** Ouvrir en Focal devient la **conformité** à la cible. Le paragraphe
   devrait cesser de se justifier et se contenter de dire que le drapeau est ON par construction sur
   le web (`decision.ts:103`).
2. **Le périmètre s'élargit mécaniquement.** Tant que la cible était « iOS drapeau OFF », la rangée
   plate était un bonus et les manques du § 10 étaient des libertés. Drapeau ON, ils deviennent des
   **écarts** : l'élection et sa carte (#1), le flou (#2), le menu d'appui long (#6), l'escamotage du
   chrome (#9) sont désormais *dans* la cible.
3. **D-8 change de nature de la même façon.** « `summary` et `river` hors périmètre » restait une
   réduction de périmètre ; drapeau ON, `summary` est **dans le catalogue d'un inscrit**
   (`ReadingModeOrchestrator.swift:390`) et la branche 3 de la loi l'élit dès 26 non-lus. Le clamp
   web (`decision.ts:27`) reste juste — « jamais un mode qu'on ne sait pas rendre » — mais la ligne
   « Pas encore disponible sur le web » (`catalog.ts:48`) devient une **dette datée**, pas un choix.

### 11.2 D-19 — juste, et incomplète sur un point mesurable

D-19 (`decisions.md:586-615`) tranche correctement que `script ≠ river` : trois preuves concordantes
(gateway à cinq valeurs, `catalog.ts` à branches séparées, `THREAD_RENDERABLE_MODES`).
Elle affirme ensuite que `script` « n'en diffère que par l'absence de perspective au défilement
(`useThreadPerspective(scroller, mode === 'focal')`, `thread.tsx:195`) — **mécanisme déjà câblé** ».
C'est vrai *du web*, et **faux de la cible** : sur iOS, la perspective n'est pas ce qui distingue les
deux modes, puisqu'elle n'est plus appliquée (`MessageListViewController.swift:3328`,
`apps/ios/decisions.md:328`). Ce qui les distingue est l'**élection** et sa carte. D-19 décrit donc
un mécanisme conforme à un iOS d'avant le 2026-08-24.
Le reste de D-19 est bon, et sa dernière phrase pointe un vrai reste : `showsDeliveryChecks`
(`FocalMetaColumn.swift:74-76`) n'est **pas** extraite dans `meta.ts`. À noter que la règle nommée
n'a de consommateur **ni** côté web **ni** côté iOS (`FocalMetaRow.swift:88` réécrit le prédicat
inline) — c'est une règle éprouvable et non appliquée, des deux côtés.

### 11.3 D-10 — décision écrite, comportement absent

`decisions.md:138` : « La v4 devient le premier client qui écrit ». Aucun appelant de
`pushPreference` (§ 2.4). La décision est **vraie en intention**, fausse en fait ; tant que le câble
manque, elle affirme une capacité que le produit n'a pas.

### 11.4 D-16 — quatre états dessinés, et le mot « états du fil »

D-16 (`decisions.md:363-405`) énumère quatre états : vide, coupure, écrit hors ligne, reprise. Le
titre promet « les états du fil » ; ce sont en réalité les états **de l'envoi et du réseau**.
Manquent les états du **message** (supprimé, système, protégé, éphémère, édité — § 6) et de la
**page** (chargement, erreur). Avec la cible du 2026-09-08, ce périmètre est à rouvrir : c'est
l'écart #7 et l'écart #2.

### 11.5 D-14 — l'import est bon, la **couverture** de ce qu'on n'importe pas ne l'est pas

D-14 justifie que les **lois** viennent de `@meeshy/shared` et que les **cotes** soient dérivées par gate
texte-à-texte. Le raisonnement tient. Mais `metrics.ts` (40 l) ne porte que 7 cotes sur la quarantaine de
`FocalMetrics.swift`, dont deux **exportées sans consommateur** (`AVATAR_FRAME`, `QUOTE_RAIL_WIDTH`).
`check-curve.mjs` ne peut garder que ce qui est écrit : une cote absente de `metrics.ts` ne rougit nulle
part — l'interligne 1,35 ≠ 1,42 en est la démonstration.

### 11.6 Trois docstrings iOS périmées, à ne pas recopier

`LentilleModeMenu.swift:6-9` et `ReadingModeOrchestrator.swift:60-61` (« cinq entrées » pour six) ;
`MessageListViewController.swift:321-326` (« `.focal` n'atteint plus jamais cet hôte », faux depuis le
2026-08-21, `ReadingModeController.swift:105-112`) ; `ConversationView.swift:2398` (un
`ReadingModeDensityButton` supprimé). Aucune n'est un bug de code ; toutes trois sont des **pièges de
lecture** pour qui prendrait le commentaire pour la cible.

---

## Annexe — les cotes citées, et leur domicile

`FocalMetrics.swift` : `Row.paddingVertical 3` (:79) · `paddingHorizontal 16` (:80) · `groupTopPadding 8` (:86, hors token) · `Avatar.size 22` (:93) · `Time 12/.semibold` (:108-112) · `Text.lineHeightRatio 1.42` (:119) · `Text.indent 29` (:122) · `FocusCard` ring 1.5 / radius 16 / marge 3-8 / padding 8-12 (:140-145) · `Scene.restDelay 4.5 s` (:177) · `flattenDuration 0.45 s` (:179) · `enterDuration 0.25 s` (:183) · `Focus.maxCharacters 360` (:195, **sans consommateur**) · `Focus.avatarSize 34` (:200) · `Focus.textIndent 41` (:204) · `Quote.railWidth 2.5` (:211) · `Sticker.side 112` (:223) · `Media.radius 16` (:227) · `FocusStrip` chipHeight 24 / chipMinWidth 32 / chipInset 4 (:245-250) · identityAvatarSize 26 / identityChipHeight 34 / identityNameSize 13.5 (:261-263) · flagLimitPlain 3 / flagLimitMagnified 5 (:269-270) · `HiddenChrome` 94 / 0 / 0.25 / 28 (:279-285) · `Pill` top 72 / fade 280 ms / gap 8 (:295-300) · `Agent` 1.5 / 14 (:313-314) · `MetaText 0.55` les deux thèmes (:343-344) · `MetaColumn.reservedWidth 62` (:366) · `spacing 6` (:370) · `SurfaceTint 0.04/0.06` (:385-386).

`FocalScrollPerspective.swift` : `alphaFloor 0.62` (:29) · `overscanFraction 0.3` (:151) · `focusCardCornerRadius 18` (:163) · `focusCardHorizontalInset 6` (:164) · `focusCardInnerMargin = Row.paddingVertical` (:188) · fills 0.16 / 0.10 (:193-194) · `focusChipFillOpacity` 0.18/0.14/0.42/0.34 (:206-213) · `groupHeadCellTag 1` (:228) · `FocalMagnificationLaw` 4 000 ms (:306) / 1 200 pt·s⁻¹ (:310).

`FocalFocusCurve.swift` : thread 380 / 0.40 / 0.82 (:58-60) · pivot 0.16 (:65) · list 520 / 0.45 / 0.04 (:68-70) · bande liste 140 ± 45 (:89, :93) · bande fil 150 (:100) · hystérésis 95 (:104).
`MessageListViewController.swift` : estimations 150 (rangée plate, :416) / 80 (bulle, :417) · `nearBottomFollowThreshold 200` (:452).

`metrics.ts` : 3 (:17) · 16 (:18) · 8 (:21) · 22 (:24) · 34 (:32, **non consommé**) · 41 (:34) · 2.5 (:37, **non consommé**) · 0.55 (:40).
`perspective.ts` : 380 (:28) · 0.4 (:29) · 0.82 (:30) · 150 (:33).

Les cotes de **police** ne sont pas dans `metrics.ts` : elles passent par les jetons dérivés
`--text-title` / `--text-bubble` / `--text-time` / `--text-mini` / `--text-check`
(`src/styles/ios.css` ← `packages/design-tokens/ios.css` ← `MeeshyColors.swift` / `MeeshyFont`).
Leur correspondance exacte avec `FocalMetrics.Name.size` (= `MeeshyFont.subheadSize`) et
`FocalMetrics.Text.size` (= `MeeshyFont.bodySize`) est **à lire dans `packages/design-tokens/ios.css`** —
elle n'a pas été vérifiée par cette analyse.
