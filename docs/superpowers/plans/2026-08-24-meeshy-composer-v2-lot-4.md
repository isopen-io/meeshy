# Lot 4 — Mood (S3) et repost — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Le mood entre dans le meuble — une surface qui sait peindre les quatre blocs de `StatusComposerView`, un socle qui sait publier sous un DOCUMENT, six déclencheurs recâblés — et la loi 5 cesse d'ancrer par accident : le filet `targetType: nil` n'est plus atteignable par une course entre le tap et l'envoi. Le RETRAIT des deux composers historiques est **conditionnel et en dernier**, derrière une tâche de parité nommée.

**Architecture:** Le meuble (`MeeshyComposerHost`) gagne une **troisième surface** (`.mood`), un **propriétaire de chrome dérivé de la surface montée** (le socle publie là où il n'y a pas d'atelier pour le faire), et **un canal de publication de document** — l'ancêtre minimal du `PublishIntent` du lot 7, que le lot 7 absorbera. Rien de tout cela ne descend dans `MeeshyUI` : le SDK n'est ni modifié ni élargi (règle de pureté SDK, `packages/MeeshySDK/CLAUDE.md`).

**Tech Stack:** SwiftUI, XCTest (gardes + policies app), Swift Testing (modèles purs SDK), scheme `Meeshy` + `MeeshySDK-Package`, gate `./apps/ios/meeshy.sh test`.

**Spec:** `docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md` — §B lois 3/4/5/10, §C la table des portes, §E lot 4, §G « Hors v2 » opposable. Prédécesseur gelé : `2026-08-20-meeshy-composer-execution-spec.md` §F « Hors v1 ».

---

## A. L'état des lieux — MESURÉ le 2026-08-24, pas cité

Tout ce qui suit a été ouvert et lu. Ce qui ne l'a pas été est marqué **non vérifié**, et une affirmation non vérifiée n'est pas une information neutre : elle devient la loi que lira la session suivante.

