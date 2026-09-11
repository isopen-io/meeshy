> Dossier des cibles de la v3.1 (issue #5672) — analyse de faisabilité produite le 2026-09-08 sur `claude/web-v3-parite` à `fa980709f0`, en lecture seule, contre l'app iOS DRAPEAUX BÊTA ACTIVÉS. Les numéros de ligne cités valent pour ce commit. Captures : `thread.summary.*` dans ce dossier.

# Le Résumé Vivant (`summary`) — analyse de conception et de faisabilité pour `apps/web-v2`

Analyse en LECTURE SEULE. Dépôt `/Users/smpceo/Documents/v2_meeshy-w3`, branche `claude/web-v3-parite`.
Objet : décider si le mode de lecture RÉSUMÉ de l'app iOS peut entrer TOUT DE SUITE au périmètre de la v3.1
web, et donc si D-8 (`apps/web-v2/decisions.md:102`) se rouvre.

---

## 0. VERDICT DE FAISABILITÉ IMMÉDIATE

### **OUI SOUS CONDITION.**

Le Résumé Vivant est, dans la partie qui compte, **entièrement CALCULÉ LOCALEMENT depuis les messages déjà
chargés**. Il n'existe aucun endpoint « summary », « digest », « episode » ou « living » dans la passerelle,
et aucun type partagé de ce nom — parce qu'il n'en faut aucun. Le seul appel réseau est un ENRICHISSEMENT
optionnel dont l'échec est déjà un no-op silencieux. La condition n'est donc pas technique : elle est de
CORPUS et de SESSION.

### Les données nécessaires

| ce qu'il faut | d'où | existe ? |
|---|---|---|
| comptes (messages, personnes, langues, médias) | les messages en mémoire | **local** — `DeterministicDigestBuilder.swift:22-61` |
| épisodes (segmentation + titre) | les mêmes messages, fonction pure | **local** — `EpisodeSegmenter.swift:38-51` |
| rampe « Ils t'attendent » | dérivée de `digest.awaitingYou`, pure | **local** — `FaceRampRanking.swift:28-54`, `82-123` |
| présence des visages | `PresenceManager` (iOS) / `getUserPresenceStatus` (web) | **local** — `LivingSummaryAssembly.swift:117` ; web câblé `src/lib/view/conversation.ts:1` |
| panneau « Vue d'ensemble de l'agent » | `GET /conversations/:id/analysis` | **serveur, EXISTE** — `services/gateway/src/routes/conversations/core-detail.ts:531` |
| `windowCoversUnread` (« le partiel se dit partiel ») | `!hasOlderMessages` | **local** — `ConversationView.swift:1523`, `ConversationViewModel.swift:69` |
| `GET /conversations/:id/stats` | déclaré au protocole, **jamais appelé par le Résumé** | `stats.ts:106` — hors chemin |

Le 403 du tour 1 est réel : `core-detail.ts:550` (`preValidation: [requiredAuth]`) puis
`core-detail.ts:562-564` (`sendForbidden(reply, 'Access denied')`) ; idem `stats.ts:132` et
`stats.ts:145-147`. La règle qui en découle est écrite dans la loi : `ReadingModeOrchestrator.swift:386-387`
— « `.summary` est masqué pour un invité (`/stats` et `/analysis` sont `requiredAuth` → 403 pour une session
anonyme) », miroir de `packages/shared/utils/reading-modes.ts:284`. **Mais ce 403 ne concerne que le PANNEAU
AGENT** : le digest déterministe ne demande rien à personne. Le masquage invité est une décision de LOI, pas
une impossibilité de calcul.

**Aucun vecteur partagé n'existe pour le Résumé.** Les treize `*.vectors.json` de
`packages/shared/fixtures/reading-modes/` couvrent orchestrateur, capacités, courbe de focus, couloirs,
aperçu du Prisme — jamais le digest. Mesuré : `grep -rn "Episode|Digest|FaceRamp|awaitingYou|LivingSummary"
packages/shared --include='*.ts'` rend **0**, et `LivingSummaryModels.swift:4-9` l'assume (amendement A2 : «
reste Swift, PAS de mirroir TypeScript »).

### Les dépendances

- **`agent_grammar` ne conditionne PAS le Résumé.** Ce drapeau gouverne `AgentAssistContracts` et
  `NullAgentAssistProvider`, dont la seule contribution serait `ConversationEpisode.agentTitle` —
  que `EpisodeSegmenter.swift:174` pose invariablement à `nil`. Le panneau agent passe par une
  AUTRE porte : `ConversationAnalysisProviding.swift:12-16` dit que ce protocole « habille un
  service déjà vivant ; il ne fabrique rien de nouveau côté serveur », par opposition aux routes
  `assist:*` qui « n'existent nulle part » (`AgentAssistContracts.swift:13-19`).
  `AgentGrammarGateTests.swift:42` garde même l'indépendance des deux drapeaux. **Rien à activer.**
- **Drapeau `reading_modes`** : côté web `VITE_READING_MODES` (`src/lib/api/config.ts:39-44`,
  `:90`), D-20 en cours d'écriture sur cette branche. Le Résumé en hérite sans travail propre.
