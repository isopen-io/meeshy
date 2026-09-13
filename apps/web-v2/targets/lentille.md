> Dossier des cibles de la v3.1 (issue #5672) — analyse de conception produite le 2026-09-08 sur `claude/web-v3-parite` à `25937d3790`, en lecture seule, contre l'app iOS DRAPEAUX BÊTA ACTIVÉS. Les numéros de ligne cités valent pour ce commit ; `git log --since=2026-09-08 -- <fichier>` dit s'ils ont bougé. Les captures de référence sont dans ce même dossier (`*.png`, `*.a11y.txt`), listées par `README.md`.

# La vue LENTILLE d'iOS, lue dans le code, confrontée à ce que la v3.1 web en sert

Analyse de conception, **lecture seule**, produite le 2026-09-08 sur le worktree
`/Users/smpceo/Documents/v2_meeshy-w3`, branche `claude/web-v3-parite`. Aucun fichier du dépôt n'a
été écrit. La directive porteur du 2026-09-08 pose que la cible de la v3.1 est **l'app iOS avec ses
dernières features ACTIVÉES** — Lentille, Focal, Script, Bulles. Ce document décrit donc la liste de
conversations iOS **drapeau `lentille_list` ON**, puis mesure ce que `apps/web-v2` en implémente.

Toute cote citée vient de `LentilleMetrics.swift`, de `packages/shared/design/lentille-tokens.json`
ou de `packages/design-tokens/` ; là où aucune source n'existe, le texte écrit « à lire dans … »
plutôt que d'inventer un chiffre.

---

## 1. Sources lues

### iOS — `apps/ios/Meeshy/Features/Main/Lentille/**` (5 687 lignes, lu en entier)

| fichier | lignes lues |
|---|---|
| `Core/LentilleMetrics.swift` | 1–312 (intégral) |
| `Core/LentilleFeatureFlag.swift` | 1–231 (intégral) |
| `Core/BetaFeaturesPreference.swift` | 1–102 (intégral) |
| `Core/LentilleSectionResolver.swift` | 1–410 (intégral) |
| `Core/LentilleProviders.swift` | 1–309 (intégral) |
| `Core/LentilleBridgeFormatter.swift` | 1–192 (intégral) |
| `Core/GatewayBridgeProvider.swift` | 1–87 (intégral) |
| `Row/LentilleConversationRow.swift` | 1–959 (intégral) |
| `Row/LentilleBridgeLine.swift` | 1–199 (intégral) |
| `Row/LentilleSkeletonRow.swift` | 1–64 (intégral) |
| `Chrome/StoriesVivantsRail.swift` | 1–460 (intégral) |
| `Chrome/LentilleSectionIdentity.swift` | 1–163 (intégral) |
| `Chrome/LentilleSticker.swift` | 1–99 (intégral) |
| `Chrome/SectionScrollPillHost.swift` | 1–168 (intégral) |
| `Chrome/SectionScrollPill.swift` | 1–65 (intégral) |
| `Mode/LentilleMagnification.swift` | 1–444 (intégral) |
| `Mode/LentilleModeMenu.swift` | 1–256 (intégral) |
| `Mode/LentilleModeLabels.swift` | 1–178 (intégral) |
| `Mode/LentilleReadingModeContext.swift` | 1–307 (intégral) |
| `Mode/LentilleFocusCard.swift` | 1–85 (intégral) |
| `Mode/LentilleFocusBreathing.swift` | 1–64 (intégral) |
| `Perspective/LentillePerspective.swift` | 1–206 (intégral) |
| `Perspective/LentilleFocusElection.swift` | 1–136 (intégral) |
| `Perspective/LentilleFocusElectionHost.swift` | 1–108 (intégral) |
| `Perspective/LentilleSceneActivity.swift` | 1–83 (intégral) |

### iOS — le montage et ses voisins

- `Views/ConversationListView.swift` — 430–500, 590–640, 735–800, 800–880, 940–1060, 1290–1620,
  1620–1910 (les douze sites `LentilleFeatureFlag.isLentilleListEnabled` et ce qu'ils montent).
- `Views/ConversationListView+Rows.swift` — 1–602 (intégral : mux de rang, gestes, portillon `==`).
- `Views/ConversationListView+Overlays.swift` — 70–210 (menu contextuel, sous-menu de mode :174).
- `ViewModels/ConversationListViewModel.swift` — 15–60, 160–185, 635–790.
- `Views/ThemedConversationRow.swift` — 60–100, 127–250, 260–310 (la peau OFF, pour dire ce qui change).
- `Focal/Core/FocalFocusCurve.swift` — 30–175 (constantes de courbe, bande, élection).
- `Focal/Core/FocalMetrics.swift` — 165–200 (`Scene.restDelay` / `flattenDuration` / `enterDuration`).
- `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift` — 7–47, 106–231.
- `packages/MeeshySDK/Sources/MeeshyUI/Theme/DesignTokens.swift` — 29–32 (`MeeshyFont.*Size`).

### Lois partagées et jetons

- `packages/shared/design/lentille-tokens.json` — 1–140 (bloc `list` intégral).
- `packages/shared/utils/focus-curve.ts` — table d'exports (`:20–88`, `:128`, `:163–175`).
- `packages/shared/utils/conversation-sections.ts` — `:59–93`, `:236`, `:352`.
- `packages/shared/utils/reading-modes.ts` — `:22–42`, `:151`, `:191–252`, `:324`.
- `packages/shared/utils/conversation-bridge.ts` — `:24–195`.
- `packages/shared/utils/scroll-activity.ts` — `:29–60`.
- `packages/design-tokens/` — `ios.css` (127 l), `tokens.css` (118 l), `light.css`, `dark.css` :
  **aucun jeton `lentille`/`lens` n'y existe** (grep sans résultat).

### web-v2

`src/routes/conversations.tsx` (1–302, intégral) · `src/components/lens-row.tsx` (1–322, intégral) ·
`src/components/row-actions.tsx` (1–266, intégral) · `src/components/avatar.tsx` (1–93, intégral) ·
`src/lib/lens/law.ts` (1–178) · `src/lib/lens/scene.ts` (1–140) · `src/lib/lens/filters.ts` (1–120) ·
`src/lib/view/conversation.ts` (1–93) · `src/lib/view/row-actions.ts` (1–43) ·
`src/lib/conversation-store.ts` (1–93) · `src/lib/accent.ts` (1–34) · `src/lib/reader.ts` (1–52) ·
`src/lib/api/prism.ts` (1–63) · `src/lib/api/preferences.ts` (:7–80, survol) ·
`src/lib/api/fixtures.ts` (:317–450 + inventaire de champs) · `src/lib/grouping.ts` (:74–76) ·
`scripts/check-lens.mjs` (1–184, intégral) · `scripts/check-curve.mjs` (1–60 + cibles) ·
`scripts/check-list-actions.mjs` (survol structurel) · `apps/web-v2/decisions.md` (D-9, D-14, D-17,
+ index D-1→D-19) · `apps/web-v2/README.md` (survol) ·
`.cache/web-v2-workflow/specs/conversations.md` (1–40, 104–175, 402–468).

### Histoire (survol, jamais comme cible)

`tasks/lentille-implementation-contract.md` et `tasks/lentille-workshop-execution.md` sont cités par
presque chaque doc-comment du dossier (LWS-1…LWS-8, I-060…I-072, M-041…M-048, R-133/R-135, REV-2/3/4,
Q-140). Ils donnent le **vocabulaire** ; les cotes et les comportements de ce document sont tous lus
dans le code.

---

## 2. Le drapeau : ce qui se MONTE quand `lentille_list` est ON

### Le drapeau lui-même

`LentilleFeatureFlag` (`Core/LentilleFeatureFlag.swift:82-101`) porte **trois** cas indépendants —
`.lentilleList`, `.readingModes`, `.riviereMode` — de clés `meeshy.flag.lentille_list`,
`…reading_modes`, `…riviere_mode` (`:103-109`) et de surcharges process `MEESHY_FLAG_LENTILLE_LIST`
etc. (`:111-117`).

La résolution est une cascade à trois étages (`:173-192`) : `environment[key] == "1"` force ON,
`"0"` force OFF ; sinon, si le drapeau est couvert par le programme bêta (`isCoveredByBetaProgramme`
rend `true` pour **les trois** depuis le 2026-08-21, `:167-171`) **et** que sa clé propre n'a jamais
été posée, la valeur est celle de `BetaFeaturesPreference.isEnabled` ; sinon
`defaults.bool(forKey:)`.

`BetaFeaturesPreference` (`Core/BetaFeaturesPreference.swift:34-51`) naît **OFF** (décision produit
du 2026-08-22, `:6-13`), clé `meeshy.pref.beta_features_enabled`, écrite par le toggle « Activer les
bêta » des Réglages (`setEnabled`, `:99-101`). Conséquence : **une installation neuve ne voit pas la
Lentille**, et un seul interrupteur utilisateur allume à la fois liste Lentille, modes de lecture et
Rivière. `enabledFeatures` (`:61-69`) et `resolveAtLaunch` (`:76-85`) journalisent ce qui est actif
sous `me.meeshy.app:beta`.

`ProcessEnvironmentSnapshot.current` (`:229-231`) matérialise l'environnement **une fois** : le
drapeau est lu par rang, par passe de body et par aperçu, et `ProcessInfo.environment` reconstruit
un dictionnaire complet à chaque lecture (audit fluidité 2026-08-21, H1/H2).

### Les douze sites de montage, et ce qu'ils échangent

| site | OFF | ON |
|---|---|---|
| `ConversationListView.swift:445` | `trackedSectionId = nil`, l'`onAppear` du rang ne fait rien | suivi de la section visible activé |
| `:466` `pinnedSectionHeaders` | `[]` — en-têtes NON épinglés | `[.sectionHeaders]` — stickers collants |
| `:604` `sectionHeaderLabel` | `SectionHeaderView` + ses deux paddings | `LentilleSticker` pleine largeur (`:601-605`) |
| `:745` `perspectiveEnabled` | rang rendu NU | `.lentillePerspective` + `.lentilleFocusBreathing` + `.lentilleFocusCandidate` (`:752-759`) |
| `:1309` `lentilleRailOrStoryTray` | `StoryTrayView` | `StoriesVivantsRail` (`:1310-1323`) |
| `:1472` `stickyHeaderInset` | `0`, et le modificateur n'est **pas monté** (`LentilleStickyHeaderInsetModifier`, `:1491-1505`, R-a) | `CollapsibleHeaderMetrics.accessoryCollapsedHeight` = 60 (`CollapsibleHeader.swift:112`) |
| `:1527` `lentilleFocusElectionOverlay` | rien | `LentilleFocusElectionHost` + `LentilleSceneActivityHost` (`:1528-1543`) |
| `:1585` `listTail` | `Color.clear.frame(height: 60)` | `quickActions(minHeight: listTailMinHeight)` — une demi-fenêtre (`:1579-1581`) |
| `:1700` branche squelette | `SkeletonConversationRow()` | `LentilleSkeletonRow()` (`:1701`) |
| `:1716` padding du squelette | `16` | `LentilleMetrics.Row.marginHorizontal` = 8 |
| `:1744` / `:1769` / `:1796` | `EmptyStateView` standard | variante `compact: true`, et `createFirstConversation` devient `quickActions(isEmptyState: true)` |
| `+Rows.swift:258` (le mux de rang) | `ThemedConversationRow(...).equatable()` | `LentilleMagnifiableRow { LentilleConversationRow(…, magnification:) }` |
| `+Overlays.swift:174` | rien | `LentilleReadingModeSubmenu` inséré après « Marquer lu » |
| `ConversationListViewModel.swift:25` | rien | `gatewayBridgeProvider.noteBridges(from:)` à chaque réaffectation de `conversations` |
| `ConversationListViewModel.swift:653` | `legacyGroupConversations` (bit-à-bit d'avant) | `lentilleGroupConversations` → `LentilleSectionResolver` |

Un site est **retiré** : `sectionScrollPillOverlay` rend `EmptyView()` (`:1612-1615`, directive
produit 2026-08-23 — « les sections stick sur place quand on les dépasse »). `SectionScrollPill.swift`
et `SectionScrollPillHost.swift` restent dans l'arbre Xcode, **non montés**, gardés par
`SectionScrollPillTests.test_sectionPill_isNoLongerMounted_…`.

---

## 3. Anatomie de l'écran, de haut en bas

### 3.1 En-tête repliable

`CollapsibleHeaderMetrics` (`CollapsibleHeader.swift:8-9`) : déployée **64**, repliée **44**, et
**60** dès qu'un `titleAccessory` occupe la fente du titre (`accessoryCollapsedHeight`, `:112`, « une
ligne de titre de 44 pt ne peut pas héberger un anneau de 50 »). C'est ce 60 que
`stickyHeaderInset` (`ConversationListView.swift:1471-1472`) retire à la région visible du
défilement, pour que les stickers épinglés se posent SOUS la barre repliée ; `scrollContentTopPadding`
(`:1511-1513`) rend au contenu ce que l'inset lui prend, somme constante = `expandedHeight`.

La ligne d'épinglage globale est mesurée sur le CONTENEUR (`:1884-1888`) : `minY + safeAreaInsets.top
+ stickyHeaderInset`, écrite dans `LentilleSectionPositionRegistry.registerPinLine`.

### 3.2 Rail « vivants & stories »

`StoriesVivantsRail` (`Chrome/StoriesVivantsRail.swift:170-231`). Cotes : pastille **48**, anneau
**3,5**, `≤ 6` entrées, padding vertical **8** (`LentilleMetrics.Rail`, `LentilleMetrics.swift:267-279` ;
jetons `list.rail`, `lentille-tokens.json:83-90`). Le padding vertical a été ajouté sur mesure — le
rail iOS n'en avait aucun là où son jumeau web portait `py-2`, et la jonction rail→premier sticker
valait 0 pt quand toutes les autres valent 8.

- **Pastille « moi »**, hors de la borne des 6 (`LentilleRailSelfEntry`, `:77-117`, rendue par
  `LentilleRailSelfEntryView:238-362`) : anneau `brandPrimary` si story active sinon `textMuted`
  (`:340-342`), badge d'humeur bas-droite qui ouvre le composeur de statut ou rend 💭 (`:299-316`),
  badge **(+)** haut-gauche qui ouvre le composeur de story (`:318-328`), diamètre de badge DÉRIVÉ
  (`ringWidth * 2 + Tags.emojiSize`, `:332-334`). Tap sur l'avatar ⇒ listing « Mes stories »
  (`ConversationListView.swift:1394-1397`).
- **Autres pastilles** (`LentilleRailEntryView:365-460`) : anneau accentué ssi
  `isLive || hasUnviewed` (`LentilleRailPolicy.ringIsAccented`, `:149-151`), couverture de la
  dernière story puis avatar puis initiales (`CachedAvatarImage`, `:446-453`), badge d'humeur animé
  dans la borne des 6 (`:413-423`), libellé sous la pastille en `captionSize` (10 pt).
- **Masqué si vide** — mais « vide » veut dire NI moi NI personne (`:140-142`).
- Le rail est un rail de STORIES : `isLive` est toujours `false`, faute de modèle d'appel
  (`ConversationListView.swift:1405-1410`, écart signalé).

### 3.3 Filtres

`composedFilterChips` (`ConversationListView.swift:1282-1305`) — `ThemedFilterChip` sur
`ConversationFilter.allCases`, `isCompact: true`, multi-sélection par
`ConversationFilterComposition.toggling`. **Non muxé par le drapeau** : identique ON et OFF.

### 3.4 Sections et leur résolution

Sous ON, `lentilleGroupConversations` (`ConversationListViewModel.swift:732-777`) projette chaque
`Conversation` en `SectionableConversation` (`isPinned = isPinned && sectionId == nil`, `categoryId`,
`orderInCategory`, `lastMessageAt`, `updatedAt`, `liveCall: nil`) puis appelle
`LentilleSectionResolver.resolveSections(conversations:categories:now:timeZone:)`.

La loi (`Core/LentilleSectionResolver.swift:374-409`, miroir de
`packages/shared/utils/conversation-sections.ts:352`) partitionne en sections **ordonnées** :
`pinned` → `live` → catégories utilisateur dans l'ordre déclaré → `today` → `yesterday` → `thisWeek`
→ `older` (`TemporalSectionKind.renderOrder`, `:109`). Aucune section vide n'est émise ; la
précédence de classement est épinglée > live > catégorie > temporel (`classify`, `:316-330`), et une
`categoryId` inconnue retombe sur le temporel plutôt que d'ouvrir une section fantôme.

Les seuils temporels : `diffDays == 0` ⇒ today, `== 1` ⇒ yesterday, `<= 6` ⇒ thisWeek, sinon older
(`resolveTemporalSection`, `:282-295`, avec `yesterdayDays = 1`, `thisWeekMaxDays = 6`, `:274-275`).
Le calcul se fait en **jours calendaires** dans un calendrier grégorien FORCÉ au fuseau injecté
(`gregorianCalendar`, `:227-231` ; `daysBetween`, `:270-272`) — jamais `Calendar.current`, jamais une
soustraction d'epoch, pour survivre aux transitions d'heure d'été.

L'ordre total à l'intérieur d'une section (`compareConversations`, `:174-195`) : épinglées → live →
catégorie (`categoryId` puis `orderInCategory`, repli `+∞`) → `lastMessageAt` desc (repli
`updatedAt`) → `id` ordinal. `orderInCategory` est comparé par égalité/ordre et non par soustraction
(`:146-154`) — `∞ − ∞ = NaN` rendrait l'ordre non déterministe.

L'identité des sections propres à la Lentille vit dans `Chrome/LentilleSectionIdentity.swift` :
ids préfixés `lentille.` (`:60-66`), libellés « En direct » / « Aujourd'hui » / « Hier » / « Cette
semaine » / « Plus ancien » en casse normale (`:127-138` — la majuscule est le fait du sticker),
`order` 1 puis 6..9 (`:152-161`), icône et couleur inertes reprises de `MeeshyConversationSection.other`
(`:144-145`). Trois propriétés découlent du préfixe : jamais cible de drop
(`ConversationListView.acceptsSectionDrop`, `:483-485`), jamais repliable
(`isSectionCollapsible`, `:479-481`), et donc sticker non interactif.

### 3.5 Le sticker

`LentilleSticker` (`Chrome/LentilleSticker.swift:20-99`). Cotes `LentilleMetrics.Sticker`
(`LentilleMetrics.swift:239-245`, jetons `list.sticker`) : taille **10,5**, poids `.heavy` (800 CSS),
letter-spacing **0,1 em** dérivé en points (`10.5 × 0.1`, `:96-98`), padding **4 / 13**, texte en
MAJUSCULES par `displayTitle` (`:90`). Fond `MeeshyColors.backgroundSecondary`, encre
`textSecondary` (`:51`, `:79`). Bouton `.plain` quand `onToggle != nil`, sinon simple libellé
(`:36-44`) ; chevron `chevron.down`/`chevron.forward` **seulement** quand repliable (`:67-75`) — le
`.forward` s'inverse de lui-même en RTL. L'épinglage (« sticky ») est une propriété du CONTENEUR :
`LazyVStack(pinnedViews: [.sectionHeaders])` (`ConversationListView.swift:466`, `:446`).

### 3.6 La rangée Lentille, élément par élément

`Row/LentilleConversationRow.swift`. Structure : `HStack(spacing: MeeshySpacing.md)` = avatar +
`VStack(spacing: 2)` de trois lignes — quatre en magnification (`:131-148`).

**Le double cadre** (`:166-167`) — la clé du « zéro relayout » :
```
.frame(height: isMagnified ? LentilleMetrics.FocusInline.height : LentilleMetrics.Row.height)
.frame(height: LentilleMetrics.Row.height)
```
Hauteur VISUELLE 100 en magnification, 84 au repos ; hauteur de LAYOUT toujours 84. SwiftUI ne rogne
pas un enfant plus grand que son cadre : la magnification déborde de 8 pt de chaque côté, exactement
dans les marges que la respiration vient d'ouvrir.

| élément | cote / police / couleur | source |
|---|---|---|
| hauteur de rang | **84** (64 → 84 le 2026-08-22 : trois lignes) | `LentilleMetrics.swift:35`, jeton `list.row.height` |
| padding | **8 / 16** vertical/horizontal | `:36-37`, `:149-150` de la rangée |
| marge latérale / verticale | **8 / 8** | `:38`, `:44` |
| radius | **16** (non peint : la peau est plate) | `:45` |
| transform-origin | **16 % / 50 %** | `:48-50` |
| hauteur magnifiée | `Row.height + 2 × marginVertical` = **100** | `FocusInline.height`, `:211` |
| avatar | **44** (`AvatarContext.conversationHeaderCollapsed`), anneau **1,5** à l'accent, opacité **0,55** | `:56-64`, rendu `:258-279` |
| pastille de présence | **11**, bordure **2,5**, aucun point hors ligne | `:70-73` |
| nom | **15** (`MeeshyFont.bodySize`), poids `.heavy` (800) | `:80-84` ; `DesignTokens.swift:32` |
| heure | **12**, poids `.bold` | `:87-91` |
| ligne 2 | **13** (`MeeshyFont.subheadSize`), poids `.regular` | `:94-98` ; `DesignTokens.swift:31` |
| point de non-lu | **8** — **plus aucun consommateur iOS** depuis le lot 2 | `:100-117` |
| pastilles d'étiquette | **6**, `≤ 3` ; émoji favori **11** ; chip magnifiée **8** | `:284-297` |
| sourdine | opacité **0,55** | `:302-303` |
| encoche de mode | **9,5**, poids `.black` (900) | `:228-233` |
| anneau agent | **1,5**, pointillé | `:309-311` |

**Avatar** (`:258-279`) : un `Circle().strokeBorder(accent.opacity(0.55), lineWidth: 1.5)` de
diamètre `44 + 2×1.5`, superposé à `LentilleRowAvatar` (`:776-846`) — qui est un `MeeshyAvatar` avec
`storyState`, `moodEmoji`, `presenceState` (posée seulement si aucun mood — la règle « un coin, mood
gagne, présence sinon » vit dans `MeeshyAvatar`, `:828-838`), un `onTap` routé vers profil (direct)
ou infos (groupe), et un menu contextuel de 3 rôles (`ConversationAvatarMenu`, `:789-817`).

**Pastille de présence pendant la frappe** (`:125-127`) : `typingUsername != nil ⇒ .online` — forcé
au niveau du rang, jamais dans l'avatar. La règle est re-prouvée à cinq endroits du document
normatif (`:113-124`).

**Ligne de titre** (`headerLine`, `:283-367`), dans l'ordre : 📌 si épinglée (`:290-294`) → nom
(`Name.font`, `textPrimary`, `lineLimit(1)`, `layoutPriority(1)`) → **🔕 si en sourdine**
(`:305-309`) → émoji de réaction/favori (`:313-317`) → pastilles d'étiquettes colorées si NON
magnifiée (`:322-324`, rendues `:447-456`) → puis, exclusivement : soit le badge d'appel en cours
+ bouton « Rejoindre » (`:331-336`), soit `Spacer` + `UnreadCountBadge` — **l'atome partagé**, jamais
une copie locale (`:360-364`).

**Ligne 2** — précédence `typing > brouillon > pont ✦ > aperçu`, décidée par une loi pure
`Line2Kind.resolve(hasTyping:hasDraft:showsBridge:)` (`:502-511`), rendue par `line2` (`:521-540`) :
- *typing* : « X écrit… » en italique à l'accent + trois points pulsés
  (`LentilleTypingDots`, `:878-905`), désactivés par Reduce Motion et au repos à la phase HAUTE ;
- *brouillon* : « Brouillon : » en `MeeshyColors.error` + le texte en `textSecondary` (`:555-569`) ;
- *pont ✦* : `LentilleBridgeLine` (voir §3.7) ;
- *aperçu* : `previewLine` (`:586-694`) avec **cinq** formes — `expired` (`timer.badge.xmark`),
  `hidden` (`eye.slash`), `viewOnce` (`flame`, à l'accent), `ephemeralActive` (`timer`), `standard` ;
  et dans `standardPreview` (`:635-694`) trois branches de plus — texte (« Auteur : message » en UN
  SEUL `Text` concaténé, préfixe teinté accent semibold, `:646-656`, `:700-711`), pièce jointe
  (`AttachmentDisplay` + « +N », `:657-678`), localisation (`mappin.and.ellipse`, `:679-689`), sinon
  vide. `lineLimit(isMagnified ? 2 : 1)` (`:655`).

**Ligne 3 — la date SEULE, à droite** (`dateLine`, `:383-418`). Le flanc gauche est vide au repos ;
c'est là qu'atterrit le surplus de la magnification. Le glyphe d'outbox ⟳ a été RETIRÉ de cette ligne
(amendement L09, confirmé porteur le 2026-08-23, `:374-378`). La couleur du timestamp est
**toujours** `textMuted` — `timestampColor` (`:469-471`) ignore délibérément `unreadCount` et
`accent`, en divergence explicite avec `ThemedConversationRow.timestampColor` : « le rang plat ne
bascule plus JAMAIS sur le rouge ». Au repos, le texte est un relatif court qui ticke à la minute
via `TimelineView(.periodic(from:by:60))`, et seulement tant que le libellé change
(`LentilleRowTimestamp`, `:854-870`) ; en magnification, la date COMPLÈTE
(`LentilleFocusCard.fullTimestamp` → `FocalFocusTimestamp.listLabel`, « Aujourd'hui à 5:49 »,
« Mardi à 23:50 », `Mode/LentilleFocusCard.swift:65-77`).

**États sourdine / épingle / sélection / drag** : `rowOpacity` (`:105-111`) compose
`Muted.opacity (0,55)` et le retour de drag (`0,8`) — appliqué au **rang entier** (`:168`).
Sélection iPad : une barre latérale accent de 3 pt, jamais un fond (`:171-178`), plus le trait
`.isSelected` d'accessibilité (`:189`).

**Le portillon `==`** (`:743-764`) : copié de `ThemedConversationRow.==` puis étendu à `bridge`
(comparé en toutes lettres alors que `renderFingerprint` le replie déjà) et à
`LentilleMagnification.rendersIdentically` — les fermetures de la magnification en sont exclues
(elles changent d'identité à chaque passe de body).

### 3.7 La ligne de pont ✦ et son formateur

`Row/LentilleBridgeLine.swift:24-141`. Apparition : `showsBridge = unreadCount > 0 && bridge != nil`
(`LentilleConversationRow.swift:93-95`). Deux étages :
- `kind == .fallback` → `LentilleBridgeFormatter.formatBridge(data:t:)` avec un `t` iOS concret
  (`LentilleBridgeTranslator`, `:151-199`, huit clés `lentille.bridge.*` en `%@`/`%d` positionnels) ;
- `kind == .agent` → `resolveAgentText` (`:125-140`), qui applique la MÊME descente que
  `resolvedLastMessagePreview` à la paire `bridge.translations` / `bridge.originalLanguage`, et
  peint la ligne en `MeeshyColors.indigo400` (`:64-66`).

Le suffixe de partialité « sur les N derniers messages » n'apparaît que si `isComplete == false`
(`:50-55`, `:98-101`). `resolveAriaText` (`:114-119`) compose EXACTEMENT ce que l'œil voit, et
`LentilleConversationRow.accessibilityLabel` (`:227-254`) **remplace** le segment d'aperçu du libellé
hérité par ce texte, ou l'ajoute en queue à défaut (défaut Q-140/L16-iOS).

`Core/LentilleBridgeFormatter.swift` est le miroir Swift EXACT de
`packages/shared/utils/conversation-bridge.ts` : `buildBridgeData` (`:89-132`) exclut les messages du
lecteur, déduplique les auteurs **par `senderId`** dans l'ordre d'apparition, en nomme deux au plus
et bascule le reste dans `extraAuthorCount`, et n'émet `mediaCounts` que s'il y a un média (chaque
compteur ABSENT plutôt que `0`) ; `formatBridge` (`:141-150`) joint auteurs · messages · médias par
` · ` et ne connaît AUCUNE langue.

Les producteurs : `LocalBridgeProvider` (calcul local sur cache, `Core/LentilleProviders.swift:113-165`)
et `GatewayBridgeProvider` (relais pur du champ `bridge` du payload, `Core/GatewayBridgeProvider.swift:36-87`),
alimenté par le `didSet` de `ConversationListViewModel.conversations` (`:25-27`).

### 3.8 Le squelette

`Row/LentilleSkeletonRow.swift:24-64` — géométrie EXACTE du rang réel (mêmes `LentilleMetrics.Row`,
même avatar 44), trois lignes de texte REDACTED construites depuis les MÊMES polices
(`Name.font`, `Line2.font`, `Time.font`), zéro littéral propre. Monté par
`ConversationListView.swift:1700-1701`, six exemplaires, `staggeredAppear(baseDelay: 0.04)`, padding
horizontal muxé à `Row.marginHorizontal` (`:1716-1718`) pour qu'aucun saut latéral n'ait lieu à
l'hydratation.

### 3.9 La pastille de section au défilement — RETIRÉE

`SectionScrollPill` (`Chrome/SectionScrollPill.swift:22-65`, ancrée `top 64`, fondu **250 ms**,
cotes `LentilleMetrics.Pill`, `:250-262`) et son hôte
(`Chrome/SectionScrollPillHost.swift:74-168`, loi `ScrollTimePillLaw` partagée avec le fil, sonde
réarmée à l'échéance exacte) **ne sont plus montés** — `ConversationListView.swift:1612-1615` rend
`EmptyView()`. Motif mesuré : 81 % de recouvrement de bande avec le sticker épinglé, pour zéro
information de plus (`:1600-1606`). `LentilleSectionPositionRegistry` (`SectionScrollPillHost.swift:29-72`)
survit et continue d'alimenter la ligne d'épinglage.

---

## 4. Les lois

### 4.1 Perspective au défilement

`Perspective/LentillePerspective.swift:95-180`. C'est une passe **de compositor, PURE, SANS ÉTAT**,
posée par `.visualEffect` (iOS 17+ ; sur iOS 16 le rang est rendu tel quel, `:151`, `:176-178`). Elle
n'écrit QUE `opacity` et `scaleEffect` (`:172-174`), avec l'ancre `UnitPoint(0.16, 0.5)`
(`transformOrigin`, `:110-112`, lue dans `LentilleMetrics.Row`). Un dossier entier est gardé contre
`.font(`, `.offset(`, `blur(`, `rotationEffect(` — `LentillePerspectiveCurveTests` scanne
dynamiquement `Lentille/Perspective/*` (cité par `Mode/LentilleFocusCard.swift:5-15`).

La courbe est le miroir gelé `FocalFocusCurve.focusCurve(distance:variant: .list)`
(`Focal/Core/FocalFocusCurve.swift:133-152`) :
`f = min(1, d/520)`, `alpha = clamp(1 − 0,45·f + fonduSousBande)`, `scale = 1 − 0,04·f`, avec
`fonduSousBande = −0,35 · clamp(−d/160)` pour `d < 0` (`:68-70`, `:78-81`). Constantes :
`listMaxDistance 520`, `listAlphaDecay 0,45`, `listScaleDecay 0,04`,
`listBelowBandDistance 160`, `listBelowBandAlphaCap 0,35`.

**Une règle de consommation propre à la liste** (`:129-135`) : la courbe est appliquée à la distance
**ABSOLUE**, parce que la bande est au centre — appliquer le fondu court « sous la bande » du miroir,
pensé pour une bande en bas d'écran, effacerait la moitié de la liste.

Reduce Motion ⇒ identité `(1, 1)` (`:130`), l'élection étant conservée.

### 4.2 La bande de focus — et la cote qu'elle n'utilise PAS

`LentilleFocusBand` (`Perspective/LentillePerspective.swift:24-51`) :
`offsetFromTop(relayOffset:) = −relayOffset` (`:40-42`), et
`centerY(viewportTop:viewportBottom:offsetFromTop:)` = **le centre de la région visible**, sauf près
du haut de la liste où la bande part du bord haut et descend linéairement jusqu'au centre sur la
première demi-hauteur de défilement (`:44-50`).

**Point à retenir** : `FocalFocusCurve.focusBandOffset = 140` (`Focal/Core/FocalFocusCurve.swift:89`)
est cité par les doc-comments de `LentillePerspective.swift:9` et
`LentilleFocusElectionHost.swift:33`, mais n'apparaît **dans aucun calcul** de la Lentille (grep :
trois occurrences, toutes en commentaire ou dans sa propre déclaration). La cote effectivement
consommée est `focusBandHalfHeight = 45` (`:93`), comme hystérésis
(`LentilleFocusElectionHost.swift:105`). Le centre de bande iOS est donc `(haut + bas) / 2`, sans
retrait de 140.

### 4.3 Élection, hauteur fixe, double frame

`LentilleFocusCandidateRegistry` (`Perspective/LentilleFocusElection.swift:26-50`) est une boîte
**inerte** : les rangs y écrivent leur `midY` global à chaque layout via `onGeometryChange`
(`:112-135`) sans déclencher aucune invalidation ; `onDisappear` les retire.

`LentilleFocusElection` (`:74-95`) publie `electedId` **au seul changement** (`adopt` gardé par
l'inégalité, `:91-94`), avec `willSet { objectWillChange.send() }` plutôt que `@Published` (interdit
sur une classe `nonisolated`).

`LentilleFocusElectionHost` (`Perspective/LentilleFocusElectionHost.swift:39-108`) est une
`Color.clear` non hit-testable posée sur le CONTENEUR : deux points d'entrée seulement — l'amorçage
`onAppear` et le tick d'offset du relais existant (`:57-61`). **Rien n'observe le modèle** : un
`message:new` pendant que le pouce est immobile ne ré-élit personne — propriété de STRUCTURE
(`:25-30`). La décision revient à `FocalFocusCurve.electFocusRow` avec hystérésis 45
(`:101-106`) : le courant garde la main tant que son `midY` reste dans `focusY ± 45` (borne
INCLUSIVE), sinon le plus proche gagne, départage par `id` croissant.

### 4.4 Activité de scène

`Perspective/LentilleSceneActivity.swift:21-83`. `level` ∈ [0,1] est publié **deux fois par session
de défilement** : montée animée à l'entrée (`FocalMetrics.Scene.enterDuration = 0,25 s`), retour à
plat après `restDelay = 4,5 s` sans tick, sur `flattenDuration = 0,45 s`
(`Focal/Core/FocalMetrics.swift:172-183`). `offset` est une boîte inerte relue par frame dans
`visualEffect`, jamais publiée (`:28`).

`blend(_:level:)` (`:60-66`) fond la pose vers l'identité : `level = 0` ⇒ Script (rien),
`level = 1` ⇒ la loi telle quelle. C'est ce que `LentillePerspective.pass` applique (`:131-134`).
Directive porteur du 2026-08-21, tenue telle quelle : « le cadre apparaît quand on scrolle, au repos
il disparaît ».

### 4.5 Respiration

`Mode/LentilleFocusBreathing.swift:15-64`. Translation de compositor SEULE (`.visualEffect` →
`.offset(y:)`, `:45`). `push(distance:level:reduceMotion:)` (`:24-29`) :
rampe `clamp((|d| − 36) / 40)`, direction opposée au signe, amplitude
`LentilleMetrics.FocusCard.breathing`. Cette amplitude est **écrêtée à la marge** :
`breathing = Row.marginVertical = 8` (`LentilleMetrics.swift:185`) — à 18 pt pour une marge de 8, une
rangée poussée mangeait la marge et mordait le header suivant de 9,6 pt mesurés à deux frontières,
et l'arithmétique bouclait (`18 − 8 − (88 − h)/2 = 9,6` pour `h = 87,3`, `:170-180`).
`breathingRampStart = 36`, `breathingRampLength = 40` (`:188-189`).

### 4.6 Magnification EN PLACE

Directive produit du 2026-08-23, deux messages (`Mode/LentilleFocusCard.swift:17-52`) : « pas de
bordure, on complète juste les informations, directement sur le row existant » puis « le mode
magnificence doit permettre le swipe gauche et droite comme le mode normal ». La seconde a tranché
l'ARCHITECTURE : une couche posée SUR la rangée ne peut pas tenir les deux promesses — ou elle est
transparente aux touches et ses pastilles ne sont pas actionnables, ou elle prend les touches et
avale swipe, glisser-déposer et appui long. `LentilleFocusCard` la vue et `LentilleFocusCardHost`
ont donc été **dissous** ; il ne reste de ce fichier que deux lois pures (date complète, précédence
du pont).

Ce que la rangée élue gagne (`Mode/LentilleMagnification.swift:34-58` pour le contexte) :

1. **Une ligne AU-DESSUS du titre** (`LentilleMagnifiedTopLine`, `:70-106`) — la **pastille de
   catégorie ACTIONNABLE** (`LentilleCategoryPill`, `:120-179` : un `Menu` qui déplace la
   conversation, libellé « Classer » sans catégorie, teinte de la catégorie), puis les **étiquettes
   NOMMÉES ACTIONNABLES** (`LentilleTagChip`, `:187-248` : filtrer / retirer le filtre / supprimer
   le tag ; liseré BLANC de `FocusCard.ringSize` quand ce tag filtre), puis « +N » au-delà de 3.
   `LentilleTagChip` est **le SEUL écrivain** de `ConversationListViewModel.activeTagFilter` de toute
   l'app (`:184-186`).
2. **L'aperçu coule sur DEUX lignes** (`LentilleConversationRow.swift:655`).
3. **La ligne de date accueille** la **pastille de mode de lecture** (`LentilleModePill`, `:263-342`)
   et, hors direct, la **chip d'effectif ACTIONNABLE** qui ouvre la feuille des participants
   (`LentilleMemberCountChip`, `:353-395`) ; et la date passe du relatif court à la date complète
   (`LentilleConversationRow.swift:390-402`, `:430-442`).

Aucune bordure, aucun fond, **aucun agrandissement** : `FocusInline.avatarContext = Avatar.context`
(44, `LentilleMetrics.swift:221`) — « un avatar qui passe de 44 à 52 sous le doigt, c'est précisément
le changement senti que la directive interdit ». `FocusCard.avatarContext` (52) et
`FocusCard.height` (124) restent des miroirs du jeton pour la peau WEB, sans consommateur iOS
(`:119-190`).

Le portillon d'élection est `LentilleMagnifiableRow` (`Mode/LentilleMagnification.swift:423-444`),
une enveloppe minuscule qui s'abonne seule à l'élection et à la scène :
**`isMagnified = scene.level > 0 && election.electedId == conversationId`** (`:435-437`) — donc **au
repos, la rangée élue redevient une rangée comme les autres**. La fabrique est typée `(LentilleMagnification?)
-> LentilleConversationRow`, un type CONCRET, jamais un générique ni un `AnyView` (famille de crashs
« type-metadata », `:418-422`).

### 4.7 Contexte de mode de lecture — ce que la LISTE sait du mode du FIL

`Mode/LentilleReadingModeContext.swift:19-171` est le SEUL traducteur `Conversation` app →
entrées de `ReadingModeOrchestrator` (miroir gelé de `packages/shared/utils/reading-modes.ts`) :
- `orchestratorType` rabat `community`/`channel`/`bot` sur `.group` (`:33-43`) ;
- `activeParticipantCount` rend **`nil`** — INCONNU, jamais `0` (`:65-67`) : le `0` était défendable
  pour l'éligibilité (seuil `>= 5`, faux négatif au pire) mais faisait dire « 0 aujourd'hui » à des
  conversations pleines de monde ;
- `capabilities` (`:131-145`) et `decision` (`:151-170`) appellent `resolveCapabilities` /
  `resolveOrchestratorDecision`, avec `lastOpenedAt = userState.lastReadAt` (`:119`) et `now`
  injecté.

Le magasin est **partagé avec le fil ouvert** : `LentilleScopedReadingModePreferenceStore`
(`:211-295`) est un pur ADAPTATEUR qui résout le scope d'identité par
`ConversationViewerIdentityResolver` et délègue à `ReadingModePreferenceStore` (F-080). Avant
l'arbitrage REV-3/B2, deux magasins disjoints coexistaient et la clé de la liste n'avait **aucun
préfixe d'identité** — deux comptes du même appareil partageaient leurs préférences (`:175-210`).
Aucune migration des anciennes clés, et c'est motivé : migrer une clé non scopée vers une clé scopée
re-commettrait la fuite dans le geste même censé la refermer. Point d'accès :
`LentilleReadingModePreferenceCenter.shared` (`:305-307`).

### 4.8 Menu de mode — SIX entrées, pas cinq

`Mode/LentilleModeMenu.swift`. Le doc-comment annonce cinq entrées (`:6-9`) ; **le code en construit
six** : `order = [.auto, .focal, .script, .bulles, .resume, .riviere]` (`:83`, amendement du
2026-08-21 « Focal est de retour et Bulles devient un choix »). Pour chacune (`:84-121`) :
- `.auto` toujours sélectionnable (l'orchestrateur a toujours un repli) ;
- `.bulles` toujours sélectionnable drapeau ON (choix de RENDU hors loi) ;
- les autres désactivées ssi `!capabilities.availableModes.contains(mode)` — la borne réelle,
  jamais une seconde loi d'éligibilité ;
- `disabledReason` **uniquement** pour Rivière **et uniquement tant qu'elle est grisée** (`:117-119`).

Les libellés sont une source unique (`Mode/LentilleModeLabels.swift:36-79`) : « Auto », « Focal »,
« Script », « Résumé », « Rivière », « Bulles », clés `lentille.mode.name.*`. L'encoche compose
« AUTO · <décision> » quand la préférence est `.auto`, sinon le nom du mode forcé seul
(`notchText`, `:119-130`), avec **hiérarchie serveur puis local** : `bridge?.suggestedMode` prime
quand il est présent, `decision.mode` n'est que le repli (`:109-118`). La raison Rivière a **trois**
formes vivantes (`riverReason`, `:153-177`) : « jamais en conversation directe » (`.neverEligible`),
le seuil seul quand le compte est inconnu, la formule à deux nombres sinon.

Le rendu (`LentilleModeMenu`, `:156-208`) est une LISTE de `Button(.plain)`, jamais un `Menu`
lui-même : elle se compose aussi bien dans un `Menu {}` natif que dans un popover. La raison de
grisage voyage DANS le titre et la coche de sélection est EMBARQUÉE dans le texte (`\u{2713}`,
`:186-187`) — un `Menu` natif ne garantit pas la mise en page d'un item à deux images.

Deux portes, un magasin : la pastille de la rangée magnifiée (`LentilleModePill`) et
`LentilleReadingModeSubmenu` (`:227-256`), monté après « Marquer lu » dans le menu contextuel
(`ConversationListView+Overlays.swift:174-179`). L'ancienne troisième porte (`LentillePeekView`) a
été supprimée le 2026-08-21. `LentilleModeMenuActions.select` (`:134-144`) est le point d'écriture
UNIQUE, optimiste.

---

## 5. États

| état | iOS drapeau ON | source |
|---|---|---|
| **vide — aucun compte** | `quickActions(isEmptyState: true, conversationCount: 0)` — les mêmes accès rapides que la queue de liste | `ConversationListView.swift:1796-1800` |
| **vide — recherche** | `EmptyStateView(icon: magnifyingglass, …, compact: true)` + `.padding(.top, 60)` | `:1744-1759` |
| **erreur de synchro à froid** | `EmptyStateView(exclamationmark.arrow.triangle.2.circlepath, …, compact: true, onAction: forceRefresh)` | `:1769-1791` |
| **chargement (cache froid)** | six `LentilleSkeletonRow()` en apparition échelonnée, marge 8 | `:1698-1719` |
| **pagination** | `ConversationPaginationFooter` : spinner `.loadingMore`, « tout chargé » si > 30, retry `.error`, sentinelle invisible `.idle` | `+Rows.swift:541-601` |
| **hors-ligne** | pas de branche dédiée ; l'outbox pousse `userState.hasPendingSync`, rendu par ⟳ dans la peau OFF (`ThemedConversationRow.swift:169-175`) et **retiré** de la peau Lentille (amendement L09) | `LentilleConversationRow.swift:374-378` |
| **sourdine** | rang entier à 0,55 **et** glyphe 🔕 après le nom | `:105-111`, `:168`, `:305-309` |
| **épinglée** | 📌 avant le nom **et** section « Épingles » en tête | `:290-294` ; `ConversationListViewModel.swift:764-765` |
| **archivée** | corpus SÉPARÉ (`filterConversations`, gate `:598-601`) ; swipe « Désarchiver » | `ConversationListView.swift:985-998` |
| **non lue** | `UnreadCountBadge` chiffré à droite du nom ; le point accent 8 px est retiré ; le timestamp NE devient PAS rouge | `:360-364` ; `LentilleMetrics.swift:105-114` ; `:469-471` |
| **en frappe** | ligne 2 « X écrit… » italique accent + points pulsés, **et** présence forcée verte | `:542-553`, `:125-127` |
| **présence** | 11 pt, bordure 2,5, **aucun point hors ligne** ; groupes inclus (agrégat), mood prime | `LentilleMetrics.swift:70-73` ; `:828-838` |
| **appel en direct** | badge ● pulsé + « N voix · depuis X » + bouton « Rejoindre » — jamais rendu aujourd'hui (`liveCall` toujours `nil`) | `:917-959` ; `ConversationListViewModel.swift:748` |

---

## 6. Gestes

| geste | effet observable | source |
|---|---|---|
| **tap sur la rangée** | ouvre le fil ; si verrouillée, présente la feuille de PIN | `ConversationListView.swift:826-833` |
| **tap sur l'avatar** | direct ⇒ profil ; groupe ⇒ infos conversation — les gestes de l'avatar sont PRIORITAIRES, la bande avatar est exclue de la surface de tap de la rangée (`avatarInteractionExclusionWidth`) | `LentilleConversationRow.swift:839` ; `+Rows.swift:343-345`, `:435-440` |
| **appui long sur l'avatar** | menu contextuel propre à l'avatar (infos / profil / lien de partage) — n'ouvre PAS le menu de la ligne | `:789-817` ; `+Rows.swift:113-117` |
| **appui long sur la rangée (iOS 26+)** | `.contextMenu` NATIF Liquid Glass + **aperçu = carte des derniers messages** (`ConversationPreviewView`, largeur 340, chargement à l'ouverture) | `+Rows.swift:139-174` |
| **appui long (< iOS 26)** | overlay custom, `RowPressBounceModifier` : réduction 0,90 au touch-down, rebond ressort au déclenchement 0,4 s, annulation au scroll > 10 pt | `+Rows.swift:388-474` |
| **contenu du menu** | Épingler · Silence · Rechercher · Appeler (direct) · — · Marquer lu/non lu · **Mode de lecture** (sous-menu) · Détails · Renommer · Favori (8 emoji) · … | `+Overlays.swift:79-210` |
| **glisser-déposer** | `.onDrag` publie l'id ; les headers décident via `ChipDropResolver` — **jamais** sur une section `lentille.` | `+Rows.swift:136-138` ; `ConversationListView.swift:483-485` |
| **swipe leading** | Épingler/Désépingler · Silence/Son · Verrouiller/Déverrouiller | `ConversationListView.swift:945-978` |
| **swipe trailing** | Archiver/Désarchiver · Marquer lu/non lu · Bloquer/Débloquer (direct) · Masquer | `:980-1040` |
| **défilement** | perspective (opacité + échelle), respiration des voisines, élection de la magnifiée, entrée de scène 0,25 s, aplatissement 4,5 s après le dernier tick | §4 |
| **pull-to-refresh** | `MeeshyRefreshableScroll` — rafraîchit conversations + stories + statuts + communautés en parallèle | `:1629-1636` |
| **défilement infini** | `triggerLoadMoreIfNeeded` 5 rangs avant la queue + sentinelle `.idle` | `:1045-1060` ; `+Rows.swift:592-598` |

---

## 7. Accessibilité, telle que le Swift la déclare

- **Un élément combiné par rangée** : `.accessibilityElement(children: .combine)`, libellé
  `accessibilityLabel`, indice `accessibility.opens_conversation`, trait `.isButton`, plus
  `.isSelected` sur iPad (`LentilleConversationRow.swift:180-189`).
- **Le libellé** réutilise `ThemedConversationRow.conversationAccessibilityLabel`
  (`ThemedConversationRow.swift:262-306` : « conversation avec X », aperçu RÉSOLU par le Prisme,
  horodatage relatif, compte de non-lus pluralisé, sourdine, épinglage, synchro en attente) puis
  **remplace** le segment d'aperçu par le texte du pont ✦ quand celui-ci est visible
  (`LentilleConversationRow.swift:227-254`). Un pont absent rend `base` caractère pour caractère.
- **Ce qui est décoratif** : 📌, 🔕, l'émoji de réaction, les pastilles d'étiquette, le timestamp, les
  points de frappe, le chevron du sticker — tous `.accessibilityHidden(true)`
  (`:294`, `:308`, `:316`, `:455`, `:417`, `:903` ; `LentilleSticker.swift:74`).
- **Les contrôles internes sont des `Button(.plain)`, jamais des `.onTapGesture`** — règle dure du
  workshop : un `.onTapGesture` interne est avalé par le long-press du conteneur
  (`LentilleConversationRow.swift:479-481` ; `Mode/LentilleMagnification.swift:350-352` ;
  `Chrome/StoriesVivantsRail.swift:162-166`).
- **Libellés des affordances magnifiées** : catégorie (`:177`), tag (`:246`), mode (`:320`),
  effectif (`accessibilityLabel` « Participants » + `accessibilityValue` = effectif, `:388-393`).
- **Menu de mode** : chaque entrée compose titre + raison + « sélectionné »
  (`Mode/LentilleModeMenu.swift:200-207`).
- **Rotor < iOS 26** : deux actions d'accessibilité — ouvrir la conversation, et « Ouvrir le menu »,
  seul accès non visuel à épingler/sourdine/archiver (`+Rows.swift:188-200`).
- **Rail** : chaque pastille porte le nom de la personne ; l'entrée « moi » porte un `actionLabel`
  tenu de la MÊME règle que son routage, pour que libellé et destination ne divergent pas
  (`Chrome/StoriesVivantsRail.swift:86-91`, `:253`).
- **Reduce Motion** : perspective ⇒ identité (`LentillePerspective.swift:130`), respiration ⇒ 0
  (`LentilleFocusBreathing.swift:25`), points de frappe figés à la phase HAUTE
  (`LentilleConversationRow.swift:889-898`), badge d'appel non pulsé (`:930-936`).
- **Dynamic Type** : **toutes** les polices passent par `MeeshyFont.relative(size, weight:)`
  (`LentilleMetrics.swift:83`, `:90`, `:97`, `:151` ; `LentilleSticker.swift:50` ; etc.) — donc
  échelonnées par le réglage système.
- **Cibles tactiles** : aucune cote de 44 pt n'est déclarée pour les chips de la magnification
  (padding 6/2 sur une police de 8–9,5 pt, `LentilleMetrics.swift:288-296`). **À lire dans** une
  mesure au simulateur : ce document ne peut pas l'affirmer depuis la source.
- **RTL** : `chevron.forward` plutôt que `.right` (`LentilleSticker.swift:64-66`), et la bande
  d'exclusion de l'avatar se miroite d'elle-même par le `HStack` (`+Rows.swift:369-371`).

---

## 8. Ce que web-v2 a DÉJÀ, élément par élément

| élément iOS (fichier:ligne) | web-v2 (fichier:ligne) | verdict |
|---|---|---|
| Drapeau `lentille_list`, défaut OFF, programme bêta (`LentilleFeatureFlag.swift:173-192`) | aucun drapeau — la Lentille est la seule peau (`decisions.md:111-129`) | divergent (assumé, D-9 — voir §10) |
| Hauteur de layout 84, hauteur visuelle 100, double `frame` (`LentilleMetrics.swift:35`, `:211` ; `LentilleConversationRow.swift:166-167`) | `ROW_HEIGHT = 84`, `VISUAL_HEIGHT = 100`, `OVERHANG = 8`, `top: -8` (`lens-row.tsx:45-49`, `:171-174`) | **conforme** |
| `transform-origin: 16% 50%` (`LentilleMetrics.swift:48-50`) | `transformOrigin: '16% 50%'` (`lens-row.tsx:181`) | **conforme** |
| Courbe `.list` 520 / 0,45 / 0,04 + sous-bande 160 / 0,35 (`FocalFocusCurve.swift:39-51`, `:133-152`) | `law.ts:31-37`, `:58-67` — gardée octet par octet par `scripts/check-curve.mjs` | **conforme** |
| Élection à hystérésis 45, départage par `id` (`FocalFocusCurve.swift:93` ; `LentilleFocusElectionHost.swift:94-107`) | `electFocus` (`law.ts:80-106`), `hysteresis: BAND_HALF_HEIGHT` (`scene.ts:97`) | **conforme** |
| Bande = **centre** de la région visible, rampe depuis le bord haut (`LentillePerspective.swift:44-50`) ; `focusBandOffset` inutilisé | `frameBottom: box.bottom - BAND_OFFSET` (**−140**) puis `bandCenter` (`scene.ts:74-78`, `law.ts:114-127`) | **divergent** : la bande web est 70 px plus haut |
| Respiration 8 / 36 / 40, translation seule (`LentilleMetrics.swift:185-189` ; `LentilleFocusBreathing.swift:24-29`) | `BREATHING/RAMP_START/RAMP_LENGTH` 8/36/40 (`law.ts:144-146`, `:166-178`) — gardés par `check-curve.mjs` | **conforme** (loi) |
| Respiration **appliquée** à chaque rangée par `visualEffect` | `scene.ts:100-108` écrit `translateY(breath) scale(p.scale)` sur `firstElementChild` | **conforme** |
| Scène : `level` monte en 0,25 s, retombe **4,5 s** après le dernier tick, `blend` vers l'identité (`LentilleSceneActivity.swift:37-66` ; `FocalMetrics.swift:172-183`) | `REST_MS = 220` (`scene.ts:53`), `level` **jamais appliqué à la perspective** (`scene.ts:102` appelle `perspective(distance)` sans `level`) | **divergent** : au repos, la perspective iOS s'aplatit, la web reste appliquée |
| Magnification liée à la scène : `scene.level > 0 && electedId == id` (`LentilleMagnification.swift:435-437`) | `magnified: focus === c.id` (`conversations.tsx:200`) | **divergent** : la rangée reste magnifiée au repos |
| Reduce Motion ⇒ opacités 1, élection conservée (`LentillePerspective.swift:130`) | `REDUCED_MOTION()` (`scene.ts:44-45`, `:102-103`), prouvé par `check-lens.mjs:138-163` | **conforme** |
| Zéro relayout au défilement (double frame + `visualEffect`) | prouvé au navigateur réel : `offsetTop` et `offsetHeight` invariants sur 5 paliers (`check-lens.mjs:110-117`) | **conforme, et mesuré** |
| Sections 7 buckets ordonnés + stickers collants (`LentilleSectionResolver.swift:374-409` ; `LentilleSticker.swift` ; `ConversationListView.swift:466`) | **aucune section, aucun sticker** — six chips de filtre (`filters.ts:21-33` ; `conversations.tsx:155-182`) | **absent** |
| Tri total partagé (`sortConversations`, `LentilleSectionResolver.swift:204-208`) | `orderConversations` appelle `sortConversations` de `@meeshy/shared` (`filters.ts:87-105`) | **conforme** |
| Corpus archivé séparé (`filterConversations:598-601`) | `applyFilter` exclut les archivées de tous les corpus sauf `archived` (`filters.ts:52-71`) | **conforme** |
| Nom 15 pt `.heavy` (`LentilleMetrics.swift:80-84`) | `text-title` = `--ios-font-subhead` = **13 px** (`ios.css:65` ; `design-tokens/ios.css:77`), `font-black`/`font-bold` (`lens-row.tsx:226`) | **divergent** : 13 au lieu de 15 |
| Ligne 2 à 13 pt (`LentilleMetrics.swift:94-98`) | `text-body` = `--text-md` = **17 px** (`app.css:92` ; `design-tokens/tokens.css:33`) (`lens-row.tsx:272`) | **divergent** : 17 au lieu de 13 — et **plus gros que le nom** |
| Heure 12 pt `.bold` (`LentilleMetrics.swift:87-91`) | `text-check` = `--ios-font-caption` = **10 px** (`ios.css:62`) (`lens-row.tsx:259`) | **divergent** |
| Toutes les polices échelonnées (`MeeshyFont.relative`) | jetons en **px** (`design-tokens/ios.css:75-91`, `tokens.css:33`) | **divergent** : pas d'échelle de texte |
| Avatar 44 + anneau accent 1,5 @ 0,55 (`LentilleConversationRow.swift:258-266`) | `Avatar size={44}` sans anneau accent (`lens-row.tsx:186-193`) | divergent (l'anneau manque) |
| Pastille de présence 11 pt, bordure 2,5, aucun point hors ligne (`LentilleMetrics.swift:70-73`) | `dot = size × 0.26` = 11,44 ; `boxShadow 0 0 0 2px`; `showsDot = presence !== 'offline'` (`avatar.tsx:49-53`, `:77-90`) | conforme sur la règle, **divergent** sur la bordure (2 au lieu de 2,5) |
| Présence **des groupes** (agrégat) (`LentilleConversationRow.swift:828-838`) | pastille servie **seulement** aux directs (`lens-row.tsx:192`) | **absent** |
| Frappe force la présence verte (`:125-127`) | aucun typing sur la liste (grep : uniquement `thread.tsx:57`) | **absent** |
| Anneau de story + badge d'humeur sur l'avatar (`:819-844`) | absent | **absent** |
| Menu contextuel de l'avatar, 3 rôles (`:789-817`) | absent | **absent** |
| 📌 avant le nom (`:290-294`) | glyphe `pushPin` **après** le titre (`lens-row.tsx:248-250`) | divergent (position) |
| 🔕 après le nom (`:305-309`) | **aucun glyphe** — `sr-only` « En sourdine » + `chromeFade` (`lens-row.tsx:251-257`) | **divergent** (et le doc-comment web affirme l'inverse — §10) |
| Sourdine = opacité 0,55 sur le **rang entier** (`:105-111`, `:168`) | 0,55 sur le **chrome seul**, titre et aperçu à encre pleine (`lens-row.tsx:87-108`) | divergent, **assumé et motivé** (contraste AA mesuré 3,74:1 / 2,80:1) |
| Émoji de réaction / favori (`:313-317`) | absent | **absent** |
| Pastilles d'étiquettes 6 px, ≤ 3, au repos (`:447-456`) | absent (`preferences.ts:15` mentionne `tags` sans les rendre) | **absent** |
| `UnreadCountBadge`, atome partagé (`:360-364`) | `<span data-unread>` accent, h 20, min-w 20 (`lens-row.tsx:303-316`) | conforme dans l'esprit |
| Timestamp **toujours** `textMuted`, jamais accentué sur non-lu (`:469-471`) | `color: unread ? var(--accent) : ink-3` (`lens-row.tsx:260`) | **divergent** — la règle iOS est explicitement l'inverse |
| Timestamp = relatif court, ticke à la minute (`:854-870`) | `time()` = `HH:MM` absolu, jamais rafraîchi (`grouping.ts:74-76`) | **divergent** |
| La date vit sur une **troisième ligne**, à droite (`:383-418`) | l'heure vit sur la ligne de titre (`lens-row.tsx:258-263`) | **divergent** |
| Ligne 2 : précédence `typing > brouillon > pont ✦ > aperçu` (`:502-540`) | aperçu seul (`lens-row.tsx:271-285`) | **absent** (3 des 4 branches) |
| Aperçu : 5 formes (expiré / masqué / vue unique / éphémère / standard) + 3 sous-branches (`:586-694`) | texte seul (`lens-row.tsx:275-285`) | **absent** |
| Préfixe « Auteur : » teinté accent, semibold, concaténé (`:646-656`, `:700-711`) | `${displayName} : ` en encre courante, uniquement pour les groupes (`lens-row.tsx:275`) | divergent |
| Prisme sur l'aperçu de liste (`resolvedLastMessagePreview`, `:574-576`) | `served()` sur `lastMessageTranslations` + `lang` sur le texte servi (`lens-row.tsx:122-127`, `:284` ; `prism.ts:38-63`) | **conforme, et plus complet** (l'attribut `lang`) |
| Prisme du lecteur, 4 rangs ordonnés | `resolveUserLanguagesOrdered` (`reader.ts:49-52`) | **conforme** |
| Accent de conversation calculé par la loi partagée | `conversationAccentPalette` (`accent.ts:26-30`), posé en `--accent` | **conforme** |
| Pont ✦ complet (`LentilleBridgeLine.swift`, `LentilleBridgeFormatter.swift`, providers) | **rien** (grep `bridge` dans `apps/web-v2/src` : zéro) | **absent** |
| Magnification : catégorie ACTIONNABLE (`LentilleMagnification.swift:120-179`) | chip statique « Groupe »/« Direct » (`lens-row.tsx:213-218`) | **absent** — un libellé de type, pas un contrôle |
| Magnification : étiquettes NOMMÉES actionnables (`:187-248`) | absent ; un glyphe « Archivée » à la place (`lens-row.tsx:219-221`) | **absent** |
| Magnification : pastille de mode de lecture (`:263-342`) | absent de la liste (`ReadingModeChip` existe mais n'est monté qu'au fil) | **absent** |
| Magnification : chip d'effectif actionnable → participants (`:353-395`) | `· {memberCount} membres` en texte (`lens-row.tsx:299`) | **absent** — texte inerte |
| Magnification : date COMPLÈTE « Mardi à 23:50 » (`LentilleFocusCard.swift:65-77`) | `new Date(at).toISOString().slice(0,10)` = `2026-09-08` (`lens-row.tsx:298`) | **divergent** — ni localisé, ni le bon format, et UTC |
| Magnification : aperçu sur 2 lignes (`:655`) | `line-clamp-2` quand magnifiée (`lens-row.tsx:272`) | **conforme** |
| Supplément non lu / non cliquable au repos | `aria-hidden`, `pointerEvents: none`, `height: 0`, `opacity: 0` (`lens-row.tsx:204-222`, `:288-300`) | **conforme, et bien fait** |
| Swipes leading/trailing (9 actions max) (`ConversationListView.swift:945-1040`) | menu ancré, 4 actions (`row-actions.ts:32-43` ; `row-actions.tsx:76-266`) | divergent **assumé** (D-17) ; verrou / blocage / masquage **absents** |
| Menu contextuel d'appui long, 10 items + aperçu des derniers messages (`+Overlays.swift:79-210` ; `+Rows.swift:139-174`) | **absent** (aucun `contextmenu`/long-press dans `apps/web-v2/src`) | **absent** |
| Actions à EFFET | store optimiste zustand (`conversation-store.ts:61-77`) ; effet prouvé par `check-list-actions.mjs` | **conforme** |
| Glisser-déposer vers une section | absent (pas de sections) | absent |
| Rail stories : entrée « moi » + (+) + humeur, ≤ 6, anneau non-vu/live, couverture (`StoriesVivantsRail.swift:170-460`) | rail d'**accès rapide** : toutes les conversations non archivées, avatar 72 dans une tuile de 88, anneau si non lu, lien vers le fil (`conversations.tsx:121-153`) | **absent** — objet différent, pas des stories |
| Squelette de chargement (`LentilleSkeletonRow.swift`) | absent (fixtures synchrones, spec §6 l. 408) | **absent** |
| État d'erreur / hors-ligne (`ConversationListView.swift:1761-1793`) | absent | **absent** |
| Deux états vides distincts | `emptinessOf` + deux blocs (`filters.ts:116-120` ; `conversations.tsx:234-271`) | **conforme** (et iOS n'a pas cette distinction aussi nette) |
| Queue de liste = accès rapides, demi-fenêtre (`:1579-1590`) | `<li aria-hidden height: 50dvh>` vide, conditionnée à `visible.length > 0` (`conversations.tsx:225`) | divergent : la hauteur est là, **le bloc d'actions est absent** |
| En-tête repliable 64/44/60 + inset des stickers (`CollapsibleHeader.swift:8-9`, `:112` ; `:1471-1505`) | en-tête statique `pt-3 pb-2` (`conversations.tsx:73-98`) | **absent** |
| Pull-to-refresh (`:1629-1636`) | absent | **absent** |
| Pagination / défilement infini (`:1045-1060` ; `+Rows.swift:541-601`) | absent — 4 conversations de fixture | **absent** |
| Barre de recherche | iOS : `ConversationListBottomBar`, masquée au défilement descendant (`:1897-1910`) | web : barre basse permanente (`conversations.tsx:274-299`) | divergent mineur |
| Boutons d'en-tête (nouvelle conversation, lien de partage) | RETIRÉS plutôt que laissés inertes (`conversations.tsx:85-97`) | **conforme à la charte**, écart de feature assumé |
| Jetons Lentille partagés (`lentille-tokens.json`, 24 cotes) | **aucun jeton `lentille` dans `packages/design-tokens/`** ; les cotes vivent en littéraux TS (`law.ts:31-155`, `lens-row.tsx:45-49`) | **divergent** — `check-curve.mjs:93-103` ne garde que **quatre** cotes iOS (respiration ×3, sourdine), plus les constantes de courbe lues dans `focus-curve.ts` |

---

## 9. Les écarts à combler, par ordre de ce que l'utilisateur voit en premier

**1. La hiérarchie typographique est inversée.** L'aperçu (17 px) est plus gros que le nom (13 px),
là où iOS pose nom 15 / aperçu 13 / heure 12.
*Swift* : `LentilleMetrics.swift:80-98` + `DesignTokens.swift:29-32` ; jetons `list.name.size: 15`,
`list.line2.size: 13`, `list.time.size: 12` (`lentille-tokens.json:29-40`).
*Web* : `src/styles/ios.css:62-68`, `packages/design-tokens/ios.css:75-91`,
`src/components/lens-row.tsx:226`, `:259`, `:272`.
*Témoin* : étendre `scripts/check-curve.mjs` d'une partie « typographie de rangée » qui lit
`lentille-tokens.json` (source déjà partagée) et compare aux valeurs calculées des trois classes ;
doublé d'une mesure `getComputedStyle` dans `check-lens.mjs`. **Taille : petit.**

**2. Au repos, la liste ne s'aplatit pas.** iOS retire perspective ET magnification 4,5 s après le
dernier tick ; la v3.1 laisse la dernière pose écrite dans le style et la rangée élue magnifiée pour
toujours.
*Swift* : `LentilleSceneActivity.swift:25-66` ; `FocalMetrics.swift:172-183` ;
`LentilleMagnification.swift:435-437` ; `LentillePerspective.swift:129-135`.
*Web* : `src/lib/lens/scene.ts:53`, `:100-115` (le `level` ne touche que `breathing`) ;
`src/routes/conversations.tsx:200`.
*Témoin* : dans `check-lens.mjs`, après un défilement puis 5 s d'immobilité, exiger
`opacity === 1` partout et zéro `.lens-extra[aria-hidden="false"]` ; puis re-défiler et exiger le
retour. **Taille : moyen** (il faut publier `level` vers React, ou animer l'aplatissement en CSS).

**3. La bande de focus n'est pas au même endroit.** Web retranche `BAND_OFFSET = 140` du bas du
cadre avant de prendre le centre ; iOS prend le centre de la région visible, sans retrait — la cote
140 est citée en commentaire et n'entre dans aucun calcul.
*Swift* : `LentillePerspective.swift:44-50` ; `FocalFocusCurve.swift:89` (déclarée) et grep
`focusBandOffset` = 3 occurrences, toutes documentaires.
*Web* : `src/lib/lens/scene.ts:74-78` ; `src/lib/lens/law.ts:40`, `:114-127`.
*Témoin* : un cas dans `src/lib/lens/law.test.ts` fixant `bandCenter` sur un cadre connu, plus une
mesure dans `check-lens.mjs` : le `midY` de la rangée magnifiée doit tomber à ± 45 px du centre de la
liste. **Taille : petit** (une ligne), mais **à trancher** : c'est iOS qui ignore sa propre constante.

**4. Le rang n'a que sa ligne d'aperçu.** Ni frappe, ni brouillon, ni pont ✦, ni les cinq formes
d'aperçu (expiré / masqué / vue unique / éphémère / pièce jointe / position).
*Swift* : `LentilleConversationRow.swift:502-540` (la précédence pure), `:586-694` (les formes) ;
`LentilleBridgeLine.swift:24-141` ; `LentilleBridgeFormatter.swift:89-192` ;
loi partagée `packages/shared/utils/conversation-bridge.ts:86`, `:195`.
*Web* : `src/components/lens-row.tsx:271-285` ; fixtures à enrichir (`src/lib/api/fixtures.ts:325`).
*Témoin* : `bun test` sur une loi pure neuve `src/lib/lens/line2.ts` (`resolve(hasTyping, hasDraft,
showsBridge)` — vecteurs identiques à `Line2Kind.resolve`) + un test de rendu par forme ; le pont
s'importe de `@meeshy/shared/utils/conversation-bridge` (déjà prouvé importable, cf.
`filters.ts:1`). **Taille : grand.**

**5. La magnification promet quatre contrôles et n'en sert aucun.** Catégorie, étiquettes, mode de
lecture et effectif sont ACTIONNABLES sur iOS ; le supplément web rend un libellé de type, un glyphe
d'archive, un compte de membres en texte et une date ISO.
*Swift* : `LentilleMagnification.swift:120-179` (catégorie), `:187-248` (tags), `:263-342` (mode),
`:353-395` (effectif) ; `LentilleModeMenu.swift:77-123` (les six entrées) ;
`LentilleFocusCard.swift:65-77` (la date complète).
*Web* : `src/components/lens-row.tsx:204-222`, `:288-300` ; le menu à réutiliser existe déjà
(`src/lib/view/roving-menu.ts`, `src/lib/view/popover.ts`, `src/components/reading-mode-chip.tsx`).
*Témoin* : étendre `scripts/check-list-actions.mjs` — ouvrir le menu de mode depuis la rangée
magnifiée, choisir « Script », vérifier que le libellé de la pastille change ET que
`reading-mode/store.ts` a écrit ; pour l'effectif, vérifier qu'un panneau s'ouvre. La règle est celle
de la charte : **un contrôle sans effet est absent.** **Taille : grand.**

**6. Aucune section, aucun sticker collant.** L'écran perd « Épingles », « En direct » et les quatre
bornes temporelles, et avec elles la seule structure qui dit *quand* une conversation a parlé.
*Swift* : `LentilleSectionResolver.swift:374-409` (déjà disponible en TS :
`packages/shared/utils/conversation-sections.ts:352`) ; `LentilleSectionIdentity.swift:54-162` ;
`LentilleSticker.swift:20-99` ; `ConversationListView.swift:466`, `:601-605`, `:479-485`.
*Web* : `src/routes/conversations.tsx:189-272` (la `<ul>` plate) ; `src/lib/lens/filters.ts:87-105`
(qui n'appelle aujourd'hui que `sortConversations`).
*Témoin* : `bun test` sur `resolveConversationSections` appliqué aux fixtures (vecteurs partagés
`packages/shared/fixtures/reading-modes/sections.vectors.json`) ; puis, dans `check-lens.mjs`, exiger
qu'un sticker reste à `position: sticky` en tête pendant le défilement, et que le critère
d'invariance de `offsetTop` reste vert avec les en-têtes insérés. **Taille : grand** (les stickers
changent la géométrie que `check-lens.mjs` mesure).

**7. Le rail n'est pas le rail.** iOS sert stories + vivants, entrée « moi » d'abord avec (+) et
badge d'humeur, ≤ 6 autres, anneau accentué sur non-vu. Le web sert un « accès rapide » qui duplique
la liste sous une autre forme, sans borne.
*Swift* : `StoriesVivantsRail.swift:121-152` (la politique pure), `:238-362` (l'entrée « moi »),
`:365-460` (les autres) ; `ConversationListView.swift:1310-1323`, `:1336-1455` ;
cotes `LentilleMetrics.swift:267-279`.
*Web* : `src/routes/conversations.tsx:121-153`.
*Témoin* : `bun test` sur une loi pure `railPolicy` (troncature à 6, masquage si vide, anneau
accentué) — miroir exact de `LentilleRailPolicy` ; le rendu se prouve par capture regardée tant
qu'aucune route « stories » n'existe. **Taille : moyen** (la politique est petite ; l'objet
« stories » dépend d'un écran qui n'existe pas — ouvrir l'issue compagnon plutôt que simuler).

**8. L'heure ment deux fois.** Elle est absolue là où iOS est relatif et vivant, et elle passe à
l'accent sur non-lu là où iOS a explicitement retiré cette bascule.
*Swift* : `LentilleConversationRow.swift:458-471` (le commentaire dit la règle : « le timestamp
rouge sur non-lu est supprimé, l'heure reste TERTIAIRE ») ; `:854-870` (le ticker 60 s).
*Web* : `src/lib/grouping.ts:74-76` ; `src/components/lens-row.tsx:258-263`.
*Témoin* : `bun test` sur un formateur relatif partagé (`RelativeTimeFormatter` n'a pas de jumeau TS
— **à lire dans** `apps/ios/.../RelativeTimeFormatter.swift` avant de choisir entre port et
`Intl.RelativeTimeFormat`) ; plus une assertion de couleur dans `check-list-actions.mjs` : marquer
« Non lu » ne doit **pas** changer la couleur de l'heure. **Taille : petit.**

**9. Le squelette, l'erreur et le hors-ligne n'existent pas.** La spec les a explicitement différés
au lot `staging` (l. 408-409) ; sous la directive du 2026-09-08 ce sont des états de la cible.
*Swift* : `LentilleSkeletonRow.swift:24-64` ; `ConversationListView.swift:1698-1719`, `:1761-1793`.
*Web* : `src/routes/conversations.tsx:226-271`.
*Témoin* : `check-lens.mjs` étendu — servir une page dont la source de données tarde, exiger six
placeholders de **84 px** (la même case, donc zéro saut à l'hydratation). **Taille : moyen.**

**10. Ni pull-to-refresh, ni pagination.** Avec 4 conversations de fixture, rien ne le montre ; avec
le transport réel, la liste s'arrête à sa première page.
*Swift* : `ConversationListView.swift:1629-1636`, `:1045-1060` ; `+Rows.swift:541-601`.
*Web* : `src/routes/conversations.tsx:189` (la `<ul>` sans sentinelle).
*Témoin* : à écrire avec le lot réseau ; d'ici là, une issue. **Taille : moyen.**

**11. L'appui long n'ouvre rien.** Le menu d'actions est un bouton ; iOS sert le même contenu (et
neuf items de plus) par appui long, avec un aperçu des derniers messages. La spec l'annonçait
pourtant (« long-press Android/QEMU via `contextmenu` », l. 411) — aucun gestionnaire n'existe.
*Swift* : `+Rows.swift:139-174` ; `+Overlays.swift:79-210`.
*Web* : `src/components/row-actions.tsx:159-221` (le bouton, à doubler d'un `oncontextmenu` sur le
`<li>`).
*Témoin* : `check-list-actions.mjs` — dispatcher `contextmenu` sur une rangée, exiger `role="menu"`
visible, et vérifier que le retour matériel Android referme le menu avant de quitter l'écran.
**Taille : petit.**

**12. Le texte ne s'échelonne pas.** Les jetons sont en `px` ; iOS passe tout par
`MeeshyFont.relative`.
*Web* : `packages/design-tokens/ios.css:75-91`, `tokens.css:33` (générés — la correction est dans le
générateur, `packages/design-tokens/scripts/`).
*Témoin* : `check-tokens.mjs` étendu — aucun jeton de police en `px` ; puis une mesure à
`font-size: 20px` sur `<html>` dans `check-lens.mjs` prouvant que la rangée reste lisible (le budget
de 84 px devra être arbitré : c'est le point qui rend cet écart NON trivial). **Taille : moyen**, et
il touche la cote binaire de #9 ci-dessus.

**13. Détails de peau, à solder ensemble** (chacun petit) : anneau d'accent 1,5 @ 0,55 autour de
l'avatar (`LentilleConversationRow.swift:258-266`) ; bordure de pastille de présence 2,5 et non 2
(`LentilleMetrics.swift:72` vs `avatar.tsx:86`) ; 📌 **avant** le nom (`:290-294`) ; 🔕 après le nom
(`:305-309`) ; émoji de réaction (`:313-317`) ; pastilles d'étiquettes 6 px (`:447-456`) ; la date
sur sa propre troisième ligne (`:383-418`) ; le préfixe « Auteur : » teinté accent (`:700-711`).
*Témoin* : un test de rendu par élément + une capture regardée aux deux schémas.

---

## 10. Contradictions et questions avec `decisions.md` (et la spécification du tour 1)

### D-9 — ce que la directive du 2026-09-08 change à son texte

D-9 se termine ainsi (`apps/web-v2/decisions.md:128-129`) :

> *« Écart assumé avec iOS, où le drapeau `lentille_list` est désactivé par défaut : les
> utilisateurs iOS ne voient pas la lentille, les utilisateurs web la verront. »*

Le **fait** reste exact : `BetaFeaturesPreference` naît OFF (`BetaFeaturesPreference.swift:6-13`,
`:42-51`) et `lentille_list` sans clé propre suit la bêta (`LentilleFeatureFlag.swift:167-192`) —
une installation neuve n'a pas la Lentille.

Ce qui change est le **rôle** de cette phrase. Écrite le 2026-09-07, elle sert d'écart assumé : la
v3.1 fait autrement qu'iOS, et c'est acceptable parce que personne ne voit la Lentille côté iOS. Sous
la directive du 2026-09-08 — la cible est iOS **avec** ses dernières features **activées** — cette
justification ne tient plus dans un sens, et la phrase se scinde en deux affirmations de statut
différent :

- **La première moitié reste vraie et devient une note d'exploitation** : pour comparer, il faut
  activer le drapeau (Réglages → Bêta, ou `MEESHY_FLAG_LENTILLE_LIST=1`). Toute capture iOS de
  référence prise sans ce geste montre `ThemedConversationRow`, c'est-à-dire la peau **en cartes** —
  exactement ce que D-9 dit de remplacer.
- **La seconde moitié cesse d'être un écart et devient une avance.** « Les utilisateurs web la
  verront » ne dispense plus de rien : la référence est le comportement **flag ON**, et tout ce que
  ce comportement monte (sections + stickers, pont ✦, quatre affordances actionnables de
  magnification, aplatissement au repos, squelette Lentille, rail stories, queue d'accès rapides)
  entre dans le périmètre de parité, au lieu d'être hors sujet.

Il y a en outre une **conséquence non écrite** de D-9 qu'il faudra assumer explicitement : sans
drapeau, la v3.1 n'a **aucun moyen de revenir en arrière**. iOS peut couper la Lentille d'un
interrupteur si une régression apparaît ; le web ne le peut pas. Le paragraphe « cette feature n'a
pas de demi-livraison » (`:117-122`) est donc plus contraignant qu'il n'y paraît — il vaut aussi pour
chaque écart de la §9.

**Aucun de ces points ne demande d'éditer D-9 aujourd'hui** (ce document est en lecture seule) : ils
demandent un amendement daté, ou une décision D-20 qui dit « la cible est iOS flag ON » et range
D-9:128-129 comme historique.

### D-17 — sa justification est fausse sur les faits, sa conclusion reste bonne

`decisions.md:433-438` écrit :

> *« L'épinglage se VOIT sur la rangée. iOS n'en a pas besoin : il range les épinglées dans une
> SECTION nommée. »*

**iOS peint bien un 📌 sur le rang plat**, avant le nom : `LentilleConversationRow.swift:290-294`,
commentaire « behaviour-matrix:L07 — l'épingle ajoute un glyphe 📌 avant le nom (vol.5 §5.3, re-preuve
ligne 296/361 du document normatif : “📌/🔒 avant le nom”) ». La section ET le glyphe coexistent.
La conclusion de D-17 (mettre un glyphe) est donc **plus juste que son raisonnement** — mais le
raisonnement, tel qu'écrit, justifie aussi l'abandon des sections, et c'est cette moitié-là qui
tombe avec la directive du 2026-09-08 (§9, écart 6).

Même remarque, plus nette, sur **la sourdine**. `apps/web-v2/src/lib/lens/law.ts:149-155` affirme :

> *« le SEUL rendu de la sourdine sur la peau Lentille (contrat §4.3, cité par
> `LentilleConversationRow.rowOpacity`) : pas de glyphe cloche sur le rang plat »*

et la spécification du tour 1 le répète mot pour mot (`.cache/web-v2-workflow/specs/conversations.md`
l. 108-109). **C'est faux** : `LentilleConversationRow.swift:305-309` rend `Text("🔕")` après le nom,
avec le commentaire « affordance manquante à l'audit, contrat §4.3 “muted” ». Les deux textes web
citent le contrat, pas le code — et le contrat est antérieur au correctif.

### La spécification du tour 1, écrite sans capture iOS drapeau ON

Elle le dit elle-même (`§0` et `§7.3` : « capture iOS indisponible »), et cela se voit à trois
endroits :

1. **Elle a été écrite depuis les ACTIONS, pas depuis le dossier `Lentille/`.** Ses références iOS
   sont `ConversationListView.swift:945-1040`, `+Rows.swift:113-216`, `ConversationListQuickActions.swift`
   — c'est-à-dire le montage. Résultat : le pont ✦, la magnification actionnable, la scène et son
   aplatissement, les sections/stickers, le squelette et le rail **n'apparaissent nulle part dans la
   spec**. Ce ne sont pas des oublis d'exécution : ils n'ont jamais été mis au périmètre.
2. **Une cote y est fausse.** §1.3 l. 116-118 : « la cote de rangée web reste 84 — l'écart avec les
   64 iOS est ASSUMÉ et déjà arbitré ». Il n'y a **aucun écart** : `LentilleMetrics.Row.height = 84`
   depuis le 2026-08-22 (`LentilleMetrics.swift:28-35`, jeton `list.row.height: 84`,
   `lentille-tokens.json:5`). Le « 64 » vient d'un doc-comment périmé recopié dans
   `lens-row.tsx:12`. La conclusion (84) est juste, la raison ne l'est pas — et une raison fausse
   fait rouvrir une décision déjà bonne.
3. **Elle est juste, et scrupuleuse, sur ce qu'elle a couvert.** Le corpus archivé (Q7), le refus
   des contrôles inertes (Q2, Q6), la garde `markRead` documentée pour le split-view (Q8), le choix
   du menu contre le swipe motivé sur deux axes (Q4), la mesure de poids avant/après (D-14) : c'est
   du travail solide, et `check-list-actions.mjs` prouve les effets plutôt que les intentions. Le
   défaut n'est pas dans son exécution ; il est dans sa borne.

### Deux points de conception à trancher, qui ne sont dans aucune décision

- **`law.ts` justifie la copie de la loi par l'impossibilité d'importer `@meeshy/shared`**
  (`law.ts:5-27` : « ce paquet dépend de `@prisma/client` et de `zod` »). Or `filters.ts:1`,
  `accent.ts:1`, `reader.ts:1`, `prism.ts:1-4`, `avatar.tsx:1` et `view/conversation.ts:1` **importent
  déjà** `@meeshy/shared` par sous-chemin, et D-14 mesure le coût (3,6 Ko, hors première peinture,
  `decisions.md:270-281`). La copie de `focus-curve.ts` reste défendable (elle est gardée), mais son
  **motif écrit est démenti par six fichiers voisins** : à réécrire, ou à remplacer par un import.
- **Les cotes de la Lentille n'ont pas de jeton web.** `packages/design-tokens/` ne contient aucune
  entrée `lentille`/`lens` (grep vide) alors que `packages/shared/design/lentille-tokens.json` porte
  24 cotes et que `LentilleMetrics.swift` en est explicitement le miroir Swift, verrouillé valeur par
  valeur par `LentilleMetricsTests`. Côté web, **quatre** d'entre elles seulement sont gardées, par
  extraction textuelle du Swift (`check-curve.mjs:93-103` : `marginVertical`, `breathingRampStart`,
  `breathingRampLength`, `Muted.opacity`) ; les autres (hauteur 84, avatar 44,
  présence 11/2,5, sticker 10,5/0,1 em/4-13, rail 48/3,5/6, tags 6/≤3/11, encoche 9,5) sont des
  littéraux TypeScript libres. **La question** : générer `lentille.css` depuis le JSON partagé — le
  dispositif existe déjà pour la palette (`ios.css`, généré depuis `MeeshyColors.swift`, D-4) — ou
  étendre `check-curve.mjs` au JSON entier ? Le premier fait disparaître les littéraux ; le second
  les tolère et les garde.