> ### Rév. 2 — audit adversarial du 2026-08-24, HEAD `d4a40f600`
>
> **Les deux lots « en vol » ont MERGÉ pendant que ce plan était écrit, et l'arbre Swift/web est PROPRE.**
> `git log` : lot 3 = `96b707da6` (« la porte du fil cesse de désigner sa feuille historique »),
> lot 0 bis = `d4a40f600` (« un repost visait le MAILLON et non la RACINE, et reposter un mood
> fabriquait un contenu détruit une heure plus tard », **27 fichiers**). Ce qui change pour ce lot :
>
> 1. **Aucune précondition de merge ne reste ouverte.** Ce lot peut démarrer ; il rebase sur `d4a40f600`.
> 2. **Les ancres de `Composer/` ont bougé une seconde fois.** Mesuré à `d4a40f600` :
>    `MeeshyComposerHost.swift` fait **578 l.** (et non 568) — `chromeOwner` `:269`, le `if !chromeOwner.assembles(.publish)` `:278`,
>    `servedDocumentTools` **`:413`**, `ComposerFormatFan` monté **`:437`**, `socle` **`:450`**, `audienceChip` **`:465`**,
>    `previewEye` **`:476`**, `publishButton` **`:545`** (un `Label`, jamais un `Button` — vérifié),
>    l'accesseur `routesToLegacy` **`:572-577`**, `MeeshyScenePlayer` `:499`.
>    `ComposerIntent.swift` fait **372 l.** — `.moodChip → .statusComposer` `:231`, `.repost → .repostComposer` `:249`,
>    `.edit → .storyEdit` `:271`, `RepostTargeting` `:351-371`.
>    **Le §A.3 ci-dessous cite encore les ancres d'AVANT le lot 3** (`:403`, `:455`, `:466`, `:535`, `:562-567`) : ce sont
>    les mêmes symboles, pas les mêmes lignes. Ne recopier aucun numéro sans le revérifier.
> 3. **`services/gateway/src/services/PostService.ts` SORT du périmètre de ce lot** — le commentaire que la
>    tâche 4.1 Step 5 devait corriger l'a DÉJÀ été par `d4a40f600` (voir §A.6, rectifié).
> 4. **Deux affirmations de ce plan ont été réfutées et sont corrigées en place** : « le plan du lot 7 a été
>    corrigé en conséquence » (il ne l'a pas été) et « aucune surface web ne republie un mood » (le web en
>    republie un depuis `/mood/<id>` — c'est même le défaut que `d4a40f600` vient de refermer).
> 5. **Une garde neuve, arrivée avec le lot 3, n'est nommée nulle part dans ce plan** :
>    `MeeshyComposerHostGuardTests.test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`
>    (`:405`). Sa table `portesDocumentDuMeuble` (`:371-373`) ne contient **que** `feedComposer` — donc
>    4.3 (qui route `.status` vers une surface `.mood`, pas `.document`) et 4.6 (qui monte `.moodChip`)
>    la laissent muette. **Mais 4.5 la touche** : ses trois assertions conditionnelles (`sertUnOutil`,
>    `saisieAUneIssue`, `publieurAtteignable`) sont lues sur la SOURCE du host, et la première assertion du
>    test — `XCTAssertFalse(portesDocument.isEmpty)` — exige que `.feedComposer` reste une porte-document
>    servie par le meuble. Relire ce fichier de test AVANT d'écrire 4.5, il n'était pas dans l'arbre quand
>    ce plan a été rédigé — il vivait alors dans un arbre SALE, et le lot 3 a ajouté 320 lignes à ce seul
>    fichier de test (`git show --stat 96b707da6`).

### A.1 — Trois lignes du §E lot 4 sont PÉRIMÉES ou FAUSSES

| Ce que le §E lot 4 annonce | Ce que la mesure rend |
|---|---|
| « le client envoie enfin `targetType` » | **DÉJÀ FAIT sur iOS** (commit `92529dac5`, PR #3389). Les six sites recensés par la §B loi 5 passent tous `cible.targetType` : `ReelsViewModel:430`, `FeedViewModel:886`, `PostDetailView:300`, `ProfileUserPostsList:971`, `RootViewComponents:331`, `FeedView:470`. `grep 'targetType: nil'` sur `apps/ios` + `packages/MeeshySDK/Sources` : **zéro résultat**. Une garde de source les nomme déjà un par un (`ComposerIntentTests.swift:553-584`). |
| « `.moodChip` et `.repost` cessent de router » | Changement de TABLE **sans consommateur** : `routesToLegacy` n'a aucun lecteur de production (son unique lecteur est l'accesseur lui-même, `MeeshyComposerHost.swift:562-567`), et **aucun site ne construit** `ComposerIntent(origin: .moodChip)` ni `.repost`. Le meuble n'a QU'UN montage dans tout le dépôt : `StoryTrayActions.swift:191`, avec `.storyTray`. Exactement la forme du lot 3, qui le dit lui-même (`ComposerIntent.swift:164-173`). |
| « **Retrait** : `StatusComposerView.swift` (361 l.), `UnifiedPostComposer.swift` (739 l., 1 seul appelant) » | Les deux comptes sont EXACTS (`wc -l`), et « 1 seul appelant » est VRAI pour la production (`StoryViewerView.swift:867`, prouvé par grep sur tout le dépôt). Mais le retrait touche **25 fichiers**, pas 2 (§A.5), la surface de remplacement **n'existe pas** (§A.3), et surtout : `UnifiedPostComposer.swift` **ne vit pas dans l'app**. Son chemin réel est `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift` (vérifié par `find`), avec ses trois suites sous `packages/MeeshySDK/Tests/MeeshyUITests/`. Il est donc **dans le répertoire que ce lot s'interdit** (Global Constraints) — ce n'est pas un détail de chemin, c'est ce qui rend son retrait impossible ici (§A.7 bis). |

### A.2 — Le VRAI défaut résiduel du repost : le filet reste ATTEIGNABLE par une course

`RepostTargeting.target` (`ComposerIntent.swift:350-362`) rend `targetType: PostType(rawValue: brut)` où `brut = cardType?.trimming…uppercased() ?? ""`. Un `cardType` nil ou inconnu donne donc `nil`, et le commentaire `:358-360` l'assume — « le filet du gateway vaut mieux qu'une supposition ». Or le gateway replie `nil` sur `POST` (`PostService.ts:2263`), et `computeExpiresAt(POST)` rend `undefined` (`:2273`) : **le filet ANCRE un éphémère**, exactement l'issue que la loi 5 nomme « la plus coûteuse ».

Et il est atteignable. `APIPost.type` est `String?` (`PostModels.swift:81` et `:147`), et **trois sites lisent la carte À L'INTÉRIEUR du `Task`, après un saut d'acteur** :

- `FeedView.swift:449-474` — `togglePostRepost(postId:)` est `@MainActor`, mais la lecture est à `:469`, dans `Task { … await MainActor.run { … } }` ;
- `RootViewComponents.swift:330` — jumeau exact, même commentaire (`:327-329` : « le socket peut muter `viewModel.posts` entre le tap et l'envoi ») ;
- `PostDetailView.swift:299` — `let carte = await MainActor.run { displayPost }`.

Le commentaire décrit la course **et la subit** : entre l'entrée dans le `Task` et le `MainActor.run`, un tour de boucle du main actor peut retirer la carte du modèle. La lecture rend alors `nil`, `RepostTargeting` rend `nil`, et une story repartagée devient un post permanent — sans un mot.

### A.3 — Le meuble ne sait RIEN faire d'un mood, et ne sait pas publier un document

Mesuré par lecture INTÉGRALE de `ComposerDocumentSurface.swift` (419 l.) et `MeeshyComposerHost.swift` (568 l.) :

| Capacité | État mesuré |
|---|---|
| grille d'emojis | **absente**. `ComposerOpening.moodGrid` (`ComposerIntent.swift:65`) n'a que DEUX lecteurs, deux `switch` PURS : `ComposerSurfaceRouting.surface` (`ComposerDocumentSurface.swift:52-62`) et `focusesContentOnAppear` (`:67-72`). Aucune vue n'en dérive quoi que ce soit. `StatusViewModel.moodOptions` (`:53-56`, 10 emojis) n'a que DEUX sites : sa déclaration et `StatusComposerView.swift:153`. |
| corps de la surface document | `ComposerDocumentSurface.body` = `exitAffordance` + `content` + `toolRow` (`:330-338`). Une croix, un `TextEditor`, une rangée vide. **Ni compteur, ni sélecteur d'audience, ni bouton publier** — vérifié sur le corps, pas seulement sur la liste des paramètres. |
| rangée d'outils | `servedDocumentTools` rend `[]` en une ligne (`MeeshyComposerHost.swift:403`). |
| socle | **jamais peint** : `chromeOwner: ComposerChromeOwner = .atelier` (`:269`) rend `if !chromeOwner.assembles(.publish)` faux (`:278`), donc `socle` (`:440-450`), `audienceChip` (`:455`), `previewEye` (`:466`) et `publishButton` (`:535`) ne sont montés sur **aucune** des deux surfaces. |
| publieur | l'unique publieur du meuble est la barre du SDK, qui vit **sous la scène**. Le paragraphe `:498-534` nomme les deux blocages, tous deux dans `MeeshyUI` : pas de gate de matière lisible app-side, pas d'écrivain d'audience atteignable. |
| graine | `MeeshyComposerHost.init` (`:186-209`) prend `intent`, `initialVisibility`, `draftId` et trois fermetures. **Aucun paramètre ne transporte un mood, un `repostOfId` ni un `StoryItem`.** Il construit `StoryComposerViewModel()` (`:201`) — le seul des TROIS inits publics du SDK qui n'apporte rien (`init()` `StoryComposerViewModel.swift:471`, `init(reposting:authorHandle:)` `+Repost.swift:30`, `init(editing:)` `+Edit.swift:49`). |

**Conclusion opposable : retirer `StatusComposerView` avant d'avoir construit cette surface serait une régression sèche** — le motif exact que la rév. 4 de `.feedComposer` retenait, et que le lot 3 vient de citer mot pour mot (`ComposerIntent.swift:175-189`).

### A.4 — Le repost n'a pas UN mécanisme mais TROIS, et la conception n'en nomme qu'un

| # | Chemin | Route | Sites |
|---|---|---|---|
| 1 | `PostService.repost(postId:targetType:…)` | `POST /posts/:id/repost` | **8** sites de production : `FeedViewModel:892`, `ReelsViewModel:434`, `ProfileUserPostsList:975`, `FeedView:475`, `PostDetailView:305`, `RootViewComponents:336`, `StoryViewerView:872` (sous `UnifiedPostComposer`), `StoryViewerView:1280` (repost direct). Les deux derniers passent `.post` en DUR — l'ancrage volontaire, déjà conforme. |
| 2 | `StatusService.create(…repostOfId:viaUsername:)` | `POST /posts` type `STATUS` | la republication de MOOD (`StatusService.swift:39-41`, `StatusViewModel.swift:233`). |
| 3 | `StoryComposerViewModel(reposting:authorHandle:)` + `publishStoryInBackground(repostOfId:)` | `POST /posts` par canevas | la republication en STORY, `StoryViewerView.swift:911-950`, avec `allowedVisibilities: StoryRepostAudience.allowed(…)` (`:919`) — le plafond d'audience de la loi 10. |

Le §E lot 4 ne nomme que le premier. Les chemins 2 et 3 sont ceux que le retrait annoncé toucherait.

### A.5 — `viaUsername` : un champ que le serveur n'a JAMAIS lu

Vérifié par grep exhaustif : `viaUsername` a **zéro occurrence** dans `services/gateway` et dans `packages/shared` — **y compris `schema.prisma`**. `CreatePostSchema` (`services/gateway/src/routes/posts/types.ts:225-274`) ne le déclare pas, et un `z.object()` **écarte silencieusement** les clés inconnues.

La chaîne `StatusComposerView.swift:10` → `StatusViewModel.swift:204` → `StatusService.swift:39` → `CreatePostRequest` (`ServiceModels.swift:83`) écrit donc un champ dans un corps que le serveur jette. L'attribution qui s'affiche vient d'ailleurs, et le SDK le dit lui-même : `StoryModels.swift:2580-2583` — « pas de colonne `viaUsername` » —, `via = viaUsername ?? repostOf?.author.username`. **C'est `repostOfId` qui porte l'attribution**, sur les deux chemins.

### A.6 — Le SERVEUR est prêt, et il en fait DÉJÀ plus que le chemin du mood

`RepostSchema` accepte les quatre formats (`types.ts:428`). `repostPost` **instantanie** toute source éphémère : il duplique les octets média, l'audio, `storyEffects`, et copie `moodEmoji` + le `content` du statut (`PostService.ts:2426-2457`, `inheritStatusBody` `:2432`). La couverture existe déjà, cas par cas : `PostService.test.ts:953` (STORY), `:980` (sans `targetType` ⇒ POST), `:1095` (STATUS→STATUS), `:1131`.

**Aucun changement serveur n'est requis par le lot 4.**

> **Rectifié par l'audit du 2026-08-24 (HEAD `d4a40f600`), et c'est une SUPPRESSION de travail.** La
> rédaction initiale annonçait ici une correction de commentaire : `PostService.ts:2243-2262` affirmait
> « presque aucun site d'appel ne renseigne `targetType` ». **Ce commentaire a DÉJÀ été corrigé** — par le
> lot 0 bis (`d4a40f600`). Ouvert et lu : le bloc porte désormais un paragraphe daté « ÉTAT AU 2026-08-24 »
> qui dit exactement ce que la tâche 4.1 Step 5 voulait faire dire — iOS depuis `92529dac5`, web depuis
> `1214afbcb`, « `?? PostType.POST` n'est donc plus le chemin NORMAL : c'est le FILET des clients anciens ».
> Le repli lui-même est maintenant en **`:2279`**, le bloc de commentaire en `:2243-2278`.
> **Conséquence opposable : `services/gateway/**` sort des fichiers possédés par ce lot, la tâche 4.1 Step 5
> devient une VÉRIFICATION, et `bun run test` sur le gateway n'a plus de raison d'être au gate 4.9.**
> Le laisser tel quel aurait fait réécrire un commentaire juste — le mode d'échec exact que ce plan reproche
> ailleurs au dépôt.

**Nuance mesurée, à ne pas sur-lire** : le chemin 2 (mood) passe `audioUrl: repostAudioUrl`, c'est-à-dire l'URL de la source, là où le chemin 1 duplique les octets. Le balayage d'expiration ne récupère **pas** `Post.audioUrl` (`grep audioUrl` sur `ExpiredStoriesCleanupService.ts` et `reclaimPostMediaBytes.ts` : zéro occurrence) — le fichier survit donc à la destruction de son post, orphelin. Le défaut n'est **pas** vivant aujourd'hui ; il le deviendrait le jour où cette récupération serait écrite. À consigner, pas à corriger ici.

### A.7 — Le coût du RETRAIT : 25 fichiers, 5 suites, 8 clés

`grep -rln 'StatusComposerView|UnifiedPostComposer'` sur `apps/ios` + `packages/MeeshySDK` rend **25 fichiers**.

**Ce qui épingle `StatusComposerView.swift` :**

1. `StatusComposerSheetPresentationTests.swift` — `test_allFourEntryPointsAreDiscovered` (`:122-132`) exige **exactement quatre** présentations et nomme les quatre fichiers en dur (`:105-110`) ; sa boucle `where line.contains("StatusComposerView(")` vit dans `presentationSites()` (`:99-121`).

   > **Correction d'audit (2026-08-24), vérifiée par ouverture du fichier.** La rédaction initiale de ce plan écrivait que `test_allFourEntryPointsAreDiscovered` « passerait au VERT en ne mesurant plus rien » après le retrait. **C'est faux, et il fallait le corriger avant qu'un exécutant ne pose la garde au mauvais endroit** : ce test est un `XCTAssertEqual(try presentationSites().count, 4, …)` (`:125-131`) — zéro site le fait **ROUGIR**, pas verdir. C'est même la seule des trois qui rougit toute seule.
   >
   > Les tests qui **s'éteignent en silence** sont les DEUX suivants, parce qu'ils itèrent l'ensemble au lieu de le compter : `test_everyPresentationOffersTheLargeDetent` (`:134`) et `test_everyPresentationShowsTheDragIndicator` (`:150`) sont des `for site in try presentationSites()` — sur un tableau vide, la boucle ne s'exécute pas, aucune assertion ne tombe, le test est vert. C'est là, et seulement là, que le garde-fou « au moins un site » doit être posé (4.6 Step 5, 4.8 Step 2). Le motif reste celui du dépôt — *une garde négative privée de sa cible passe au vert en perdant sa protection* — mais il ne frappe pas le test que ce plan désignait.
2. `LocalizationConsistencyTests.swift:102-109` — `fullyLocalizedScreens` le porte en PREMIER. Retirer le fichier sans la ligne fait échouer la lecture ; retirer la ligne sans migrer les clés laisse des orphelines que la garde « dead keys » (`:86-94`) attrapera.
3. `NavigationContainerMigrationTests.swift:64` — lit le fichier PAR CHEMIN.
4. `SheetToolbarSemanticsTests.swift:41` + garde nommée `:109-110`.
5. `StatusComposerAccessibilityTests.swift` — suite entière dédiée.

**Les huit clés de catalogue**, relevées dans `apps/ios/Meeshy/Localizable.xcstrings` et vérifiées langue par langue — les **sept** locales livrées (`ar`, `de`, `en`, `es`, `fr`, `it`, `pt-BR`) sont complètes pour chacune :
`status.composer.mood.question`, `status.composer.placeholder`, `status.composer.publish`, `status.composer.repost.via`, `status.composer.title`, `status.composer.title.repost`, `a11y.status.publish.disabled.hint`, `a11y.status.publish.in-progress`.

**Ce qui épingle `UnifiedPostComposer.swift` :** 15 constructions dans 5 fichiers de test, plus DEUX compteurs d'occurrences dans `AppInitWireupTests.swift:151-152` et `:188-189` (parité des injections d'environnement — vérifiés : les deux comptent `occurrences(of: "StoryComposerView(") + occurrences(of: "UnifiedPostComposer(")`), plus deux mentions de doctrine dans `StoryViewerView+Canvas.swift`.

### A.7 bis — `UnifiedPostComposer` n'appartient à AUCUN lot aujourd'hui *(correction d'audit, 2026-08-24)*

Le fichier est `packages/MeeshySDK/Sources/MeeshyUI/Story/UnifiedPostComposer.swift` — **739 l., dans `MeeshyUI`**, vérifié par `find` et `wc -l`. Trois conséquences que la première rédaction de ce plan ne tirait pas :

1. **Ce lot ne peut pas le retirer**, non parce que sa porte route encore (raison exacte mais secondaire), mais parce que ses Global Constraints interdisent `packages/MeeshySDK/Sources/MeeshyUI/**`. La tâche 4.8 avait raison de le sortir du périmètre ; elle le motivait pour la mauvaise raison.
2. **Le lot 7 ne l'a pas accepté.** Son plan (`2026-08-24-…-lot-7.md`) déclare `MeeshyUI` non ouvert (§F « Ce qui n'a PAS été vérifié ») et ne nomme qu'un seul retrait, `EditPostSheet.swift`, qu'il repousse lui-même derrière un STOP. Écrire « il rejoint le lot 7 » sans que le lot 7 le sache produit exactement le document qui devient la loi de la session suivante : **un retrait attribué à personne, que chacun croit chez l'autre.**
3. **Ce que la vérité permet d'écrire, et rien de plus** : le retrait d'`UnifiedPostComposer` appartient au lot qui possédera `MeeshyUI`. Aucun lot v2 planifié ne le possède au 2026-08-24. Le seul lot qui y écrira est le **lot 5** (tâche 5.4, `StoryComposerViewModel+Seed.swift`) — et il n'y retire rien. Tant que ce propriétaire n'existe pas, la ligne « Retrait : `UnifiedPostComposer.swift` » du §E lot 4 est une **promesse sans exécutant**, et c'est ainsi qu'il faut l'amender en 4.9.