- **Modèle** : `packages/shared/types/conversation.ts:110-210` porte tout ce que le digest lit —
  `id` (l.112), `senderId` (l.114), `content` (l.117), `originalLanguage` (l.118), `messageSource`
  (l.120), `replyToId` (l.128), `createdAt` (l.189), `sender` (l.196), `attachments` (l.202).
  **Un seul champ manque : `trackedLinkMap`**, qui n'existe que sur `MeeshyMessage.swift:110` —
  `grep -rn "trackedLink" packages/shared/types/` rend zéro. C'est le seau `MediaTally.links`
  (`DeterministicDigestBuilder.swift:129`) et lui seul.
- **Permissions** : aucune, hors le masquage invité déjà porté par la loi partagée.
- **Mentions** : iOS n'a pas de parseur et le documente (`LivingSummaryAssembly.swift:19-29`,
  heuristique « `@<username>` en sous-chaîne » l.96-99, « délibérément biaisé vers le FAUX
  NÉGATIF »). Le web a mieux, déjà partagé : `packages/shared/utils/mention-parser.ts:46`
  (`parseMentions`, frontières Unicode, tiret géré). **Le portage améliore la règle** — écart à
  déclarer, pas à cacher.

### La taille du portage

| fichier iOS | l | nature |
|---|---|---|
| `Core/LivingSummaryModels.swift` | 338 | 9 types (≈ 90 l en TS : pas d'`init` memberwise) |
| `Summary/{EpisodeSegmenter,DeterministicDigestBuilder,FaceRampRanking,LivingSummaryAssembly}.swift` | 207 + 183 + 124 + 123 = **637** | les trois lois pures + l'adaptation de types |
| `Summary/{LivingSummaryView,FaceRampView,EpisodeListView}.swift` | 164 + 93 + 76 = **333** | les vues |
| `Summary/{LivingSummaryViewModel,LivingSummaryHost,ConversationAnalysisProviding}.swift` | 75 + 64 + 30 = **169** | état, montage, protocole |
| **total** | **1 477** | dont ≈ 45 % de doc-comments |

Web : **5 fichiers de loi + 3 composants + 1 hôte + témoins**. Estimation **450–550 l de loi**,
**250–320 l de composants**, **≈ 400 l de témoins**. **TAILLE : MOYEN** — du même ordre que le lot
mode-de-lecture du tour 1 (`decision.ts` 172 + `catalog.ts` 113 + `store.ts` 143 + `reading-mode-chip.tsx`
236 + `decision.test.ts` 161).

### Ce qui manquerait pour une livraison COMPLÈTE

1. **Un corpus qui puisse l'atteindre.** La fixture du fil compte **sept** messages (`m4` en
   `src/lib/api/fixtures.ts:156-164`, les six autres l.166-300), tous dans les 96 dernières
   minutes, et `c-deploiement` porte `unreadCount: 2` (`fixtures.ts:333`). Or la loi n'élit
   `summary` qu'au-delà de 25 non-lus (`reading-modes.ts:164`) ou après 24 h d'absence avec ≥ 10
   (`:172`). Livré sur ce jeu, le Résumé serait **inatteignable en AUTO**, avec un épisode unique
   et une rampe vide : « un corpus qui ne peut pas faire ÉCHOUER un test ne peut pas le VALIDER ».
2. **`windowCoversUnread`** : iOS le tient de `!viewModel.hasOlderMessages`
   (`ConversationView.swift:1523`). Sans pagination, la v3.1 passera `true` — et la ligne
   « Sur les %d derniers messages » (`LivingSummaryView.swift:95-104`) sera dessinée mais
   inatteignable.
3. **La session** : `viewerUsername` et `isAnonymous` n'existent pas (`thread.tsx:128-133` : « tout
   lecteur est traité en INSCRIT »). Le masquage invité reste **non observable** jusqu'à #5555 —
   la borne que `decision.ts:37-41` annonce déjà tenir « pour rester honnête ».
4. **i18n** : douze clés `focal.summary.*` neuves, signalées manquantes au catalogue iOS lui-même
   (`EpisodeSegmenter.swift:178-184`). La v3.1 n'a aucun catalogue (libellés littéraux,
   `catalog.ts:25-39`) : **dimension 9 non mûre**, comme tout le reste de la v3.1.
5. **Cadrage des dates** : `dayLabel` code `'fr-FR'` en dur (`src/lib/grouping.ts:70-71`) là où
   iOS injecte la `Locale` (`LivingSummaryHost.swift:49` → `EpisodeSegmenter.swift:47`). Voir §6.
6. **Le curseur de lecture** : `markCaughtUpFromSummaryOrRiver()` (`ConversationView.swift:1501`,
   gardé par `LivingSummaryCatchUpWiringTests.swift:58-60`) existe parce qu'un mode qui ne rend
   jamais bulle par bulle ne fait JAMAIS avancer `seenIds` — badge figé à vie, vérifié en
   production à 125. Non branchable sans transport, mais **à déclarer**.

---

## 1. Sources lues