### A.8 — Ce que `StatusComposerView` sait faire, bloc par bloc (l'inventaire de la parité)

| Bloc | Ligne | Ce qu'il tient |
|---|---|---|
| bandeau de republication | `:59-78` | « Status de @X », monté si `viaUsername != nil` |
| grille d'emojis | `:146-194` | `LazyVGrid` 5 colonnes sur `StatusViewModel.moodOptions`, cellules 56×56 pt (`:173`), **sélection à bascule** (retaper l'emoji choisi le désélectionne, `:163-168`) |
| sélecteur d'audience | `:308-360` | `PostVisibility.composerSelectableCases`, mémoire `@AppStorage("lastStatusVisibility")` (`:28`, écrite `:315`, relue `:353`), `AudienceUserPickerView` en feuille (`:347-351`) — **la loi 10 câblée pour le format status** |
| champ de texte | `:198-230` | plafond DUR à **122** caractères par troncature (`:211-215`) + `CharacterCountLabel(limit: 122, warningThreshold: 101)` (`:220-225`) |
| références | `:236-251` | `ComposerReferences.payload(…)` et **`nil` quand la liste est vide** — `[]` serait entendu comme un EFFACEMENT (loi 3, déjà tenue ici) |
| publication | `:255-304` | gate `guard let emoji` (`:257`), `.disabled(selectedEmoji == nil …)` (`:292`), `supersedeRecoveredStatus` AVANT `setStatus` (`:264-267`) pour qu'un renvoi hors-ligne REMPLACE la ligne en file |
| reprise hors-ligne | `:119-140` | `recoverUnsentStatus()` en création fraîche seulement, restaure emoji + texte + visibilité **et `visibilityUserIds`** (`:136` — sans quoi un mood ONLY/EXCEPT repartirait avec une liste vide et le gateway le rejetterait) |

**Cet inventaire EST le DoD de parité de la tâche 4.8.** Un bloc absent = un retrait qui perd du produit.

### A.9 — Ce que je n'ai PAS vérifié

- **Android** : aucun fichier Kotlin ouvert. La directive du 2026-08-23 le met de côté (lot H suspendu) ; ce lot ne le touche pas et n'affirme rien à son sujet.
- **La planche P0** (`planche-meeshy-composer.html`, ~389 Ko) : j'ai lu son en-tête et sa règle de maintenance. **Corrigé par l'audit du 2026-08-24** : elle porte désormais **rév. 22 (2026-08-24)** — posée par le lot 3 pendant la rédaction de ce plan — et elle est **incohérente avec elle-même** (62/70 à l'arc, 57 tâches / 81,4 % à la puce verte). Je n'ai PAS lu sa matrice ligne à ligne : sous quel numéro les tâches v2 doivent s'inscrire reste à établir à la première tâche.
- **Aucun build, aucun test lancé** (interdit par la mission qui a produit ce plan). Chaque « rougirait » ci-dessous est une lecture de source, pas une mesure d'exécution.
- **Divergence relevée, hors périmètre** : le plafond du mood vaut **122** sur iOS (`StatusComposerView.swift:212`) et **140** sur le web (`StatusComposer.tsx:32`, `MAX_CONTENT_LENGTH`). Les dix emojis sont identiques. Trancher appartient au lot 6 (le contrat partagé), pas ici.

---

## Global Constraints

- **Fichiers POSSÉDÉS** par ce lot : `apps/ios/Meeshy/Features/Main/Composer/**`, `apps/ios/Meeshy/Features/Main/Views/{RootView,iPadRootView,RootViewComponents,ConversationListView}.swift` (les quatre présentations du mood), `apps/ios/Meeshy/Features/Main/Views/{FeedView,PostDetailView}.swift` (les sites de course), `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift`, `packages/MeeshySDK/Sources/MeeshySDK/Services/{StatusService,ServiceModels}.swift`, et leurs tests. **`services/gateway/**` a été RETIRÉ de cette liste par l'audit du 2026-08-24** : le seul geste serveur du lot (un commentaire) avait déjà été fait par `d4a40f600` (§A.6). Ce lot ne modifie plus aucun fichier serveur, et un commit qui en toucherait un est un dépassement de périmètre à remonter.
- **`packages/MeeshySDK/Sources/MeeshyUI/**` n'est PAS touché.** Le meuble gouverne ce qu'il monte autour de l'atelier ; il n'élargit pas l'atelier. Toute tâche qui croit avoir besoin d'un écrivain public dans `MeeshyUI` doit **s'arrêter et remonter** — c'est la condition de levée que `MeeshyComposerHost.swift:381-383` a déjà nommée, et elle ne se décrète pas depuis ce lot.
- **Deux workflows étaient en vol au moment où ce plan a été écrit — les DEUX ont mergé depuis (audit 2026-08-24, voir la rév. 2 du §A). Ce qui suit garde sa valeur de CARTE de propriété, plus de calendrier** :
  - **lot 3** possède `ComposerIntent.swift` et `MeeshyComposerHost.swift` (arbre SALE, `.feedComposer` déjà passé à `routesToLegacy: nil`) et trois suites `MeeshyTests/Unit/Composer/`. **Ce lot démarre APRÈS le merge du lot 3**, et rebase avant sa première ligne : toute ligne citée dans `Composer/` peut avoir bougé.
  - **lot 0 bis** est **MERGÉ** (`d4a40f600`, 27 fichiers). **Ce lot ne touche AUCUN fichier web.**
    > **Réfutation d'audit (2026-08-24).** La rédaction initiale écrivait ici « le cas `mood` y est *une loi
    > sans site* — vérifié : aucune surface web ne republie un mood ». **C'est faux**, et le commit qui vient
    > de merger le prouve : la page de détail web est montée sur **trois** routes dont `/mood/<id>` (cible de
    > résolution des liens de tracking typés `STATUS`), et y reposter envoyait `targetType: STATUS` — le
    > gateway posait 1 h de TTL et `ExpiredStoriesCleanupService` détruisait le repost. `d4a40f600` a ajouté
    > `onRepostAsPost` (l'ANCRAGE, loi 5) sur `components/v2/PostDetail.tsx`, « sur la condition exacte du
    > jumeau iOS (`ComposerIntent.swift:234`) ». **Ce qui est vrai, et qu'il fallait écrire :** le web
    > republie un mood par un GESTE (repost sec / citation / ancrage), il n'a pas de SURFACE de composition
    > du mood. Ce miroir-là appartient au lot 6 (W6), pas à ce lot.
- **DEUX collisions avec des lots PLANIFIÉS, ajoutées par l'audit du 2026-08-24 — elles n'étaient déclarées d'aucun côté :**
  - **Lot 5 ⇄ tâche 4.5 : le même `init`.** La tâche 4.5 réécrit `MeeshyComposerHost.init` pour y ajouter `onPublishDocument` ; la tâche **5.5 du lot 5** réécrit **le même `init`** pour y ajouter `seed: StoryComposerSeed?`. Le plan du lot 5 revendique explicitement `MeeshyComposerHost.swift` (« init + graine uniquement ») dans ses fichiers possédés, tandis que ce lot revendique `Composer/**` en bloc — et sa table de dépendances écrit « Lot 4 : **Aucun recouvrement** », ce qui est faux. **Règle posée ici : le lot 4 passe en premier** (4.5 est le bloquant de six tâches ; 5.5 est un paramètre à défaut `nil` qui se greffe sur un `init` déjà remanié). Le lot 5 rebase 5.5 sur l'`init` issu de 4.5, jamais l'inverse.
  - **Lot 7 ⇄ tâche 4.2 : `viaUsername`, retiré ici, RÉINTRODUIT là-bas.** La tâche 4.2 retire `viaUsername` du fil ; la tâche **7.2 du lot 7** l'ajoute aux cinq champs neufs de `CreatePostPayload` / `CreatePostBody` et fait `StatusViewModel` le renseigner. Les deux ne peuvent pas être vrais. **La mesure tranche pour 4.2** (§A.5, revérifié à l'audit : `grep -rn viaUsername services/gateway packages/shared` rend **0**, `schema.prisma` compris) : le champ ne porte rien, ni en ligne ni hors ligne. Ce qu'il faut vraiment rendre à la file durable est `repostOfId`, seul porteur de l'attribution.
    > **Réfutation d'audit (2026-08-24).** La rédaction initiale finissait par « Le plan du lot 7 a été
    > corrigé en conséquence ». **Il ne l'avait pas été** — le fichier
    > `2026-08-24-meeshy-composer-v2-lot-7.md` portait encore, à l'heure de l'audit, « Cinq champs
    > optionnels sur `CreatePostPayload` — `repostOfId`, `viaUsername`, … » et un test nommant
    > `viaUsername: "alice"`. C'est le défaut que ce plan dénonce trois paragraphes plus haut : **une
    > coordination affirmée depuis un seul des deux documents.** L'audit a corrigé le lot 7 lui-même
    > (§A.2 et tâche 7.2, quatre champs) ; cette ligne-ci ne vaut désormais que comme constat, jamais
    > comme preuve. Vérifier dans le lot 7 avant de s'y fier.
- **Consommé tel quel, gelé** : `qualifiesAsReel` / `ReelComposition`, `ComposerFormatFanPolicy` (`ComposerFormatFan.swift:19-39`), `ComposerFormatCopy.label(.status)` = « Mood » (`:54-55`, clé `composer.format.status` déjà au catalogue), `RepostSchema` + `repostPost` + `detachReposts` côté gateway.
- **Gate** : `./apps/ios/meeshy.sh test` — quatre phases (`meeshy.sh:1679-1757`), la phase 0 étant la suite du package `MeeshySDK-Package`. Attendre le verrou `xcodebuild` voisin ; DerivedData privée (`/tmp/meeshy-dd-lot-4`) pour un gate long.

---

## Les lois que ce lot câble

- **Loi 3 — « on n'écrit que ce qu'on sait complet »** (§B). Déjà tenue par `StatusComposerView.swift:236-239` : `nil` et jamais `[]`. La surface de remplacement la reprend **telle quelle**, sans la réinventer.
- **Loi 4 — « la porte déclare un éventail »** et son corollaire de la doctrine : *un format non offert est ABSENT, jamais grisé*. `.moodChip` offre `[.status]` : `ComposerFormatFanPolicy.isVisible` exige `count > 1` (`ComposerFormatFan.swift:19-21`), donc **le mood n'affichera jamais de sélecteur**. C'est voulu, et c'est aussi ce qui rend le mood la porte la moins risquée pour construire la surface manquante.
- **Loi 5 — « le repost miroite ; changer de format est l'ancrage »**. La table la porte DÉJÀ (`ComposerIntent.swift:225-241` : `offeredFormats: sourceFormat == .post ? [.post] : [sourceFormat, .post]`). Ce lot ne l'écrit pas — il la fait **atteindre un écran** pour le seul format où c'est faisable sans construire un composer neuf, et il **referme le filet** qui la contredisait par accident (§A.2).
- **Loi 10 (doctrine) — « l'audience se souvient PAR FORMAT »**. `@AppStorage("lastStatusVisibility")` est cette mémoire pour le status ; elle **déménage avec la surface**, elle ne se réinvente pas sous un autre nom — deux clés pour une même mémoire, ce sont deux mémoires à faire diverger.
- **Loi 6 — « le lecteur EST l'aperçu »**. Aucune tâche de ce lot ne construit d'aperçu. Un mood n'a pas de canevas : `previewEye` (`MeeshyComposerHost.swift:466`) **ne se monte pas** sous la surface mood, et la tâche 4.5 le dit en toutes lettres plutôt que de le laisser au hasard du `if`.

---

### Task 4.1: Le filet du repost cesse d'ancrer par accident

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` (`togglePostRepost`, `:449-474`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift` (`:325-341`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` (`:295-310`)
- Modify: `services/gateway/src/services/PostService.ts` (`:2243-2262` — **un commentaire**)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerIntentTests.swift` (suite EXISTANTE — pas de fichier neuf, donc pas de `xcodegen`)

- [ ] **Step 1: Tests ROUGES.**
  1. **Le filet, nommé** : `RepostTargeting.target(cardId: "p", cardType: nil)` rend `targetType == nil`, et `cardType: "MOOD"` (type inconnu du SDK) aussi. Le test s'appelle par sa conséquence — `test_leFiletDuRepost_ancreUnEphemere_quandLeTypeEstInconnu` — et son message cite `PostService.ts:2263` (`?? PostType.POST`) et `:2273` (`computeExpiresAt`). **Ce test est VERT dès l'écriture** : il ne mesure pas un bug, il grave le coût du filet pour que le pas suivant ait un sens. Le dire dans le test, pas le laisser croire.
  2. **La course, elle, rougit** — garde de SOURCE sur les trois sites : dans chacun, la lecture de la carte (`viewModel.posts.first(where:)` / `displayPost`) doit apparaître **AVANT** le `Task {` du corps de la fonction, jamais dans un `await MainActor.run` à l'intérieur. Message : « Entre l'entrée dans le `Task` et le `MainActor.run`, un tour de boucle du main actor peut retirer la carte : `cardType` rend alors `nil`, le gateway replie sur `POST`, et une story repartagée devient un post permanent. »
- [ ] **Step 2: Rouge** (les trois sites échouent, le test 1 passe).
- [ ] **Step 3: Implémenter.** Remonter la lecture hors du `Task` dans les trois fonctions — elles sont déjà `@MainActor` ou appelées depuis le main actor, donc la lecture y est **synchrone** et le commentaire « instantané pris sur le main actor » devient enfin vrai. Le `Task` capture la valeur, plus le modèle. Aucun changement de signature, aucun appelant touché.
- [ ] **Step 4: Vert.**
- [ ] **Step 5: VÉRIFIER, ne rien écrire** *(remplacé par l'audit du 2026-08-24 — ce Step demandait une correction DÉJÀ FAITE)*. Ouvrir `services/gateway/src/services/PostService.ts` autour du repli `opts.targetType ?? PostType.POST` (**`:2279`** à `d4a40f600`) et constater que le bloc porte déjà son paragraphe daté « ÉTAT AU 2026-08-24 » — posé par le lot 0 bis. **S'il y est, ne pas y toucher** : le lot 4 ne modifie aucun fichier serveur. S'il a disparu d'un rebase, c'est alors — et seulement alors — qu'il se réécrit, sans test RED (un commentaire n'est pas mesurable par une assertion, et c'est assumé).
- [ ] **Step 6: Commit.** Gate app seul. **Le gate gateway est retiré** : ce lot ne touche plus `services/gateway/**`.

**DoD :** les trois sites lisent la carte hors du `Task` ; `test_lesSixSitesDuRepost_portentLeFormatDeLeurCarte` (`ComposerIntentTests.swift:553-584`) reste VERT sans être touché. **Cette tâche est livrable seule et referme un défaut produit réel — c'est la seule du lot dont ce soit le cas.**

> **Note d'audit sur le test 1 (2026-08-24).** `RepostTargeting.target` a gagné deux paramètres au lot 0 bis
> (`repostOfId:`, `originalRepostOfId:`, tous deux à défaut `nil`, `ComposerIntent.swift:359-364`) et sa
> première ligne est désormais `let reference = originalRepostOfId ?? repostOfId ?? cardId`. L'appel
> `RepostTargeting.target(cardId: "p", cardType: nil)` du Step 1 **compile toujours** — mais le test doit
> maintenant couvrir aussi la RÉFÉRENCE (une carte qui repartage remonte à sa racine), sans quoi il grave
> la moitié d'une loi que le lot 0 bis vient d'écrire en entier.

---

### Task 4.2: `viaUsername` quitte le fil — il n'y a jamais rien porté

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift` (`CreatePostRequest`, `:83` et `:106-111`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/StatusService.swift` (`:10` protocole, `:39-41`)
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/StatusViewModel.swift` (`setStatus`, `:204` et `:233`)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/StatusServiceTests.swift` (suite EXISTANTE, cible SPM — aucune inscription pbxproj requise)

- [ ] **Step 1: Test ROUGE** — encoder le corps que `StatusService.create` envoie et exiger que la clé `viaUsername` en soit **ABSENTE**, avec pour message la preuve : `CreatePostSchema` (`services/gateway/src/routes/posts/types.ts:225-274`) ne la déclare pas, un `z.object()` écarte les clés inconnues, et `grep viaUsername services/gateway packages/shared` rend zéro — **schema Prisma compris**. Second cas : `repostOfId` reste présent, car c'est LUI qui porte l'attribution (`StoryModels.swift:2580-2583`, « pas de colonne `viaUsername` », `via = viaUsername ?? repostOf?.author.username`).
- [ ] **Step 2: Rouge. Step 3:** retirer le champ du modèle de requête et des deux signatures qui le relaient au fil. **Le paramètre d'AFFICHAGE reste** : `StatusComposerView.swift:10` s'en sert pour le bandeau « Status de @X » (`:59-78`), qui est un fait local, pas une écriture. Cette distinction est le fond de la tâche — un champ mort sur le fil, un champ vivant à l'écran, même nom.
- [ ] **Step 4: Vert. Step 5: Commit.**

**DoD :** aucune construction de `CreatePostRequest` ne porte `viaUsername` ; le bandeau de republication du mood s'affiche toujours ; `StatusServiceTests` vert. **Pourquoi ici et pas ailleurs** : la tâche 4.4 doit décider ce que la surface mood envoie. La laisser hériter d'un champ mort, c'est recopier une dette en croyant porter une fonctionnalité.

> **Collision déclarée (audit 2026-08-24).** La tâche **7.2 du lot 7** prévoyait d'ajouter `viaUsername` à la charge durable `CreatePostPayload`, sous le titre « un mood republié hors ligne retrouve son auteur ». C'est l'inverse exact de cette tâche, et c'est cette tâche qui a la mesure pour elle : un champ que le serveur strippe ne « retrouve » aucun auteur, qu'il voyage par le fil direct ou par la file. Le lot 7 a été corrigé (quatre champs neufs, pas cinq). **Si les deux lots devaient être exécutés dans le désordre**, l'ordre sûr est 4.2 d'abord : retirer un champ mort ne casse rien, l'ajouter à un magasin persisté grave un format on-disk qu'il faudra migrer pour le défaire.

---

### Task 4.3: `.mood` devient une SURFACE, pas un cas du document

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift` (`ComposerSurfaceKind` `:13-18`, `ComposerSurfaceRouting.surface` `:52-62`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentSurfaceTests.swift` (suite EXISTANTE)

- [ ] **Step 1: Tests ROUGES** —
  1. `surface(opening: .moodGrid, format: .status) == .mood` ;
  2. `surface(opening: .keyboardOnContent, format: .status) == .mood` — **la republication d'un mood ouvre la même surface que sa création**, et c'est ce cas qui prouve que la règle porte sur le FORMAT, pas sur l'ouverture ;
  3. `.post` reste `.document`, `.story`/`.reel` restent `.scene` — les trois autres formats ne bougent pas ;
  4. `focusesContentOnAppear(.moodGrid) == false` (**inchangé** : on choisit un emoji avant d'écrire ; lever le clavier recouvrirait la grille).
- [ ] **Step 2: Rouge. Step 3:** ajouter `case mood` à `ComposerSurfaceKind` et la branche `case .status: return .mood` dans la règle. Le `switch` sur le format devient exhaustif à trois issues — **un cinquième format casserait la compilation ici**, ce qui est la propriété qu'on veut.
  - **TROISIÈME site de commentaire à réécrire AVEC le code** *(ajouté par l'audit du 2026-08-24 ; le Piège 7 n'en nommait que deux)*. Le doc-comment de `ComposerSurfaceRouting` énonce aujourd'hui, en règle 3 et mot pour mot : « une story et un réel SONT des scènes … ; **un post et un mood sont des documents** — du texte et des pièces, sans canvas » (`ComposerDocumentSurface.swift`, en-tête de l'énum, vérifié). Ce lot rend cette phrase FAUSSE au moment même où il ajoute `case mood`. Un commentaire de RÈGLE laissé sous un code qui l'a démenti est la loi que lira la session suivante — et celui-ci vit à trois lignes de la branche qu'on modifie. Le réécrire dans le même commit, en disant les trois issues et **pourquoi** le mood a quitté le document (il n'a ni pièce jointe ni rangée d'outils : sa matière est une grille d'emojis et un texte de 122 caractères).
  - Vérifier aussi le doc-comment de `ComposerSurfaceKind` lui-même (`:13-18`), qui n'énumère que deux cas.
- [ ] **Step 4: Vert. Step 5: Commit.**

**DoD :** la règle est PURE et éprouvée sans monter la moindre vue ; `ComposerSurfaceRouting` reste la seule décideuse de surface (aucune condition écrite dans un `body`) ; **aucun commentaire de ce fichier n'affirme plus que le mood est un document**.

---

### Task 4.4: `ComposerMoodSurface` — les six blocs de la parité

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Composer/ComposerMoodSurface.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerMoodSurfaceTests.swift` (**fichier NEUF** — voir Piège 2)

**Interfaces** (gelées pour 4.5/4.6) :

```swift
/// Les règles du mood, PURES — éprouvables sans monter une vue.
nonisolated enum ComposerMoodPolicy {
    static let contentLimit = 122            // StatusComposerView.swift:212, plafond DUR
    static let warningThreshold = 101        // :223
    static func truncate(_ text: String) -> String
    /// Un mood SANS emoji ne part pas (:257, :292). La seule règle de publication.
    static func canPublish(emoji: String?, isPublishing: Bool) -> Bool
    /// La bascule : retaper l'emoji choisi le DÉSÉLECTIONNE (:163-168).
    static func toggling(_ tapped: String, current: String?) -> String?
    /// Loi 3 — `nil` quand la liste est vide, JAMAIS `[]` (:236-239).
    static func declared(_ references: [ComposerReference]) -> [PostMentionInput]?
}

struct ComposerMoodSurface: View {
    @Binding var emoji: String?
    @Binding var text: String
    @Binding var visibility: PostVisibility
    @Binding var visibilityUserIds: [String]
    @Binding var references: [ComposerReference]
    let viaUsername: String?          // bandeau de republication — affichage local
    let onClose: () -> Void           // OBLIGATOIRE, non optionnel (cf. ComposerDocumentSurface:306-318)
}
```

- [ ] **Step 1: Tests ROUGES** — d'abord les cinq fonctions pures (chacune ancrée sur sa ligne d'origine dans le message d'assertion), puis une garde de SOURCE sur la vue :
  1. `truncate` coupe à 122 et ne touche pas 122 exactement ; `canPublish(emoji: nil, …) == false` ; `toggling("🔥", current: "🔥") == nil` ; `declared([]) == nil` **et** `declared([inline uniquement]) == nil` (le payload filtre les INLINE — reprendre `ComposerReferences.payload`, ne pas le réécrire) ;
  2. garde de source : la vue itère `StatusViewModel.moodOptions` (**pas une seconde liste d'emojis** — deux listes divergeraient au premier ajout), monte `CharacterCountLabel`, monte `AudienceUserPickerView`, lit `@AppStorage("lastStatusVisibility")` — **la clé littérale est assertée**, parce que c'est la mémoire d'audience du format status (loi 10) et qu'une clé neuve en ferait une seconde ;
  3. garde de source négative : la vue **ne contient aucun** `String(localized:` posé en littéral hors d'un `ComposerMoodCopy` — même idiome que `ComposerDocumentCopy` (`ComposerDocumentSurface.swift:204-272`), pour la raison qu'il écrit lui-même : un libellé posé en ligne échappe au cliquet de complétude et n'est jamais traduit.
- [ ] **Step 2: Rouge** (dont l'échec de compilation du fichier de test, qui est le rouge attendu). **Step 3: Implémenter.**
  - **Zéro clé neuve au catalogue** : la surface RÉUTILISE les huit clés de `StatusComposerView` (§A.7) via `ComposerMoodCopy`. Le cliquet français est à ZÉRO tolérance (`FrenchDefaultValueRatchetTests`) et le catalogue est épinglé à un plafond ; huit clés déjà traduites dans les sept locales n'ont aucune raison d'être doublées. C'est le raisonnement que `ComposerDocumentCopy.label` tient déjà (`:227-249`).
  - **La surface est une PRÉSENTATION** : des valeurs entrent, des événements sortent. Elle ne possède ni `StatusViewModel`, ni chemin d'envoi, ni reprise de brouillon — ces trois-là appartiennent au site qui la monte (4.6). Une surface qui publierait elle-même serait le second chemin de publication que la doctrine, C2 et le lot 7 interdisent tous les trois.
  - **Pas de `@ViewBuilder` imbriquant un `if #available`** (voir Piège 4).
- [ ] **Step 4: Vert. Step 5: Commit.**

**DoD :** les six blocs de §A.8 sont peints ou explicitement portés par le site de montage (publication et reprise → 4.5/4.6) ; aucune clé neuve ; aucune seconde liste d'emojis ; aucun littéral localisé dans la vue.

---

### Task 4.5: Le socle publie là où aucun atelier ne le fait

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift` (`chromeOwner` `:269`, `body` `:271-283`, `surface` `:294-302`, `socle` `:440-450`, `publishButton` `:535-543`, `init` `:186-209`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/MeeshyComposerHostGuardTests.swift` (suite EXISTANTE)

**Le blocage, et pourquoi il tombe ICI et pas ailleurs.** `chromeOwner` est aujourd'hui une constante `.atelier` (`:269`), et les deux blocages qu'elle documente (`:518-529`) sont **des blocages de la branche SCÈNE** : `visibilityMenu` est l'unique écrivain d'audience *de l'atelier*, et l'œil du socle rendrait un aperçu amputé *des médias préchargés de l'atelier*. **Sous la surface mood, il n'y a pas d'atelier** : aucun `visibilityMenu` à retirer (la surface 4.4 porte le sien), aucun média local à précharger, aucun canevas à prévisualiser. Les deux raisons ne s'appliquent pas — et une constante qui porte une raison qui ne vaut que pour l'une des surfaces est une constante mal placée.

- [ ] **Step 1: Tests ROUGES** —
  1. règle PURE neuve, `ComposerChromeOwnership.owner(for:)` : `.scene → .atelier`, `.mood → .host`, `.document → .host`. Elle vit à côté de la règle de surface, pour la même raison qu'elle : éprouvable sans monter une vue ;
  2. garde de source : `MeeshyComposerHost` **ne contient plus** `chromeOwner: ComposerChromeOwner = .atelier` en littéral, et son `chromeOwner` dérive de `ComposerSurfaceRouting.surface(…)` ;
  3. garde de source : `previewEye` **n'est pas monté** sous `.mood` — un mood n'a pas de canevas, et la loi 6 (« le lecteur EST l'aperçu ») interdit d'en fabriquer un quatrième pour une chose qui n'en a pas ;
  4. garde de source : `publishButton` est un `Button` dont l'action appelle `onPublishDocument`, **et il est `.disabled`** — le témoin inerte de V3-2 devient un vrai bouton, ce qui rend son gate obligatoire.
- [ ] **Step 2: Rouge. Step 3: Implémenter.**
  - `chromeOwner` devient une propriété calculée sur la surface montée. Le paragraphe `:252-268` est RÉÉCRIT — il dit aujourd'hui « `.atelier` aujourd'hui, et ce n'est pas un provisoire mou » avec deux blocages mesurés ; il doit dire que les deux blocages **valent pour la scène** et pourquoi ils ne valent pas ailleurs. Laisser l'ancien texte sous le nouveau code serait exactement le défaut que 4.1 Step 5 corrige chez le gateway.
  - Le host gagne **un** canal de publication de document :

    ```swift
    /// L'ancêtre MINIMAL de la file de publication (S2). Un seul paramètre
    /// opaque, pour que le lot qui unifiera la file n'ait pas à défaire une
    /// signature à douze arguments comme celle de la scène.
    let onPublishDocument: (ComposerDocumentDraft) async -> Bool
    ```

    > **Correction d'audit (2026-08-24) — « que le lot 7 absorbera » était une promesse SANS EXÉCUTANT.**
    > La rédaction initiale annonçait que le lot 7 absorberait ce canal. Ouvert et lu : le plan du lot 7
    > déclare `apps/ios/Meeshy/Features/Main/Composer/**` **INTERDIT** (« Fichiers INTERDITS — possédés par
    > des lots en vol »), écrit « Ce lot ne touche PAS le meuble », fait naître `PublishIntent` **sous
    > `Services/`, jamais sous `Composer/`** — « c'est ce qui rend ce lot mergeable en parallèle » — et ne
    > mentionne ni `onPublishDocument` ni `ComposerDocumentDraft`. **Ce lot-ci vient donc de reproduire, sur
    > son propre canal, le défaut qu'il reproche au §E pour `UnifiedPostComposer` (§A.7 bis) : un travail
    > que chacun croit chez l'autre.** Ce qui est vrai et suffit : `onPublishDocument` est une fermeture
    > fournie par le SITE DE MONTAGE, elle vit dans `Composer/`, et **elle appartient au lot 4 jusqu'à ce
    > qu'un lot déclare explicitement la reprendre**. Ne pas écrire dans le code un commentaire qui la dit
    > transitoire par la volonté d'un autre lot : écrire ce qu'elle est.

    où `ComposerDocumentDraft` porte `format`, `text`, `emoji`, `visibility`, `visibilityUserIds`, `references`, `repostOfId`, `audioUrl`. **Ce n'est PAS un second chemin d'envoi** : c'est une fermeture que le SITE DE MONTAGE fournit, exactement comme `onPublishAllInBackground` en fournit une pour la scène. Le meuble ne publie toujours pas ; il transmet.
  - `socle` reste à TROIS zones sous la scène (loi 5 — le socle ne bouge jamais) ; sous `.mood` l'œil ne s'y monte pas, ce qui laisse audience + flèche. Le dire dans le code, à l'endroit du `if`.
- [ ] **Step 4: Vert. Step 5: Commit.**

**DoD :** `MeeshyComposerHostGuardTests` vert, `test_host_honoursTheLegacyRouting` (`:269-274`) et `test_leMeuble_monteLeDocument_pourLaPorteDuFil` (`:319-340`) **intacts** ; le paragraphe `:252-268` dit ce que le code tient, ni plus ni moins. **Effet de bord assumé et nommé** : la porte `.feedComposer` (que le lot 3 vient de faire pointer sur le document) verrait elle aussi un socle. Aucun site de présentation ne la monte (`ComposerIntent.swift:164-173`), donc **aucun effet en production** — mais c'est une phrase à écrire dans le commit, pas à découvrir au lot 7.

---

### Task 4.6: Les six déclencheurs du mood montent le meuble

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerIntent.swift` (`.moodChip` `:214-223` → `routesToLegacy: nil`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift` (`:623-633`, déclencheur `:776-778`), `iPadRootView.swift` (`:139-149`, `:262-264`), `RootViewComponents.swift` (`:852-858`, `:655-656`), `ConversationListView.swift` (`:1082-1084`, `:1256`, `:1268`, `:1507`)
- Modify: `apps/ios/MeeshyTests/Unit/Architecture/AppInitWireupTests.swift` (`:248`)
- Modify: `apps/ios/MeeshyTests/Unit/Views/StatusComposerSheetPresentationTests.swift`
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerIntentTests.swift`

- [ ] **Step 1: Tests ROUGES.**
  1. `ComposerIntent(origin: .moodChip).routesToLegacy == nil`, et la CHAÎNE complète sans monter une vue — porte → `routesToLegacy == nil` → `ComposerSurfaceRouting.surface(…) == .mood` → `ComposerChromeOwnership.owner(for: .mood) == .host`. Les quatre maillons ensemble, pour la raison que `test_leMeuble_monteLeDocument_pourLaPorteDuFil` écrit déjà (`:301-309`) : chacun seul laisse passer une régression que les autres attrapent.
  2. **REFORMULER, jamais supprimer** (Piège 1) :
     - `test_chaqueComposerHistorique_aExactementUnePorte_saufCeluiQueLeMeubleAAbsorbe` (`:426-451`) : `routes.count` passe de **3 à 2** — et `origine(routantVers: .statusComposer)` rend désormais `nil`, ce qui fait basculer `.statusComposer` dans la moitié « absence de porte » du même test, celle qui existe déjà pour `.feedComposer` ;
     - `test_leMeuble_sertLesSixPortesDeSonPerimetre_dontLaPlusUtilisee` (`:458-470`) : l'ensemble écrit en toutes lettres gagne `"moodChip"` et **le nom du test change** — un nom qui dit « six » sur un ensemble de sept est un mensonge silencieux ;
     - `test_formatAnnonce_desPortesQuiFixentLeurFormat_estCeluiDuComposerHistorique` (`:527-529`) n'a plus qu'un cas et **il disparaît** : son dernier occupant était `.moodChip`. Son assertion (« la porte du mood ouvre sur `.status` ») **ne se perd pas** — elle vit dans la chaîne du point 1. Le dire dans le commit, sans quoi la suivante croira à une couverture perdue.
  3. **La garde NÉGATIVE du mood, écrite du bon côté du seuil** : `test_aucunePorte_neRetombeSurLeComposerDeMood` balaie les **neuf** origines et exige qu'aucune ne rende `.statusComposer` — jumelle exacte de `test_aucunePorte_neRetombeSurLaFeuilleDuFil` (`:484-492`). Elle exige que **`LegacyComposer.statusComposer` RESTE dans l'énum** : une garde négative privée du symbole qu'elle cherche passe au vert en perdant sa protection. Le commentaire de `LegacyComposer` (`ComposerIntent.swift:69-75`) est étendu au mood, dans les mêmes termes.
  4. `AppInitWireupTests.swift:248` exige aujourd'hui **exactement 1** occurrence de `MeeshyComposerHost(`. Elle passe à cinq. Un COMPTE nu resterait vert le jour où un site en remplacerait un autre : la garde devient une **liste NOMMÉE** de fichiers de montage (`StoryTrayActions`, `RootView`, `iPadRootView`, `RootViewComponents`, `ConversationListView`), assortie du compte. Deux moitiés, deux régressions distinctes.
  5. `StatusComposerSheetPresentationTests` : ses quatre sites deviennent les quatre montages du meuble. `test_allFourEntryPointsAreDiscovered` (`:122-132`) **rougit déjà** si la boucle ne trouve plus rien — c'est un `XCTAssertEqual(count, 4)`, vérifié à la source, et il n'a besoin d'aucun renfort. Le garde-fou « au moins un site » se pose dans les **deux tests qui ITÈRENT** : `test_everyPresentationOffersTheLargeDetent` (`:134`) et `test_everyPresentationShowsTheDragIndicator` (`:150`). Un `for site in try presentationSites()` sur un tableau vide ne lève aucune assertion : ce sont eux qui, le jour du retrait (4.8), passeraient au vert en ne mesurant plus rien. Poser la garde ailleurs, c'est croire l'avoir posée (§A.7, correction d'audit).
- [ ] **Step 2: Rouge. Step 3: Implémenter.** Les quatre `.sheet` montent `MeeshyComposerHost(intent: ComposerIntent(origin: .moodChip), …)`. Le site de montage garde ce qui lui appartient VRAIMENT — l'état de présentation, `StatusViewModel`, la reprise de brouillon (`recoverUnsentStatus` + `supersedeRecoveredStatus`, `StatusComposerView.swift:119-140` et `:264-267`) et la fermeture `onPublishDocument` qui appelle `viewModel.setStatus(…)`. **La reprise reste au site et ne descend pas dans la surface** : elle touche `StatusViewModel` et l'outbox, deux choses qu'une présentation ne connaît pas. Les detents `[.medium, .large]` sont conservés, avec leur raison (`RootViewComponents.swift:854-857` : les libellés suivent Dynamic Type quand la grille d'emojis ne le fait pas).
- [ ] **Step 4: Vert. Step 5: Commit.**

**DoD :** les six déclencheurs ouvrent le meuble ; publier un mood, le retrouver en cache, le republier, et le reprendre après un hors-ligne fonctionnent **à l'identique** — vérifié bloc par bloc contre §A.8, dans le commit. `StatusComposerView.swift` **existe encore** et n'est plus monté.

---

### Task 4.7: La loi 5 atteint un écran — la republication d'un mood miroite

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerIntent.swift` (`.repost` `:225-241`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootView.swift` (`:776-778`), `iPadRootView.swift` (`:262-264`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerIntentTests.swift`

**L'arbitrage, et il est le cœur du lot.** `routesToLegacy` est aujourd'hui une valeur par ORIGINE. Faire passer `.repost` à `nil` en bloc ferait dire à la table que le meuble sert les reposts de story, de post et de réel — ce qui est **faux** : le meuble n'a aucune graine (`init` `:186-209`), son `onPublishAllInBackground` ne porte pas `repostOfId` (comparer `StoryTrayActions.swift:195-214` à `StoryViewerView.swift:920-936`), et il ne passe ni `allowedVisibilities` ni `initialVisibilityUserIds` à l'atelier alors que `StoryComposerView.init(viewModel:…)` les accepte (`:337-361`) — le plafond d'audience du repost (loi 10, `StoryRepostAudience.allowed`, `StoryViewerView.swift:919`) tomberait en silence.

`routesToLegacy` devient donc, pour cette porte seule, **fonction du format porté** — ce que la doctrine de la table autorise déjà en toutes lettres (`ComposerIntent.swift:104-109` : « le FORMAT qu'une porte porte fait partie de son identité ») :

```swift
case .repost(_, let sourceFormat):
    // Le meuble sert le repost de MOOD : sa surface existe (4.4), sa
    // graine tient dans le profil, et son envoi est celui du mood. Les
    // trois autres formats gardent leur composer : leur graine est un
    // StoryItem que le meuble ne sait pas adopter, et leur plafond
    // d'audience (StoryRepostAudience) n'a aucun chemin jusqu'à l'atelier.
    routesToLegacy: sourceFormat == .status ? nil : .repostComposer
```

- [ ] **Step 1: Tests ROUGES.**
  1. `profil(.repost(ofPostId: "s", sourceFormat: .status)).routesToLegacy == nil` **et** `.story`/`.post`/`.reel` rendent `.repostComposer` — les quatre cas écrits en toutes lettres, jamais un compte ;
  2. le MIROIR, déjà dans la table, est éprouvé pour le mood : `offeredFormats == [.status, .post]` — l'éphémère reste éphémère, et le post est l'ANCRAGE explicite ; le sélecteur s'affiche donc (`isVisible` exige `count > 1`) et « Mood » / « Post » sont ses deux chips (`ComposerFormatCopy.label`, clés existantes) ;
  3. `surface(opening: .keyboardOnContent, format: .status) == .mood` (posé en 4.3) : republier un mood ouvre la surface du mood ;
  4. **la garde négative du format sortant** : lorsque l'éventail est sur `.status`, le brouillon envoyé porte `format == .status` ; sur `.post`, `.post`. Sans elle, l'éventail offrirait un choix que la publication ignore — « le pire des deux mondes, puisqu'il aurait eu l'air de marcher » (`MeeshyComposerHost.swift:165-170`).
- [ ] **Step 2: Rouge. Step 3: Implémenter.** `StatusBubbleController.shared.onRepublish` (RootView `:776`, iPadRootView `:262`) construit `.repost(ofPostId: entry.id, sourceFormat: .status)`. `StatusEntry` (`StoryModels.swift:2404-2458`) **n'a AUCUN champ `type`** — vérifié — mais il n'en a pas besoin : une entrée de bulle de mood EST un statut par construction, et le format est donc porté, pas deviné. `RepostTargeting` n'entre pas ici : son rôle est de lire le type d'une CARTE de fil, pas d'un type déjà connu.
  - Le brouillon part par `onPublishDocument` avec `repostOfId: entry.id`, l'emoji et le texte de la source préremplis, et `audioUrl: entry.audioUrl`. **Chemin d'envoi : inchangé** (`StatusViewModel.setStatus`, chemin 2 de §A.4). Basculer la republication du mood sur `POST /posts/:id/repost` serait plus juste sur un point (le serveur y duplique les octets audio au lieu de les référencer, §A.6) — **et c'est HORS PÉRIMÈTRE** : le défaut n'est pas vivant (`Post.audioUrl` n'est récupéré nulle part), et changer d'endpoint sous une surface qu'on vient de construire mélangerait deux risques dans un même commit. Consigné en dette nommée dans le commit et sur la planche.
  - Sur le chip `.post`, le brouillon porte `format == .post` : c'est l'ANCRAGE, et il part par le chemin 1 (`PostService.repost(postId:targetType: .post, …)`) — le seul qui sache créer un post permanent depuis une source éphémère avec instantané des octets (`PostService.ts:2275-2457`).
- [ ] **Step 4: Vert. Step 5: Commit.**

**DoD :** republier un mood depuis la bulle ouvre le meuble sur la surface mood, l'éventail offre Mood · Post, et les deux chips produisent réellement deux formats différents. Les trois autres formats de repost **n'ont pas bougé d'une ligne** — `UnifiedPostComposer` et le chemin 3 sont intacts.

> **ÉTAT AU 2026-08-25 — 4.7 est SOLDÉE.** La loi 5 est câblée des deux côtés :
> le MIROIR repart en `STATUS`, l'ANCRAGE atteint un écran.
>
> **L'ordre de la levée n'était pas négociable**, et c'est le seul enseignement
> que ce bloc doit léguer. Faire descendre l'éventail d'abord aurait armé une
> flèche qui, pressée, n'aurait RIEN fait : `MoodComposerDoor.publish` s'ouvrait
> sur `guard draft.format == .status`, rendait `false`, et le composer restait
> ouvert, muet — « le pire des deux mondes, puisqu'il aurait eu l'air de
> marcher ». Livré dans l'ordre : (1) le PUBLIEUR
> (`StatusViewModel.anchorStatusAsPost`, `POST /posts/:id/repost`), (2) la SOURCE
> sur le brouillon (`ComposerDocumentDraft.document(…, repostOfId:)` et le gate
> qui arme dessus), (3) l'ÉVENTAIL (`ComposerFormatFanPlacement`, le plateau
> monté par le `body` du meuble), (4) l'AIGUILLAGE de la porte sur le format.
>
> **Les deux raccourcis écartés le 2026-08-24 le restent**, et pour des raisons
> qui n'ont pas bougé : (a) descendre l'éventail EN BLOC aurait livré le chip
> « Story » sous le document de `.feedComposer`, où le choisir monte l'atelier en
> laissant la saisie derrière — c'est la règle de PLACEMENT qui sépare les deux
> cas, pas un second montage ; (b) ramener `routesToLegacy` à `.repostComposer`
> ferait désigner par la table un composer historique qu'**aucun** site ne monte
> pour un repost de statut.
>
> **Les DEUX conditions de levée ont été remplies avant, pas contournées** : le
> socle sait choisir une audience (lot 4.9) et l'œil a été RETIRÉ sous les deux
> surfaces sans scène plutôt que laissé ouvrir un canvas vide (lot 4.9 aussi).
>
> **Gardes** : `ComposerDocumentSurfaceTests`
> `.test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint`,
> `.test_lePlacementDeLEventail_suitLaSurfaceOuAtterrissentSesFormats`,
> `.test_lesDeuxReglesDeLEventail_seLisentENSEMBLE_dansUneSeuleRegle` ;
> `ComposerMoodSurfaceTests`
> `.test_laPorteDuMood_aiguilleSurLeFORMAT_etRefuseLesDeuxQuElleNeSaitPasPublier`
> et les quatre témoins de `ComposerAnchorComment` ; `StatusViewModelTests`, les
> sept témoins de l'ancrage.
>
> **DETTES nommées, non refermées par 4.7** — les lire avant de les redécouvrir :
> le plafond d'ÉLARGISSEMENT de la loi 10 (`APIPost.toStatusEntry()` ne transmet
> pas l'audience de l'original, donc `StoryRepostAudience` n'a pas son entrée — le
> trou pèse identiquement sur les deux chips) ; l'ancrage n'est pas DURABLE hors
> ligne ni idempotent (le fil rouge du repost a posé `OutboxKind.repostPost`, il
> lui manque un ÉCRIVAIN — l'y brancher apporterait `X-Client-Mutation-Id` avec) ;
> la surface document ne peint AUCUN bandeau d'attribution sous un ancrage, qui
> reste donc explicite par la seule mémoire du geste ; l'emoji de la grille et les
> références composées sous le mood ne survivent pas à la bascule vers l'ancrage
> (`PostService.repostPost` recopie le `moodEmoji` de l'ORIGINAL et n'a pas de
> paramètre de mentions) ; `setStatus` ne rend toujours rien, si bien que le
> MIROIR referme le composer sur un 500.
---

### Task 4.8: Le RETRAIT — conditionnel, en dernier, avec un STOP

**Files:**
- Delete (conditionnel) : `apps/ios/Meeshy/Features/Main/Views/StatusComposerView.swift`
- Modify: les 5 suites de §A.7 + `Localizable.xcstrings` + les 3 commentaires de doctrine (`MessageReportDetailView.swift:81`, `AffiliateCreateView.swift:142`, `ReportSubmitButtonAccessibilityTests.swift:6`)

**`UnifiedPostComposer.swift` N'EST PAS RETIRÉ par ce lot.** Le §E lot 4 l'annonce ; la mesure l'interdit, pour **deux** raisons dont la seconde est dirimante :

1. son unique appelant de production (`StoryViewerView.swift:867`) sert le repost de STORY vers POST, que la tâche 4.7 laisse délibérément sur son composer (`routesToLegacy: .repostComposer`) — retirer un composer dont la porte route encore vers lui, ce serait retirer la surface sous une porte vivante ;
2. **le fichier n'est pas dans le périmètre de ce lot** : il vit sous `packages/MeeshySDK/Sources/MeeshyUI/Story/`, que les Global Constraints interdisent (§A.7 bis).

**Il ne « rejoint » pas le lot 7 : le lot 7 ne l'a jamais accepté** (son plan ne nomme qu'`EditPostSheet.swift`, et déclare `MeeshyUI` non ouvert). L'écrire ainsi fabriquerait un retrait que chaque lot croit chez l'autre. Ce que 4.9 doit amender au §E est donc : *le retrait d'`UnifiedPostComposer.swift` attend le lot qui possédera `MeeshyUI` ; aucun lot v2 planifié ne le possède au 2026-08-24.* Une spec qui promet un retrait sans exécutant est un P0 périmé au sens de la règle de maintenance — pas moins qu'une spec qui promet un retrait qu'un lot n'a pas fait.

- [ ] **Step 1: La PARITÉ se prouve avant le retrait, bloc par bloc.** Chaque ligne de §A.8 est confrontée à la surface 4.4 + son site de montage 4.6 : bandeau de republication · grille 10 emojis à bascule · audience 6 niveaux + `AudienceUserPickerView` + mémoire `lastStatusVisibility` · texte plafonné 122 + compteur à seuil 101 · références `nil`-quand-vide · gate emoji + `supersede` avant `setStatus` · reprise hors-ligne restaurant **aussi** `visibilityUserIds`. **Une seule ligne rouge ⇒ STOP** : le retrait ne part pas, il devient un lot 4 bis, et le lot 4 merge **sans lui**. Le produit reste fonctionnel dans les deux cas — c'est la propriété qui rend cette tâche déscopable.
- [ ] **Step 2: Tests ROUGES d'abord, retrait ensuite.** Les cinq suites de §A.7 sont **REFORMULÉES vers la nouvelle surface**, jamais supprimées :
  - `StatusComposerSheetPresentationTests` — ses assertions de detent visent les montages du meuble (préparé en 4.6). Le garde-fou « au moins un site » appartient aux **deux tests qui itèrent** (`:134`, `:150`), pas au test de comptage (`:122`), qui rougit déjà seul : c'est la correction d'audit du §A.7, et la confondre reviendrait à laisser deux suites mesurer le vide en croyant en avoir protégé une troisième qui n'en avait pas besoin ;
  - `LocalizationConsistencyTests.fullyLocalizedScreens` (`:102-109`) — le chemin `StatusComposerView.swift` est **remplacé** par `ComposerMoodSurface.swift`. La liste est ADDITIVE : en retirer une entrée sans la remplacer perd un écran déclaré intégralement traduit ;
  - `NavigationContainerMigrationTests:64`, `SheetToolbarSemanticsTests:41` et `:109-110`, `StatusComposerAccessibilityTests` — retargetés sur la surface et ses sites de montage, avec leur raison d'origine conservée (les placements sémantiques `.cancellationAction`/`.confirmationAction` mirrorent correctement en RTL, et le catalogue porte `ar`).
  - **Les huit clés MIGRENT, elles ne disparaissent pas** : elles sont déjà consommées par `ComposerMoodCopy` depuis 4.4, donc la garde « dead keys » (`LocalizationConsistencyTests:86-94`) reste verte sans qu'aucune traduction ne soit refaite.
- [ ] **Step 3:** retirer le fichier. **Step 4:** gate COMPLET. **Step 5: Commit.**

**DoD :** aucun `StatusComposerView(` dans le dépôt ; les cinq suites sont vertes **et mesurent quelque chose** (le prouver en réintroduisant temporairement l'interdit sur au moins la garde de présentation, puis en retirant la fuite) ; les huit clés sont vivantes ; les trois commentaires de doctrine pointent une vue qui existe.

---

### Task 4.9: Gate final + planche P0

- [ ] `./apps/ios/meeshy.sh test` — les QUATRE phases vertes, chiffres réels consignés au commit (DerivedData privée, attente du verrou voisin).
- [ ] ~~`cd services/gateway && bun run test`~~ — **retiré par l'audit du 2026-08-24** : ce lot ne touche plus `services/gateway/**` (§A.6, 4.1 Step 5).
- [ ] `cd packages/shared && bun run build` — **si et seulement si** une tâche a touché `packages/shared`. Aucune ne le prévoit ; si l'une le fait, c'est un dépassement de périmètre à remonter.
- [ ] **Planche P0** (`docs/product/planche-meeshy-composer.html` — **rév. 22 (2026-08-24)**, posée par le lot 3, et **non rév. 18** comme l'écrivait la première rédaction de ce plan) : **relire la dernière révision avant d'écrire**. Deux faits mesurés à l'audit du 2026-08-24, à ne pas re-découvrir : (a) le fichier est **modifié NON COMMITTÉ** (`git status` : ` M`) — la rév. 22 y a été écrite mais n'est PAS dans `96b707da6` ; committer ce lot sans elle la perdrait ; (b) la planche **se contredit elle-même** — l'arc et le centre disent `62 / 70` (`conic-gradient … 318,9deg`, l. 278-281) quand la puce verte dit « Fait & testé — **57 tâches (81,4 %)** » (l. 287), et les notes de révision se contredisent aussi (rév. 17 « INCHANGÉ : 57/70 » contre rév. 22 « INCHANGÉ à 62/70 »). Ne pas choisir l'une des deux en silence : les réconcilier, ou dire laquelle fait foi. Puis : camembert ET matrice mis à jour **dans le MÊME commit que ce gate**, dénominateur porté des tâches 4.1→4.9 effectivement livrées (4.8 comptée seulement si son STOP n'a pas été posé). Un P0 périmé est un défaut bloquant au sens de §E de la spec. **Seule cette tâche touche la planche** (règle spéciale, comme B8 et F7f) ; les commits 4.1→4.8 la citent.
- [ ] Amender le §E lot 4 de la conception v2 : (a) le retrait d'`UnifiedPostComposer` **n'a pas d'exécutant** — il attend le lot qui possédera `packages/MeeshySDK/Sources/MeeshyUI/**`, et le lot 7 ne l'a pas repris (§A.7 bis) ; (b) « le client envoie enfin `targetType` » devient « le filet cesse d'être atteignable ».

---

## Ordre contraint, et POURQUOI

```
4.1  ─── indépendante, livrable seule (le seul défaut produit vivant du lot)
4.2  ─── indépendante (un champ mort quitte le fil avant qu'on le recopie)
4.3  ──▶ 4.4 ──▶ 4.5 ──▶ 4.6 ──▶ 4.7 ──▶ 4.8 (conditionnelle) ──▶ 4.9
```

- **4.3 avant 4.4** : construire une surface qu'aucune règle ne route, c'est écrire du code mort testé vert — le motif que ce dépôt a déjà gravé.
- **4.4 avant 4.5** : le socle ne peut publier un brouillon dont la forme n'existe pas encore.
- **4.5 avant 4.6** : recâbler les six déclencheurs vers un meuble qui ne sait pas publier serait une régression sèche — c'est le motif exact que la rév. 4 de `.feedComposer` retenait, et que le lot 3 vient de re-citer.
- **4.6 avant 4.7** : la republication réutilise la surface et le canal de la création. L'inverse construirait deux fois la même chose.
- **4.8 en DERNIER, et conditionnelle** : un retrait n'est légitime que si TOUS les appelants sont recâblés (4.6) **et** que la surface de remplacement tient CHACUNE des capacités (§A.8). La mesure dit qu'aucune des deux conditions n'est vraie aujourd'hui.
- **L'ordre n'est pas celui des tailles** : 4.1 est la plus petite et la plus urgente ; 4.4-4.5 sont les plus grosses et n'ont aucun effet visible tant que 4.6 n'a pas livré.
- **Dépendances externes** : **lot 3** est MERGÉ depuis l'audit du 2026-08-24 — commit `96b707da6`, `.feedComposer` à `routesToLegacy: nil`, arbre Swift propre ; les lignes citées par ce plan dans `Composer/` viennent de l'arbre d'AVANT ce merge et ont bougé (`ComposerIntent.swift` 372 l. et non 325 ; `chromeOwner` à `:269`, `servedDocumentTools` à `:413`, l'accesseur `routesToLegacy` à `:572-577`). **Rebaser et RELIRE avant la première ligne** — aucun numéro de ce plan ne doit être recopié sans être revérifié. **Lot 0 bis** est **MERGÉ** (`d4a40f600`) : sa précondition est levée. Il est orthogonal en FICHIERS — 27 fichiers, tous sous `apps/web/**` et `packages/shared/**` —, **pas en LOI** : il a posé `packages/shared/utils/repost-target.ts` (`repostTargetId = originalRepostOfId ?? repostOfId ?? id`), jumeau exact de `RepostTargeting` (`ComposerIntent.swift:351-371`) que la tâche 4.1 modifie. **Toute évolution touche les deux sites** — c'est la même règle que `composer-contract.ts` s'applique à lui-même. Et le web republie bien un mood, contrairement à ce que ce plan affirmait (voir Global Constraints, réfutation d'audit). **Lot 2** est livré (`ComposerDocumentSurface` existe et le host la monte, vérifié). **Lot 1** est livré (l'éventail respire, `MeeshyComposerHost.swift:437` — l'éventail est bien monté, contrairement à ce que la ligne C3 de la planche affirme encore). **Lot 5** entre en collision sur `MeeshyComposerHost.init` (voir Global Constraints) : le lot 4 passe en premier. **Lot 7** absorbe `onPublishDocument` — mais il **ne reprend PAS** le retrait d'`UnifiedPostComposer` : il ne l'a jamais accepté, et ce retrait n'a aujourd'hui aucun exécutant (§A.7 bis).

---

## Les pièges NOMMÉS

1. **Une garde NÉGATIVE dont la cible disparaît passe au VERT en perdant sa protection.** Trois fois dans ce lot : `LegacyComposer.statusComposer` doit RESTER dans l'énum pour que la garde du mood puisse nommer son interdit (4.6) ; `StatusComposerSheetPresentationTests` doit gagner un « au moins un site » avant que 4.8 ne vide sa boucle ; `fullyLocalizedScreens` doit être REMPLACÉE, pas amputée. **Reformuler, jamais supprimer** — et le prouver en réintroduisant l'interdit une fois, puis en le retirant.
2. **Un fichier de test NEUF n'est PAS exécuté par `xcodebuild` tant qu'il n'est pas dans `project.pbxproj`.** Une seule création dans ce lot : `ComposerMoodSurfaceTests.swift` (4.4). Lancer `xcodegen generate` puis **greffer le delta pbxproj** (jamais committer un pbxproj régénéré en bloc : il emporte le WIP des worktrees voisins). Symptôme du piège : 29 suites sur 30 vertes, la trentième jamais exécutée. **La distinction compte** : les tests SDK (`packages/MeeshySDK/Tests/**`, tâche 4.2) sont découverts par SPM et n'ont besoin d'aucune inscription.
3. **Isolation MainActor par défaut (Swift 6.2) sur la cible app.** `ComposerMoodPolicy` et `ComposerChromeOwnership` sont `nonisolated`, comme tout le reste du dossier (`ComposerIntent.swift:14-17` dit pourquoi : sans cela, jusqu'aux conformances `Equatable` deviennent inutilisables hors du main actor, et une règle ne s'exécute pas — elle se lit, depuis n'importe où).
4. **Pas de `@ViewBuilder` imbriquant un `if #available`.** Débordement de pile par PROFONDEUR DE TYPE : 1008 Ko de pile sur appareil contre 8 Mo au simulateur — le crash n'apparaît QUE sur appareil. `ComposerMoodSurface` a six blocs ; les composer par des propriétés nommées, jamais par un `@ViewBuilder` conditionnel imbriqué.
5. **Le catalogue iOS a SEPT locales** (`ar`, `de`, `en`, `es`, `fr`, `it`, `pt-BR`) et le cliquet français est à ZÉRO tolérance. Ce lot n'ajoute **aucune** clé : les huit du mood MIGRENT (4.4), et `composer.format.status` existe déjà. Le glissement à surveiller est le littéral posé dans une vue — invisible au cliquet, jamais traduit (le motif que `ComposerDocumentSurface.swift:244-249` consigne pour douze sites de `FeedView+Attachments.swift`).
6. **`ar` est au catalogue : la surface doit tenir en RTL.** Placements sémantiques (`.cancellationAction` / `.confirmationAction`), jamais `.navigationBarLeading`/`.navigationBarTrailing` — c'est exactement ce que `SheetToolbarSemanticsTests` interdit et ce que `StatusComposerView.swift:104-108` explique.
7. **Un commentaire qui énonce un invariant PLUS LARGE que son correctif devient la loi lue par la suivante.** Deux sites dans ce lot : `PostService.ts:2243-2262` (4.1 Step 5) et le paragraphe `chromeOwner` de `MeeshyComposerHost.swift:252-268` (4.5 Step 3). Les deux doivent être réécrits **avec** le code, pas après.
8. **Un schéma de réponse Fastify TRONQUE en silence les champs non listés**, et un `z.object()` **écarte en silence** les clés d'entrée inconnues. C'est ce second mécanisme qui a laissé `viaUsername` vivre trois versions sans jamais rien porter (§A.5). Ce lot n'ajoute aucun champ au fil ; s'il finissait par en ajouter un, la vérification est le schéma, pas le modèle client.
9. **L'arbre est PARTAGÉ.** Chaîner tout `cd` (`cd … && …`) — un `cd` qui échoue fait tourner la suite dans l'arbre principal. Committer par chemins explicites (`git commit -- <chemins>`), jamais `git add -A` : deux workflows voisins ont du WIP non committé en ce moment même.

---

## Ce que le lot NE fait PAS — dit une fois, opposable

Renvoi à **§G « Hors v2 »** de la conception et à **§F « Hors v1 »** de la spec d'exécution, toutes deux opposables. S'y ajoute, propre à ce lot :

- **le retrait d'`UnifiedPostComposer.swift`** — **sans exécutant à ce jour**, et non « reporté au lot 7 » comme l'écrivait la première rédaction : le fichier vit sous `packages/MeeshySDK/Sources/MeeshyUI/Story/` (739 l.), que ce lot s'interdit et que le lot 7 déclare non ouvert. Il attend le lot qui possédera `MeeshyUI` (§A.7 bis, tâche 4.8) ; le §E lot 4 est amendé en 4.9 ;
- **le repost de STORY, de POST et de RÉEL par le meuble** — les trois gardent leur chemin. Le meuble n'a ni graine `StoryItem`, ni `repostOfId` dans son canal de scène, ni plafond `StoryRepostAudience` jusqu'à l'atelier ;
- **les huit reposts « un tap »** — ils ne deviennent PAS des composers. Transformer un geste d'un tap en écran plein serait une régression produit que rien dans la conception ne demande ;
- **la republication de mood par `POST /posts/:id/repost`** — le chemin 2 reste. Dette nommée en 4.7, non vivante (§A.6) ;
- **la rangée photo·caméra·emoji·document·lieu·micro** du document (`servedDocumentTools` rend `[]`) — dette du lot 2/3, hors sujet pour un mood qui n'a pas de pièce jointe ;
- **la réconciliation du plafond 122 (iOS) / 140 (web)** — lot 6, le contrat partagé ;
- **toute modification de `packages/MeeshySDK/Sources/MeeshyUI/**`** — règle de pureté SDK ; les conditions de levée nommées par `MeeshyComposerHost.swift:381-383` et `:518-529` ne se remplissent pas ici ;
- **Android** — mis de côté par directive du 2026-08-23, lot H suspendu, sans tâche ni gate.

---

## Gate de sortie

```bash
cd /Users/smpceo/Documents/v2_meeshy-composer/apps/ios && ./meeshy.sh test
cd /Users/smpceo/Documents/v2_meeshy-composer/services/gateway && bun run test
```

**Ce que le premier doit rendre** : les quatre phases vertes — `Phase 0 (package MeeshySDK) : verte`, `Phase 1 (isolées) : verte`, `Phase 2 (connexion & contenu) : verte`, `Phase 3 (état connecté) : verte` — **plus** `Garde d'orphelins : toutes les classes de test sont dans le bundle compilé`. Cette dernière ligne est la seule qui prouve que `ComposerMoodSurfaceTests` s'est réellement exécutée (Piège 2) ; un gate vert sans elle ne prouve rien sur un fichier de test neuf.

**Ce que le second doit rendre** : suites vertes, inchangées — la seule modification gateway du lot est un commentaire.

**Ce qu'aucun des deux ne prouve, et qu'il faut vérifier à la main avant le merge** : les sept blocs de §A.8 à l'exécution, sur simulateur, pour les **six** déclencheurs — le rail Lentille, le tray classique et l'état vide de `ConversationListView`, le tray de `RootViewComponents`, et les deux `onRepublish` des racines de fenêtre. Une garde de source prouve qu'un appel existe ; elle ne prouve pas qu'un emoji se peint.