**iOS** : `apps/ios/Meeshy/Features/Main/Focal/Summary/` en entier (11 fichiers, 1 477 l),
`Focal/Core/{LivingSummaryModels,AgentAssistContracts,ReadingModeOrchestrator,FocalMetrics}.swift`,
`Focal/Lens/ReadingModeLensSheet.swift`, `Views/ConversationView.swift:1516-1575`,
`Views/Bubble/MessageDayLabel.swift`, et les sept fichiers de témoins
`apps/ios/MeeshyTests/Unit/Focal/*Summary*|*Digest*|*Episode*|*FaceRamp*` (979 l).
**SDK** : `Services/ConversationAnalysisService.swift`, `Models/AgentAnalysisModels.swift:136-177`,
`Models/MeeshyMessage.swift`, `MeeshyUI/Theme/{DesignTokens,MeeshyColors}.swift`.
**Passerelle & partagé** : `routes/conversations/{core-detail.ts:522-679,stats.ts:101-175}`,
`shared/utils/{reading-modes,mention-parser,conversation-helpers,user-presence}.ts`,
`shared/types/{reading-modes,conversation}.ts`, `shared/prisma/schema.prisma:4112-4133`,
`shared/fixtures/reading-modes/` (13 vecteurs).
**web-v2** : `src/lib/reading-mode/*`, `src/routes/thread.tsx`, `src/lib/api/*`,
`src/lib/{reader,grouping,accent}.ts`, `src/lib/view/conversation.ts`,
`src/components/{avatar,reading-mode-chip}.tsx`, `scripts/check-reading-mode.mjs`, `decisions.md`,
`package.json`, `budgets*.json`, et la spécification du tour 1 `.cache/web-v2-workflow/specs/thread.md`.

> État de l'arbre : SALE — un autre agent écrit `config.ts`, `decision.ts`, `thread.tsx`,
> `vite.config.ts`, `decisions.md`, `README.md`. Les citations de ces fichiers portent sur le
> DISQUE ; `THREAD_RENDERABLE_MODES` n'y est pas touché (seul s'ajoute `readingModesEnabled`,
> D-20). **Rien n'a été écrit dans le dépôt par cette analyse.**

---

## 2. Ce que le Résumé EST

### Entrées

`LivingSummaryAssembly.Input` (`LivingSummaryAssembly.swift:32-42`) : les `messages` de la fenêtre,
`viewerId`, `viewerUsername`, `windowCoversUnread`, un `analysisProvider` optionnel, le `conversationId`, et
**trois injections d'environnement — `calendar`, `locale`, `now`**. Aucune horloge ni locale implicite :
c'est ce qui rend les lois rejouables. Deux conversions, rien d'autre (l.8-10 : « ce fichier ne fait QUE des
conversions de type ») : `episodeInput` (l.73-81) → `id`, `senderId`, `createdAt`, `replyToId`, `isSystem`
(= `messageSource == .system`) ; `digestInput` (l.83-92) ajoute `content`, `languageCode` (=
`originalLanguage`), `attachmentKinds`, `linkCount` (= `trackedLinkMap.count`), `mentionsViewer`. Le
**roster est dérivé des messages eux-mêmes** (l.106-122) : « le digest ne compte QUE les personnes
réellement actives dans la fenêtre » (l.16-17) ; nom en cascade `senderName ?? senderUsername ?? senderId`
(l.114), couleur de repli `#31B6BA` (l.116).

### Seuils

| constante | valeur | site |
|---|---|---|
| coupure temporelle d'épisode | 6 h | `EpisodeSegmenter.swift:34` |
| taille minimale d'un épisode | 4 messages | `EpisodeSegmenter.swift:35` |
| plafond d'épisodes | 8 | `EpisodeSegmenter.swift:36` |
| mention / réponse directe / question / récence | ×5 / ×3 / ×2 / ×1 | `FaceRampRanking.swift:17-20` |
| demi-vie de récence | 7 jours | `FaceRampRanking.swift:21` |
| bascule AUTO en résumé | > 25 non-lus | `ReadingModeOrchestrator.swift:132` |
| plancher d'absence | ≥ 10 non-lus | `ReadingModeOrchestrator.swift:135` |
| fenêtre d'absence | > 24 h | `ReadingModeOrchestrator.swift:138` |

### L'algorithme, en trois lois indépendantes

**(a) Segmentation** — `EpisodeSegmenter.segment` (l.38-51), trois passes : `splitIntoRawGroups`
(l.55-80) coupe sur `gap > 6 h` **OU** franchissement de jour **OU** « changement complet de l'ensemble des
locuteurs » — cette troisième condition étant une INTERPRÉTATION assumée et documentée (l.13-24 ;
implémentation l.67-69 : aucun des 4 derniers expéditeurs ne correspond, et l'épisode a déjà atteint cette
taille). Puis `mergeSmallGroups` (l.84-111) fusionne tout groupe de moins de 4 dans le voisin **le plus
proche dans le TEMPS** (l.98-100). Puis `capGroups` (l.115-134) fusionne la paire adjacente la plus petite
jusqu'à ≤ 8. Invariant : « chaque épisode reste une partition EXACTE de `messages` » (l.10-11), gardé par
`EpisodeSegmenterTests.test_hundredMessagesOverFiveDays_…_exactPartition`.

**Le titre est déterministe**, et la manière l'est aussi (l.26-32) : `MessageDayLabel.label` reçoit
`now: end` — **la fin de l'épisode, jamais l'horloge murale**. Sans quoi « Hier » deviendrait « Avant-hier »
le lendemain sur les mêmes messages. Forme : `"<jour> · <n> message(s)"`, ou `"<jourDébut>–<jourFin>"` si
l'épisode franchit un jour (l.152-165) ; id `"<idPremier>_<idDernier>"` (l.168).

**(b) Digest** — `DeterministicDigestBuilder.build` (l.22-62) : tri par `createdAt` (l.37),
**exclusion des messages système** de tous les comptes par personne (l.42) ; `participantCount` =
intersection roster ∩ expéditeurs actifs, avec repli honnête sur les seuls expéditeurs observés si le roster
est vide (l.44-46) ; `topSenders` triés compte décroissant puis `userId` croissant (l.80-97 — et l.72-79
explique pourquoi `lastAt` reste porté mais **n'entre pas** dans le tri : un troisième signal ferait
dépendre l'ordre d'une horloge plutôt que d'une clé stable) ; `languages` triées de même (l.101-113) ;
`media` en six seaux (l.117-132) ; `isComplete` **pass-through** de `windowCoversUnread` (l.60) — « ce
fichier ne DÉCIDE PAS si la fenêtre couvre le non-lu » (l.9-10).

**(c) « Ils t'attendent »** — `buildAwaitingYou` (l.141-182), trois genres adossés à des messages
réels : `mention` (l.155 : mention **et** aucun message du lecteur après) ; `directReply` (l.163-166 :
`replyToId` pointe vers un message DU lecteur — **structurel, zéro heuristique**) ; `unansweredQuestion`
(l.173 : contenu élagué finissant par `?` **et** rien du lecteur après). `AwaitingItem.init` est
**faillible** (`LivingSummaryModels.swift:210-217`) : `nil` si aucune preuve — « une ligne sans preuve est
rejetée à la construction, pas filtrée à l'affichage ».

**(d) Rampe** — `makeInputs` (l.82-123) groupe par `fromUserId` et **écarte silencieusement tout
expéditeur absent du roster** (l.109) : zéro identité fabriquée. `rank` (l.28-54) calcule `5·mentions +
3·réponses + 2·questions + 1·0.5^(écoulé/7j)` (l.34-37, décroissance l.59-63), tri score décroissant puis
`displayName` croissant en comparaison `String` brute — jamais une collation dépendante d'une locale non
injectée (l.23-27). Distinction cardinale, répétée à trois endroits :
**`awaitingCount` s'AFFICHE (dédupliqué, l.31-33) ; `needScore` sert au TRI et n'est jamais
affiché** (`FaceRampRanking.swift:6-8`, `LivingSummaryModels.swift:271-274`, `FaceRampView.swift:7-9`).

### Sorties — `DeterministicConversationDigest`

`LivingSummaryModels.swift:220-263` : `messageCount`, `participantCount`, `start`, `end`, `topSenders`,
`languages`, `media`, `awaitingYou`, `episodes`, `isComplete`. Plus `[FaceRampEntry]` (l.265-296) :
identité, présence, `awaitingCount`, `needScore`, `evidenceMessageIds`.

---

## 3. Anatomie de `LivingSummaryView`

Fond noir ou blanc plein selon `isDark` (l.26), `ignoresSafeArea`. Un `ScrollView`, `VStack(.leading,
spacing: MeeshySpacing.lg = 16)` (`DesignTokens.swift:9`), `padding(16)` + `padding(.top, MeeshySpacing.xl =
20)` (l.10).

1. **Squelette OU contenu** — `viewModel.showsSkeleton` (l.31) tranche. Le squelette : trois barres
   de **16 px**, rayon `MeeshyRadius.sm = 10` (`DesignTokens.swift:18`), remplissage `white 0.08` /
   `black 0.06` (l.157-158), espacées de **12**.
2. **En-tête d'état** (l.61-77), espacé de **4** : titre « Résumé Vivant » en
   `MeeshyFont.relative(20, .heavy)` ; « 312 messages · 9 personnes » en `relative(14, .semibold)`
   à 0,7 / 0,6 d'opacité (l.67-69, composition l.81-91) ; **si `!isComplete`**, « Sur les %d
   derniers messages » en `relative(12, .medium)` couleur `MeeshyColors.indigo500` = `#6366F1`
   (`MeeshyColors.swift:12`) — l'interdit 3, « le partiel se dit partiel » (l.93-94).
3. **La Rampe** si non vide (l.35-37) : titre « Ils t'attendent » en
   `relative(MeeshyFont.subheadSize = 13` (`DesignTokens.swift:31`)`, .heavy)`, puis un
   `ScrollView(.horizontal)` de pastilles espacées de **12**, `padding(.horizontal, 2)` « pour
   laisser respirer l'anneau » (`FaceRampView.swift:32`). Pastille : `MeeshyAvatar` de
   `FocalMetrics.Avatar.size × 2 = 44` (`FocalMetrics.swift:93`), `enablePulse: false` ; badge en
   haut-droite décalé `(+4, −4)`, capsule `indigo500`, texte `relative(10, .heavy)`,
   `minWidth/minHeight 16`, contour 1,5 de la couleur du fond (l.84-92) ; nom en
   `relative(11, .semibold)`, une ligne, largeur max **48,4** (l.66).
4. **Les épisodes** si non vides (l.38-40) : titre « Ce qui s'est passé » (`13`, `.heavy`), lignes
   espacées de **4**, chacune `HStack` espacé de **8** — pastille `✦` `indigo500` **ssi** le titre
   vient de l'agent (l.43-47), titre en `relative(13, .semibold)` deux lignes max, `Spacer`, puis
   `chevron.forward`, **nommé par la direction de lecture et jamais par un côté physique** (garde
   `RightToLeftLayoutGuardTests`, `EpisodeListView.swift:54-58`). Fond : rayon
   `MeeshyRadius.md = 14`, teinte `FocalMetrics.SurfaceTint` `0.06` sombre / `0.04` clair
   (`FocalMetrics.swift:385-386`), padding `12` × `8`.
5. **Panneau agent** si `agentSummary != nil` (l.41-43, rendu l.108-128) : ligne
   `✦ Vue d'ensemble de l'agent` en `relative(12, .heavy)` `indigo500`, texte en
   `relative(13, .regular)` à 0,85 / 0,78. Cadre rayon `FocalMetrics.Agent.radius = 14`, contour
   **POINTILLÉ** `lineWidth: 1.5`, `dash: [5, 4]` (`FocalMetrics.swift:313-314`) — la grammaire
   qui sépare le dit-par-l'agent du compté-déterministe (interdit 4 : « ils ne se mélangent pas »).
6. **Bouton flottant « Reprendre le fil »** (l.50-54, rendu l.132-144) : capsule pleine
   `indigo500`, texte blanc `relative(15, .bold)`, largeur maximale, `padding(.vertical, 12)`,
   posé en bas par un `VStack { Spacer(); … }`.

### Comment on en sort — trois portes, toutes vers `.script`

Toutes passent par le SITE DE MONTAGE, jamais par la vue (`LivingSummaryView.swift:14-16`) :

| geste | effet | site |
|---|---|---|
| tap sur un visage | `select(.script)` + composeur en RÉPONSE sur `evidenceMessageIds.first` + scroll | `ConversationView.swift:1527-1534` |
| tap sur un épisode | `select(.script)` + scroll sur `messageIds.first` | `ConversationView.swift:1535-1540` |
| « Reprendre le fil » | `select(.script)` + scroll sur le premier message non-`isMe` | `ConversationView.swift:1541-1547` |

**Pas de retour automatique** : le Résumé ne s'auto-quitte jamais. En revanche, QUITTER le mode
déclenche `markCaughtUpFromSummaryOrRiver()` (`LivingSummaryCatchUpWiringTests.swift:58-60`).

Détail de montage qui a coûté un défaut : `LivingSummaryHost` construit son ViewModel **une seule fois**,
dans l'autoclosure d'un `@StateObject` (`LivingSummaryHost.swift:40-52`) — d'où
`.id(viewModel.messages.isEmpty)` au site d'appel (`ConversationView.swift:1572`), qui bascule l'identité
EXACTEMENT une fois, au passage vide → peuplé. Sans lui, « le Résumé Vivant naissait VIDE quand il était le
mode d'OUVERTURE » (l.1549-1555). **Le web aura le même piège** dès qu'il mémoïsera le digest.

---

## 4. Quand il s'ouvre, et pour qui

**La loi**, priorité stricte (`ReadingModeOrchestrator.swift:274-319`, miroir exact de
`shared/utils/reading-modes.ts:140-181`) : 1. drapeau éteint → `bubbles`/`flag-disabled`, non clampé ; 2.
choix collant ≠ `auto` → son image, clampé ; 3. **`unreadCount > 25` → `summary`/`unread-over-cap`**, clampé
(`Swift:303-307`, `TS:164`) ; 4. **absence > 24 h ET `unreadCount >= 10` → `summary`/`stale-absence`**,
clampé (`Swift:310-314`, `TS:172`) ; 5. défaut → `focal`/`default`. « Absence » = jamais ouverte, ou > 24 h
— un horodatage illisible compte comme une absence (`Swift:241-253`).

Le choix collant `resume` mappe sur `.summary` (`Swift:232`, `TS:66`), et `.summary` est le SEUL mode qui se
projette en `BridgeSuggestedMode.resume` (`Swift:334`, `TS:192`).

**Pour qui** : `registeredAvailableModes = [.focal, .script, .summary]` contre
`anonymousAvailableModes = [.focal, .script]` (`Swift:390-391`, miroir `TS:284`). Un invité ne voit jamais
`summary` ; le clamp (`Swift:266-272`) rabat sur `focal`/`clamped-unavailable` en disant la vérité dans
l'encoche « AUTO · … », et au menu la ligne reste LISTÉE et grisée (`ReadingModeLensSheet.swift:52`,
`105-113`).

---

## 5. États, gestes, accessibilité

**Trois états seulement, et c'est délibéré.**

- **Squelette** — `showsSkeleton` (`LivingSummaryViewModel.swift:51-53`) : vrai ssi
  `messageCount == 0` ET rampe vide ET `agentSummary == nil`. « UNIQUEMENT sur cache vide… ce n'est
  pas un état d'erreur, juste "rien à digérer encore" » (`LivingSummaryView.swift:147-150`).
- **Jamais vide** — `isEmpty` rend `false` **toujours** (l.58) : « le squelette lui-même EST le
  contenu affiché » (l.55-57). Et **aucun spinner bloquant** : `isRefreshingAgent` existe (l.28)
  mais **n'est lu par aucune vue** (vérifié) — le digest est rendu synchrone.
- **Aucun état d'erreur.** `refreshAgentEnrichment()` avale tout : provider `nil` (invité) ou
  exception ⇒ `agentSummary = nil`, rien d'affiché (l.64-74 ; doc l.60-63 : « le digest
  déterministe reste seul, C1 — l'étage déterministe est le plancher, définitivement »). Gardé par
  `LivingSummaryViewModelTests.test_refreshAgentEnrichment_error_isSilent_noCrashNoErrorState`.

**Gestes** : trois taps (§3). Aucun geste long, aucun balayage, aucun glisser.

**Accessibilité** : squelette « Chargement du résumé » (`LivingSummaryView.swift:162`) ; panneau
agent `accessibilityElement(children: .combine)` (l.127) ; visage « %@, %d messages t'attendent »
(`FaceRampView.swift:71-81`) ; rampe `children: .contain` (l.35) ; épisode label = `displayTitle` + hint «
Ouvre les messages de cet épisode » (`EpisodeListView.swift:73-74`) ; bouton « Reprendre le fil, retourner à
la conversation » (`LivingSummaryView.swift:143`) ; chevron RTL-correct (`EpisodeListView.swift:58`).

**Douze clés i18n** : `focal.summary.header.{title,messages_count,people_count,partial_window}`,
`.agent.title`, `.resume_thread` (+ `.a11y_label`), `.skeleton.a11y_label`, `.ramp.title` (+
`.entry.a11y_label`), `.episodes.title` (+ `.entry.a11y_hint`), plus
`focal.summary.day.{today,yesterday,day_before_yesterday}` et `.episode.messages_{one,other}`
(`EpisodeSegmenter.swift:186-205`).

---

## 6. Le Prisme

**Le Résumé n'affiche AUCUN texte de message.** Il affiche des comptes, des noms, des libellés de
jour et un texte d'agent. La face « CONTENU » du Prisme (quelle traduction servir) n'a donc **aucune
surface** ici — et c'est ce qui rend le portage sûr : pas de cinquième famille de résolveurs à créer.

Ce que le digest LIT est l'**ORIGINAL**, systématiquement : `content: message.content`
(`LivingSummaryAssembly.swift:86`) ; `languageCode: message.originalLanguage` (l.87), consommé par
`buildLanguages` (`DeterministicDigestBuilder.swift:101-113`) ; la détection de question `hasSuffix("?")`
(`:173`) et celle de mention (`LivingSummaryAssembly.swift:98`) portent sur ce même original. **C'est juste,
et il faut le dire** : la tabulation des langues est une STATISTIQUE de la conversation (« qui a écrit dans
quoi »), pas un contenu servi — la traduire détruirait l'information. Le doc de `DigestInputMessage.content`
(`LivingSummaryModels.swift:65-67`) borne explicitement cet usage : « UNIQUEMENT pour détecter une question
finale, ponctuation réelle, zéro heuristique de contenu ».

Limite à déclarer : `hasSuffix("?")` rate une question japonaise (« ？ »), arabe (« ؟ ») ou grecque (« ; »).
Faux négatif, jamais faux positif — cohérent avec le biais du module, mais c'est un écart de dimension 9 sur
un produit à sept langues.

**En revanche, la face CADRAGE du Prisme est bien là** — dans quelle langue on ADRESSE le lecteur.
iOS l'injecte : `locale: .current` (`LivingSummaryHost.swift:49`) descend jusqu'à `MessageDayLabel.label(…
locale:)` (`EpisodeSegmenter.swift:146-151`) et jusqu'aux cinq `String(localized:… locale:)` (l.186-205).
**La v3.1 ne le fait pas** : `dayLabel` code `'fr-FR'` en dur (`src/lib/grouping.ts:70-71`). Un portage naïf
servirait un cadrage français à un lecteur anglophone, et rien ne rougirait. Le prisme du lecteur EXISTE
pourtant côté web (`READER_LANGUAGES`, `src/lib/reader.ts:49-52`, quatre rangs) : c'est lui qu'il faut
donner au formateur de dates, jamais `navigator.language` ni un littéral.

**Le panneau agent est HORS Prisme, des deux côtés.** `AgentConversationSummary`
(`shared/prisma/schema.prisma:4112-4133`) porte `summary String` (l.4116) et **aucun champ de langue, aucune
table de traduction** ; la route le sert brut (`core-detail.ts:648-659`) et `ConversationSummaryAnalysis`
(`AgentAnalysisModels.swift:153-163`) n'en a pas davantage. Le texte arrive dans la langue où l'agent l'a
écrit, pour tout le monde. **Dette SERVEUR**, pas dette de portage — mais elle voyagera avec le Résumé, et
c'est le genre de détail que le § Prisme du `CLAUDE.md` demande d'énumérer plutôt que de laisser passer.

---

## 7. Élément iOS → web-v2

| élément iOS | équivalent web-v2 |
|---|---|
| `EpisodeSegmenter`, `DeterministicDigestBuilder`, `FaceRampRanking`, `LivingSummaryAssembly`, les 9 types de `LivingSummaryModels` | **ABSENTS** — et absents aussi de `@meeshy/shared` (grep = 0) |
| `LivingSummaryView`, `FaceRampView`, `EpisodeListView`, `LivingSummaryViewModel`, `LivingSummaryHost`, `ConversationAnalysisProviding` | **ABSENTS** — et aucun client HTTP de conversation dans la v3.1 (fixtures) |
| `MessageDayLabel` (locale injectée, `:23-50`) | **PARTIEL** — `dayLabel` (`grouping.ts:61-72`) : même cascade, **sans « Avant-hier »**, `now` injectable, locale codée en dur |
| loi d'orchestration, branches 3 et 4 (`Swift:303-314`) | **PRÉSENTE** — `resolveThreadMode` (`decision.ts:97-104`), mais CLAMPÉE par `THREAD_RENDERABLE_MODES` (`decision.ts:27`) |
| catalogue invité amputé (`Swift:390-391`) | **PRÉSENT mais inobservable** — `isAnonymous: false` en dur (`thread.tsx:132`) |
| ligne « Résumé » du menu (`ReadingModeLensSheet.swift:121,131`) | **PRÉSENTE, désactivée** — `catalog.ts:91-100`, motif `SUMMARY_UNAVAILABLE_REASON` (l.48) |
| `MeeshyAvatar` + présence ; accent de conversation | **PRÉSENTS** — `src/components/avatar.tsx` (mêmes formules), `src/lib/accent.ts` (D-14) |
| parseur de mentions | **ABSENT côté iOS** ; **PRÉSENT** côté partagé — `shared/utils/mention-parser.ts:46` |
| `trackedLinkMap` (`MeeshyMessage.swift:110`) | **ABSENT du domaine partagé** — `MediaTally.links` non portable en l'état |
| `markCaughtUpFromSummaryOrRiver` (`ConversationView.swift:1501`) | **ABSENT** — pas de transport |
| gate | **PRÉSENT ET CONTRAIRE** — `scripts/check-reading-mode.mjs:287-293` exige `isDisabled() === true` |

---

## 8. Le plan de portage, si OUI

### Fichiers web (noms anglais, D-13 · `decisions.md:208-215`)

```
src/lib/summary/{types,episodes,digest,face-ramp,assembly}.ts   (~540 l : segmentEpisodes,
    buildDigest, makeFaceRampInputs, rankFaceRamp, buildLivingSummary + les 9 types)
src/components/summary/{living-summary,face-ramp,episode-list}.tsx              (~300 l)
+ un témoin par fichier de loi                                                  (~400 l)
```

Chaque fichier reste sous le budget 1000–1200 lignes sans effort.

### Ce qui s'IMPORTE de `@meeshy/shared` (D-14 · `decisions.md:253-269`)

`Message`, `Participant`, `Attachment`, `MessageSource` (`types/conversation.ts`, `types/participant.ts`,
`types/attachment.ts`) ; `parseMentions` / `hasMentions` (`utils/mention-parser.ts:46`, `:121`) ;
`getUserPresenceStatus`, `PRESENCE_HEX` (`utils/user-presence.ts`, déjà consommé `view/conversation.ts:1`) ;
`resolveCapabilities`, `resolveOrchestratorDecision` (`utils/reading-modes.ts`, déjà consommé
`decision.ts:1-7`) ; `resolveUserLanguagesOrdered` (`utils/conversation-helpers.ts`, déjà consommé
`reader.ts:1`) — pour le CADRAGE des dates.

### Ce qui se PORTE du Swift

Les quatre lois et les neuf types. **Question de domicile à trancher explicitement** :
`LivingSummaryModels.swift:4-9` déclare « PAS de mirroir TypeScript » au titre de l'amendement A2, décision
prise quand **aucun second client n'en avait besoin**. (A) `src/lib/summary/` : cohérent avec D-14, livrable
tout de suite, mais crée une seconde loi de digest le jour où Android en voudra une. (B)
`packages/shared/utils/living-summary.ts` : domicile unique, au prix de rouvrir A2. **Recommandation : (A)
maintenant, (B) quand un second client lit le TS.** Le tour 1 a mesuré que le coût de `shared` tombe
entièrement dans le morceau de route (`decisions.md:277-281`) — (B) ne coûtera donc pas la première
peinture, mais ne rapporte rien tant qu'un seul client le lit.

### Les témoins

**52 cas iOS sont directement rejouables**, et c'est le vrai actif du portage :

| fichier | cas | ce qu'ils épinglent |
|---|---|---|
| `DigestBuilderTests.swift` | **17** | pass-through d'`isComplete`, exclusion des systèmes, roster fantôme écarté, tris à deux niveaux, six seaux, les trois genres d'`AwaitingItem`, mention déjà répondue, réponse à quelqu'un d'autre, messages du lecteur jamais comptés |
| `EpisodeSegmenterTests.swift` | **11** | partition exacte sur 100 messages / 5 jours, coupure à 6 h, non-coupure en deçà, franchissement de jour, fusion des petits, plafond 8, **titre stable entre deux calculs** |
| `FaceRampRankingTests.swift` | **12** | les quatre poids, demi-vie exacte à 7 j, `awaitingCount ≠ needScore`, déduplication des preuves partagées, égalité tranchée alphabétiquement, participant inconnu écarté |
| `LivingSummaryViewModelTests.swift` | **9** | digest exposé sans attente, trois branches de `showsSkeleton`, `isEmpty` toujours faux, quatre chemins de l'enrichissement |
| `FaceRampViewModelTests.swift` | **3** | ordre préservé, preuves exactes, rampe vide jamais fabriquée |

Aucun vecteur JSON à écrire : ce sont des tables de valeurs, portables en `bun test` sans outillage. **Il
n'existe aucun `*.vectors.json` de digest** — la parité se prouve par la transcription de ces 52 cas.

### Le gate

`bun run gate` (`apps/web-v2/package.json:11`) enchaîne 15 vérifications. Deux touchent le Résumé :
- **`scripts/check-reading-mode.mjs:287-293` DEVIENDRA ROUGE** : il exige aujourd'hui
  `(await summaryRow.isDisabled()) === true` et « Résumé porte une raison NON VIDE ». À **inverser
  dans le même commit** — sinon on livre un gate qui ment. Nouvelle forme : Résumé ACTIF pour un
  inscrit, DÉSACTIVÉ pour un invité, ce qui rend enfin observable l'intersection annoncée par
  `decision.ts:37-41`.
- **`scripts/measure-weight.mjs`** contre `budgets.json` : plafond de première peinture 40 Ko,
  mesure actuelle **26,38 Ko** (preact-web, `budgets-measured.json`). Le Résumé arrive dans le
  morceau de route `/c/:id` : il ne touche pas la première peinture, il pèse sur le « à la
  demande » (38,96 Ko), **qui n'a aucun plafond déclaré**. À en poser un dans le même lot, ou à
  déclarer explicitement qu'on ne le fait pas.

Un témoin de bout en bout manque : **une conversation de fixture à ≥ 26 non-lus étalée sur ≥ 3 jours**, sans
laquelle ni la branche `unread-over-cap`, ni la segmentation multi-épisodes, ni une rampe non vide ne sont
ATTEIGNABLES au navigateur.

### Ordre de travail proposé

1. la fixture (« rattrapage », ≥ 26 non-lus, 3 jours, mentions et questions) ; 2. `types.ts` +
`episodes.ts` (11 cas) ; 3. `digest.ts` (17 cas) ; 4. `face-ramp.ts` (12 cas) ; 5. `assembly.ts` (avec
`parseMentions` au lieu de l'heuristique iOS) ; 6. les trois composants + l'hôte, montés depuis `thread.tsx`
; 7. `THREAD_RENDERABLE_MODES` s'élargit, `catalog.ts` retire `SUMMARY_UNAVAILABLE_REASON`,
`check-reading-mode.mjs` s'inverse ; 8. le cadrage des dates par `READER_LANGUAGES`. Les étapes 1–5 sont du
TDD pur sans navigateur.

---

## 9. Ce que D-8 devient

Texte proposé — **non appliqué**, `decisions.md` n'a pas été touché :

> ## D-8 · `summary` entre au périmètre ; `river` reste dehors — 2026-09-08 (rouvre le 2026-09-07)
>
> **Ce qui change.** La rédaction du 2026-09-07 traitait `summary` et `river` comme un seul refus.
> Ils ne le sont pas, et la mesure le dit : le **Résumé Vivant est calculé LOCALEMENT**, depuis les
> messages déjà chargés — `DeterministicDigestBuilder.swift:4-6` (« 100 % des comptes viennent des
> messages RÉELLEMENT chargés — jamais extrapolés »), `EpisodeSegmenter.swift:38`,
> `FaceRampRanking.swift:28`, toutes fonctions pures. **Il n'existe aucun endpoint « summary »,
> « digest », « episode » ou « living » dans la passerelle, ni aucun type partagé de ce nom**
> (`grep` sur `packages/shared` = 0) : il n'en faut aucun.
>
> **Ce qui reste vrai.** La règle générale — *ne jamais afficher un mode qu'on ne sait pas rendre*
> — n'est pas amendée. `river` reste hors du catalogue de rendu, listé et motivé au menu par la
> trifurcation réelle de `resolveCapabilities`. D-19 avait séparé `script` de `river` ; cette
> entrée sépare `summary` de `river`.
>
> **Le seul appel réseau du Résumé est OPTIONNEL.** `GET /conversations/:id/analysis`
> (`routes/conversations/core-detail.ts:531`, `preValidation: [requiredAuth]` l.550) alimente un
> panneau agent SÉPARÉ, dont l'absence est déjà un no-op silencieux
> (`LivingSummaryViewModel.swift:64-74`). Le digest déterministe est le plancher, définitivement.
> Le drapeau `agent_grammar` **n'y est pour rien** : il gouverne les routes `assist:*`, qui
> n'existent nulle part (`AgentAssistContracts.swift:13-19`). **Le masquage invité reste une loi,
> pas une limite web** : `resolveCapabilities` retire `summary` à une session anonyme
> (`shared/utils/reading-modes.ts:284`, `ReadingModeOrchestrator.swift:386-391`) parce que
> `/analysis` et `/stats` rendent 403 (`core-detail.ts:562-564`, `stats.ts:145-147`). La v3.1
> hérite de cette borne — qui ne devient OBSERVABLE qu'avec la session (#5555) : jusque-là
> `thread.tsx:132` traite tout lecteur en inscrit.
>
> **Ce que le portage doit encore payer, déclaré plutôt que découvert.**
> (a) une fixture à ≥ 26 non-lus sur ≥ 3 jours, sans laquelle ni `unread-over-cap` ni la
> segmentation multi-épisodes ne sont atteignables ;
> (b) `MediaTally.links` : `trackedLinkMap` n'existe pas dans `@meeshy/shared` — le seau « liens »
> reste à zéro tant qu'un champ de domaine ne le porte pas ;
> (c) le cadrage des titres d'épisode par `READER_LANGUAGES`, non par le `'fr-FR'` codé en dur de
> `grouping.ts:70-71` ;
> (d) le curseur de lecture : un mode qui ne rend jamais bulle par bulle ne fait jamais avancer
> `seenIds` — iOS a dû ajouter `markCaughtUpFromSummaryOrRiver()` (`ConversationView.swift:1501`)
> après un badge figé à 125 en production ;
> (e) le texte de l'agent n'a **aucune langue** en base (`schema.prisma:4112-4133`) : servi tel
> qu'écrit, hors Prisme. Dette serveur, à ouvrir en issue propre.
>
> **Le gate change dans le même commit.** `scripts/check-reading-mode.mjs:287-293` exige
> aujourd'hui que la ligne « Résumé » soit désactivée : il s'inverse — active pour un inscrit,
> désactivée et motivée pour un invité.

