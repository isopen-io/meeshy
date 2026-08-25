# Lots v2 **2** et **3** — la surface « document sans scène » (I6) et la porte la plus utilisée — PLAN D'EXÉCUTION

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:executing-plans`. Les steps sont cochables (`- [ ]`).

**But produit, en une phrase.** Les cinq outils de la barre du composer — photo,
caméra, document, lieu, micro — **font enfin quelque chose**, l'auteur **déclare
la langue** de son post au lieu de se la voir imposer en « fr », et la feuille de
composition la plus utilisée de l'app passe par le meuble unifié **sans rien
perdre** de ce qu'elle offrait.

**Mesuré le 2026-08-25 sur `/Users/smpceo/Documents/v2_meeshy-composer-v2`,
branche `feat/composer-v2-ios-2026-08-25`, HEAD `872151e55e`** (base `ae52866a8c`
+ `872151e55e`). Toute ligne du §A a été relue à la source, dans CET arbre ;
les numéros de ligne sont ceux de cet arbre.

> **Aucun build, aucun test, aucun simulateur n'a été lancé pour écrire ce plan.**
> Toute phrase « cette garde rougirait » est une lecture de source. Les
> affirmations d'EXISTENCE (une garde VERTE qui assère déjà X) sont, elles, des
> lectures de tests présents dans l'arbre. Ce qui n'a pas été vérifié est au §J.

**Ce plan étend, sans les remplacer**, le §E lots 2 et 3 de
`docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md`. Il **corrige
trois affirmations** de l'audit du 2026-08-25 (§3.1 items 7-9, §3.2 items 16-19)
et **ajoute une condition de levée** que ni la spec, ni l'audit, ni les
doc-comments du dépôt n'avaient écrite (§A.3).

---

## 0. Ce que ce plan tranche, en une page

| Question | Réponse TRANCHÉE | Preuve |
|---|---|---|
| Quel PUBLIEUR accepte les cinq canaux ? | **`FeedViewModel.publish(_ intent: PublishIntent)`** (`FeedViewModel.swift:888`) → `enqueueDurableMediaPost` (`:912`), qui enfile SANS condition réseau. **Pas** `createPost(mediaIds:)` : il n'est durable que `!hasMedia && audioUrl == nil` (`FeedViewModel.swift:578-587`) — un post média y part par le chemin DIRECT, perdu hors ligne. `PublishIntent` gagne donc une **seconde fabrique**, `document(…)`. | §A.1, §B |
| Où vivent les médias / le lieu / la langue en cours de composition ? | Dans le **MEUBLE** (`MeeshyComposerHost`), à côté de `documentText` (`:347`), et pour la MÊME raison écrite là : la loi 9 autorise à changer de format, jamais à jeter ce qui est composé. La surface reste sans état. | §B.0 |
| Qui monte les cinq sélecteurs ? | Le **meuble**, par `handleDocumentTool(_:)` (`MeeshyComposerHost.swift:850`), aiguillé sur l'**EFFET** et jamais sur l'outil — le patron que l'emoji a déjà. Les sélecteurs sont ceux du dépôt : `photosPicker`, `CameraView`, `fileImporter`, `LocationPickerView`, `AudioPostComposerView`, plus `ComposerDropResolver`/`ComposerIngestRouter` pour le routage MIME. **Jamais un second pipeline.** | §B |
| L'éventail se peint-il sous `.feedComposer` ? | **NON, et le lot 3 ne le retourne pas.** `paints(.document, .keyboardOnContent, [.post, .story…]) == false` — mesuré, et un test **VERT** l'assère déjà (`("composer du fil · Post", .feedComposer, .post, false)`). La bascule POST↔RÉEL est servie comme sur la feuille absorbée : un **interrupteur** `forcePlainPost`, pas un éventail. | §A.3, §D |
| Que devient la CITATION ? | Elle **reste sur `FeedComposerSheet`**. `ComposerDocumentSendPlan` refuse `.quotedRepost` (non durable, `ComposerDocumentSurface.swift:487-493`) et `.repost(sourceFormat: .post)` route vers le composer historique. Condition de levée nommée : **7.5** (un écrivain durable du repost ; fondation livrée, ZÉRO appelant). | §A.4, T3.2 |
| `FeedComposerSheet` est-elle retirée ? | **NON dans ces lots** — et c'est écrit, pas tu. Sa double preuve ne peut pas être obtenue ici : deux de ses quatre sites de présentation sont des citations (voir ci-dessus). T3.5 pose le STOP et l'inventaire. | T3.5 |
| Ordre contraint | `2.1 → 2.2 → 2.3 → 2.4 → 2.5 → 2.6` puis `3.1 → 3.2 → 3.3 → 3.4 → 3.5`. Trois invariants durs au §E. | §E |

---

## A. Mesure — ce que j'ai vérifié moi-même

### A.0 Ce que l'audit dit de VRAI (re-vérifié, sans réserve)

- **Les cinq outils n'ont aucun effet.** `ComposerDocumentTool.effect`
  (`ComposerDocumentSurface.swift:400-407`) rend `.insertsEmojiIntoText` pour
  `.emoji` et **`nil`** pour `.photo, .camera, .document, .place, .microphone`.
  `servedRow` (`:415-417`) est une PROJECTION (`canonicalRow.filter { $0.effect != nil }`),
  donc la rangée servie compte **un** outil sur six.
- **Le brouillon n'a aucun canal.** `ComposerDocumentDraft`
  (`ComposerDocumentSurface.swift:805-817`) porte exactement sept champs :
  `format, text, emoji, visibility, visibilityUserIds, mentions, repostOfId, audioUrl`.
  **Ni `mediaIds`, ni fichier, ni lieu, ni langue** — vérifié champ par champ.
  Sa fabrique `document(…)` (`:888`) pose `emoji: nil`, `mentions: nil`,
  `audioUrl: nil`.
- **La langue est une CONSTANTE.** `DocumentComposerDoor.publish`
  (`ComposerDocumentSurface.swift:1258`) passe
  `originalLanguage: DefaultComposerLanguage.resolve()` (`:1273`), et
  `DefaultComposerLanguage.resolve()` rend `"fr"` en dur
  (`ComposerModels.swift:109-116`).
- **`DocumentComposerDoor` n'a aucun site de montage.** Déclarée
  `ComposerDocumentSurface.swift:1192`, `grep "DocumentComposerDoor("` hors sa
  propre déclaration rend **zéro**.
- **Les quatre portes de présentation n'ont pas bougé** :
  `RootViewComponents.swift:899` (le plein composer iPhone), `:911` (citation
  iPhone), `FeedView.swift:1782` (citation iPad), et l'overlay INLINE iPad
  (`FeedView.swift:59` le booléen, `:624-625` le montage, `:1401` le corps).
- **`.feedComposer` désigne bien le meuble** : `routesToLegacy: nil`
  (`ComposerIntent.swift:303`, branche `case .feedComposer`).
- **G8 confirmé** : `grep -rn "userInterfaceIdiom\|horizontalSizeClass\|isPad"`
  sous `apps/ios/Meeshy/Features/Main/Composer/` rend **0 occurrence** sur les
  13 fichiers du dossier.
- **Le cliquet français est à ZÉRO tolérance** :
  `MeeshyTests/Resources/FrenchDefaultValueDebt.json` contient **0 clé**
  (mesuré). Le catalogue `apps/ios/Meeshy/Localizable.xcstrings` porte
  **3369 clés** en **7 locales** (`ar, de, en, es, fr, it, pt-BR` — `fr` en
  compte 2949, les autres 3342 chacune, l'écart étant les clés dont le français
  vient du `defaultValue`).

### A.1 Correction n° 1 — **le publieur existe déjà, et ce n'est pas `createPost`**

L'audit (item 7) écrit : « Chaque outil demande un champ sur
`ComposerDocumentDraft` **et** un publieur qui l'accepte », et range
`FeedViewModel.swift` dans ses fichiers. C'est juste, mais il manque la moitié
qui décide de la forme du lot : **le publieur qui accepte ces canaux est déjà
écrit, testé, et il a deux appelants de production.**

```
PublishIntent (apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift:52)
  ├─ clientMutationId, type, localMediaURLs, localMediaMimeTypes
  ├─ content, visibility, visibilityUserIds
  ├─ originalLanguage          ← le canal de la LANGUE (V2-langue) EXISTE
  ├─ mentions, location        ← le canal du LIEU (outil « lieu ») EXISTE
  ├─ discoverabilityPrecision  ← le second opt-in de proximité EXISTE
  └─ mobileTranscription       ← ce qui QUALIFIE un vocal (outil « micro ») EXISTE
```
→ `FeedViewModel.publish(_:)` (`FeedViewModel.swift:888`) → `enqueueDurableMediaPost`
(`:912`) : insertion optimiste + `offlineQueue.enqueuePostMedia`, **sans condition
réseau** (« Aucune condition réseau ici, et c'est une décision », doc-comment
`:876-884`).

**Le mauvais publieur est à portée de main, et il est plausible.**
`FeedViewModel.createPost(… mediaIds: …)` compile, existe, et c'est celui que la
feuille absorbée appelle en ligne (`FeedView+Attachments.swift:1817`). Mais son
gate de durabilité est :

```swift
let isDurableTextOnly = type == "POST" && !hasMedia && audioUrl == nil   // :578-581
```

Un post MÉDIA y prend donc la branche DIRECTE (`postService.create`, `:591`), qui
n'a ni file ni rejeu : **composé hors ligne, il est perdu**. Le brancher là
aurait donné un lot 2 vert, une démo qui marche, et une perte de contenu
silencieuse à la première coupure réseau — exactement la forme de défaut que le
lot 7 vient de fermer sur les deux jumeaux vocaux.

**Conséquence pour la forme du lot** : `PublishIntent` gagne une **seconde
fabrique nommée**, `document(…)`, et non un champ de plus sur `audioRecording`.
Ses trois règles gravées (`PublishIntent.swift:17-33`) s'appliquent telles quelles
— init privé, aucun défaut, `type` = chaîne SERVEUR élue par
`ReelComposition.defaultType`.

> **Ce que cette fabrique NE fait PAS** : elle ne remplace pas la branche TEXTE.
> Un document sans média reste servi par `viewModel.createPost(content:…)`, qui
> enfile lui-même sa ligne durable (`:582-586`). Deux gestes, deux chemins, une
> seule décision — et c'est `ComposerDocumentSendPlan` qui la prend (§B.1).

### A.2 Correction n° 2 — **la garde de la porte se retourne en TROIS temps, pas en un**

L'audit parle des « DEUX conditions de levée ». Le test en porte **six
assertions**, et elles ne tombent pas dans la même tâche.
`ComposerDocumentSurfaceTests.test_laPorteDuDocument_nEstMonteeParAucunSiteDeProduction_etCEstLaRangeeQuiLaRetient`
(`:2326-2386`) :

| # | assertion (verbatim abrégé) | tombe à |
|---|---|---|
| 1 | `XCTAssertEqual(declarations, 1, "La porte doit exister, et une seule fois…")` | jamais — prémisse |
| 2 | `XCTAssertEqual(montages, 0, "…Retourner ce test, ne pas le supprimer.")` | **T3.1** |
| 3 | `XCTAssertNotEqual(ComposerDocumentTool.servedRow, ComposerDocumentTool.canonicalRow, "…C'est la PREMIÈRE des deux conditions…")` | **T2.6** (le dernier outil qui gagne son effet) |
| 4 | `XCTAssertTrue(envoi.contains("originalLanguage: DefaultComposerLanguage.resolve()"), "…retourner cette assertion, pas la supprimer.")` | **T2.2** |
| 5 | `XCTAssertEqual(DefaultComposerLanguage.resolve(), "fr", "La prémisse de l'assertion ci-dessus…")` | jamais — prémisse, et **elle reste** (`resolve()` ne change pas ; c'est la PORTE qui cesse de l'appeler) |
| 6 | `XCTAssertFalse(porte.contains("originalLanguage") && porte.contains("ComposerLanguageFlag"), "Le meuble a gagné une capsule de langue… puis RETOURNER ce test.")` | **T2.2** |

La seconde garde,
`MeeshyComposerHostGuardTests.test_aucunSiteDeProduction_neMonteUnePorteDocument_tantQueLeDocumentEstUneImpasse`
(`:1595`), est **CONDITIONNELLE** — `let sites = try sitesDeProductionOuvrantUnePorteDocument(); guard !sites.isEmpty else { return }`.
Elle est donc **VACUOUS aujourd'hui** : elle ne s'exécute pas. Elle s'ARME à T3.1,
et exige alors ses trois booléens VRAIS :

- `sertLaRangee` — `leMeubleSertLaRangeeDuDocument()` : dépend de
  `servedRow == canonicalRow` ⇒ **T2.6 doit précéder T3.1** ;
- `saisieAUneIssue` — déjà vrai (`onPublishDocument`, lot 4.5) ;
- `publieurAtteignable` — déjà vrai (socle publieur, lot 4.5/4.9).

> **C'est la PREUVE de l'ordre contraint du §E de la spec**, et elle est
> exécutable : le lot 3 ne peut pas partir avant le lot 2 sans faire rougir une
> garde qui, aujourd'hui, ne mesure encore rien.

Son doc-comment (`:1583-1590`) consigne par ailleurs un trou **à ne pas
redécouvrir** : elle filtre sur `portesDocumentDuMeuble`, c'est-à-dire des portes
dont l'`initialFormat` OUVRE un document. `RootView.swift` et `iPadRootView.swift`
atteignent le document par **bascule de format** (`.repost(.status)` → « Post ») et
lui échappent. **Ce plan ne comble pas ce trou** (§H) : le préjudice y est nul —
on ancre une humeur, pas une composition média — et l'ancrage est tenu par
`ComposerDocumentSurfaceTests.test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint`,
et par lui seul.

### A.3 Correction n° 3 — **une TROISIÈME condition de levée, écrite nulle part**

L'audit énumère deux conditions (rangée, langue). Il en manque une, et elle n'est
pas une dette : c'est une **RÈGLE qui refuse**.

`ComposerProfile.profile(for: .feedComposer)` (`ComposerIntent.swift:301-309`) :

```swift
initialFormat: .post,
offeredFormats: plusReel([.post, .story]),
opensWith: .keyboardOnContent,
```

`ComposerFormatFanPlacement.paints` (`ComposerFormatFan.swift:98-112`) exige que
**tous** les formats offerts atterrissent du même côté de la frontière
scène / pas-de-scène que la surface montée :

```swift
case .document, .mood: return offeredFormats.allSatisfy { !monteUneScene($0) }
```

Or `ComposerSurfaceRouting.surface(opening: .keyboardOnContent, format: .story)`
rend **`.scene`** (`ComposerDocumentSurface.swift:83-89`). Donc
`paints(.document, .keyboardOnContent, [.post, .story]) == false` ⇒
`mounts == false` ⇒ **aucun sélecteur de format n'est peint sous `.feedComposer`**.

Ce n'est pas une déduction : **deux tests VERTS l'assèrent déjà**, en toutes
lettres —

```
("composer du fil · Post",     .feedComposer, .post,     false)   // test_lePlacementDeLEventail_suitLaSurfaceOuAtterrissentSesFormats (:544)
("composer du fil · document", .feedComposer, .document, false)   // test_lesDeuxReglesDeLEventail_seLisentENSEMBLE_dansUneSeuleRegle  (:614)
```

et la règle nomme elle-même ce cas comme celui qui la rend nécessaire
(`ComposerFormatFan.swift:80-86`) : « Descendre l'éventail sous son document ferait
disparaître la saisie sans un mot, sur la porte la plus fréquentée de l'app. Sa
condition de levée est côté SDK — un écrivain public de TEXTE atteignable par le
meuble — et l'éventail y descendra AVEC le transfert de la saisie, jamais avant lui. »

Le blocage SDK est mesuré et daté (`MeeshyComposerHost.swift:779-796`) : sur les
14 fichiers `StoryComposerViewModel*.swift`, **aucun écrivain public n'accepte du
TEXTE**. `MeeshyUI` n'appartient à aucun lot v2 (audit item 23).

**Décision — §D.** L'offre de `.feedComposer` n'est PAS touchée, l'éventail n'est
PAS descendu, et **la bascule POST ↔ RÉEL est servie comme sur la feuille
absorbée : par un interrupteur `forcePlainPost`, pas par un éventail** (T2.6).

### A.4 La CITATION — le meuble la REFUSE aujourd'hui, mesuré

Deux des quatre portes de présentation (`RootViewComponents.swift:911`,
`FeedView.swift:1782`) montent la feuille en mode **citation**
(`quotePost:`), qui publie par `viewModel.repostPost(id, content:, isQuote: true)`
(`FeedView+Attachments.swift:1716`).

Le meuble ne peut pas la servir, pour **deux** raisons indépendantes :

1. `ComposerDocumentSendPlan.plan` (`ComposerDocumentSurface.swift:633-657`) appelle
   `ComposerDocumentSendRouting.path(isQuote: draft.repostOfId != nil, …)`, qui rend
   `.quotedRepost` — dont `isDurable` est **`false`** (`:488-493`) — puis
   `guard chemin.isDurable else { return .refuse(.nonDurablePath(chemin)) }`.
   **Un brouillon de citation est REFUSÉ par le plan d'envoi.**
2. La porte d'une citation de post serait `.repost(ofPostId:, sourceFormat: .post)`,
   dont le profil route vers le composer HISTORIQUE — le routage de `.repost` est
   fonction du FORMAT PORTÉ depuis le lot 4.7 (`ComposerIntent.swift:359-388`), et
   seul `.status` passe au meuble.

**Condition de levée nommée : 7.5** — « le repost a un écrivain unique ». Sa
fondation est livrée (`OutboxKind.repostPost`, `RepostPostPayload`,
`dispatchRepostPost`) et **n'a zéro appelant** ; les 8 sites appellent toujours
`PostService.repost` en direct. Hors périmètre ici (§H).

### A.5 Ce que la mesure ajoute, et que personne n'avait écrit

1. **Sur iPhone, `initialText` est TOUJOURS `""` et `pendingAttachmentType`
   TOUJOURS `nil`.** Dans `RootViewComponents.swift`, `composerText` (`:107`) n'est
   jamais assigné hors de sa remise à zéro (`:906`), et `pendingAttachmentType`
   (`:120`) n'est jamais posé (seulement remis à `nil`, `:905`). Les deux seuls
   armements de `showFullComposer` sont le lien profond (`:112-116`) et le bouton
   placeholder (`:690`). **T3.1 n'a donc besoin ni de graine de texte ni d'outil
   pré-ouvert** — c'est l'overlay iPad qui les porte (point 2).
2. **L'overlay inline iPad a un hôte UNIQUE et cinq armements.** `FeedView()` n'est
   monté que par `iPadRootView.swift:396` — mesuré, une seule occurrence dans tout
   `apps/ios/Meeshy`. `showComposer = true` y est écrit à **cinq** sites :
   `FeedView.swift:733` (le placeholder), `:766` (photo), `:782` (caméra), `:808`
   (fichier), `:824` (lieu) — chacun posant `pendingAttachmentType` avant, sauf le
   premier ; l'audio, lui, ouvre `showAudioComposer` **sans** passer par le
   composer (`:793-800`). C'est une **seconde implémentation complète**, avec son
   propre chemin d'envoi (`FeedView+Attachments.swift:285-545`), sa propre langue
   (`FeedView.swift:96`), ses propres références (`:67`) — et **aucune garde ne la
   nomme** : `LegacyComposer` (`ComposerIntent.swift:149-151`) déclare
   `statusComposer, repostComposer, storyEdit, editPostSheet, feedComposer`, et le
   commentaire de `.feedComposer` le dit lui-même (`ComposerIntent.swift:245-247`) :
   « le composer INLINE de l'iPad (`FeedView.composerOverlay`, que `LegacyComposer`
   ne nomme même pas) ».
3. **Les six libellés d'outils sont DÉJÀ traduits.** `ComposerDocumentCopy.label(_:)`
   (`ComposerDocumentSurface.swift:969-989`) sert `composer.attach.photo / .camera /
   .emoji / .file / .location / .voice`, présents dans les **7** locales du
   catalogue (vérifié clé par clé). **V2-rangée n'a besoin d'AUCUNE clé neuve pour
   les cinq outils.**
4. **Les libellés de la feuille absorbée ÉCHAPPENT au cliquet français, et il ne
   faut pas les recopier.** `FeedView+Attachments.swift:1173, 1179, 1185, 1191,
   1197, 1203, 1224` écrivent `String(localized: "Ajouter une photo", defaultValue:
   "Ajouter une photo")` — le français EN GUISE DE CLÉ. Le cliquet ne les voit pas :
   sa regex de clé est `"([A-Za-z0-9_][A-Za-z0-9_.\-]*)"`
   (`FrenchDefaultValueRatchetTests.swift:77-79`), qui **ne peut pas matcher une clé
   contenant des espaces**. La dette est donc à zéro *et* ces sept sites sont
   invisibles. Toute chaîne neuve du meuble prend une clé **symbolique** au
   catalogue, en 7 langues.
5. **Tous les types de canal sont déjà `Equatable` et `Sendable`** — condition pour
   qu'ils entrent dans `ComposerDocumentDraft: Equatable` et `PublishIntent:
   Equatable, Sendable` sans rien inventer : `SharedPlace: Codable, Equatable,
   Hashable, Sendable` (`SharedPlace.swift:15`), `MobileTranscriptionPayload: Codable,
   Sendable, Equatable` (`ServiceModels.swift:59`), `MobileTranscriptionSegment` idem
   (`:43`), `DiscoverabilityPrecision` et `PostMentionInput` déjà portés par
   `PublishIntent`.
6. **La feuille absorbée porte SEIZE choses, pas six.** Inventaire relu ligne à
   ligne sur `FeedComposerSheet` (`FeedView+Attachments.swift:842-1961`, ≈ 1 120
   lignes) — voir §C. Cinq d'entre elles ne sont ni dans la rangée, ni dans la
   langue, et deux **ne seront pas absorbées par ces lots**.

---

## B. Décision — LE CANAL, LE SÉLECTEUR, LE PUBLIEUR, outil par outil

### B.0 Où vit l'état d'ingestion : dans le MEUBLE

`ComposerDocumentSurface` est une vue SANS état : `@Binding var text`,
`let tools`, `let focusesOnAppear`, `let onClose`, `var onTool`
(`ComposerDocumentSurface.swift:1012-1040`). L'emoji le prouve — c'est le meuble
qui tient `showsEmojiPicker` et qui écrit `documentText += emoji`
(`MeeshyComposerHost.swift:874`).

Les nouveaux états rejoignent `documentText` (`MeeshyComposerHost.swift:347`),
**pour la raison déjà écrite là** (`:351-357`) : ils sont l'état du MEUBLE, ils
survivent à une bascule de format, et la loi 9 autorise à changer de format,
jamais à jeter ce qui est composé.

```swift
// MeeshyComposerHost.swift — à côté de documentText
@State private var documentMedia: [ComposerDocumentMedia] = []
@State private var documentPlace: SharedPlace?
@State private var documentLanguage: String = DefaultComposerLanguage.resolve()
@State private var documentForcePlainPost = false
@State private var documentTranscription: MobileTranscriptionPayload?
```

> **Ne PAS créer un ViewModel pour cela.** Le meuble n'en a pas, la surface non
> plus, et en introduire un ici ferait naître un troisième propriétaire d'état de
> composition à côté de `StoryComposerViewModel` et du `@State` du meuble.

### B.1 La table, outil par outil

| outil | canal sur `ComposerDocumentDraft` | sélecteur RÉUTILISÉ | ce que le publieur en fait |
|---|---|---|---|
| **photo** | `localMedia: [ComposerDocumentMedia]` (url locale + mime déclaré + durée) | `.photosPicker(selection:maxSelectionCount:matching:)` — patron `FeedView+Attachments.swift:1264` | `PublishIntent.localMediaURLs` / `.localMediaMimeTypes` |
| **caméra** | idem | `CameraView` (`Components/CameraView.swift`) — patron `:1269-1278` | idem |
| **document** | idem | `.fileImporter(allowedContentTypes:[.item], allowsMultipleSelection:)` — patron `:1265` | idem |
| **lieu** | `location: SharedPlace?` + `discoverabilityPrecision: DiscoverabilityPrecision?` | `LocationPickerView` (`Components/LocationPickerView.swift`) — patron `:1280` | `PublishIntent.location` / `.discoverabilityPrecision` |
| **micro** | `localMedia` (le fichier audio) + `mobileTranscription: MobileTranscriptionPayload?` | `AudioPostComposerView` (`Views/AudioPostComposerView.swift`) — patron `:1240-1252` | `PublishIntent.localMediaURLs` + `.mobileTranscription` |
| **emoji** | *(aucun — il écrit dans `text`)* | `EmojiPickerSheet` — DÉJÀ monté | — |

**Le routage MIME est celui du dépôt, et rien d'autre** :
`ComposerIngestRouter.route(mime:)` (`Components/ComposerDropResolver.swift:30-41`)
et `ComposerDropResolver` (`:110`), déjà consommés par la feuille aux deux
extrémités (`FeedView+Attachments.swift:134`, `:1644`). **Écrire un second
classement image/vidéo/audio/fichier ici serait le second pipeline que la
doctrine interdit** — et il divergerait à la naissance, pas un jour.

### B.2 La fabrique `PublishIntent.document(…)`

```swift
// apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift
/// Le geste « **j'ai composé un post** » — du texte, des pièces, une position.
/// AUCUN paramètre n'a de valeur par défaut (garde de source existante,
/// `PublishIntentTests.test_laFabriqueDeLIntention_nePoseAucunDefaut`, à
/// ÉTENDRE à cette seconde fabrique).
static func document(
    localMedia: [ComposerDocumentMedia],
    content: String?,
    visibility: String,
    visibilityUserIds: [String]?,
    originalLanguage: String?,
    mentions: [PostMentionInput]?,
    location: SharedPlace?,
    discoverabilityPrecision: DiscoverabilityPrecision?,
    transcription: MobileTranscriptionPayload?,
    forcePlainPost: Bool
) -> PublishIntent
```

- `type` élu par `ReelComposition.defaultType(mimeTypes:durationsMs:forcePlainPost:)`
  — **jamais un littéral**, exactement comme `audioRecording` (`PublishIntent.swift:152-156`).
- `originalLanguage` vient du meuble (T2.2). **Contraste assumé avec
  `audioRecording`**, qui refuse tout paramètre de langue parce que la langue d'un
  vocal est celle qu'on PARLE (`PublishIntent.swift:126-133`) : ici la langue est
  celle que l'auteur DÉCLARE pour un texte qu'il vient d'écrire, et c'est le
  Prisme qui l'exige (`CLAUDE.md`, règle « `originalLanguage` = langue déclarée
  par l'auteur, jamais devinée »). Les deux règles sont différentes parce que les
  deux gestes le sont — et ce plan l'ÉCRIT, faute de quoi la session suivante
  « harmoniserait ».

### B.3 L'aiguillage de la porte

`DocumentComposerDoor.publish` (`ComposerDocumentSurface.swift:1258`) garde ses
trois temps (plan → modèle → issue) et gagne **une** bifurcation, décidée par le
PLAN et jamais par un `if` local :

```swift
switch ComposerDocumentSendPlan.plan(for: draft, isOffline: NetworkMonitor.shared.isOffline) {
case .send(.textOnly):       await viewModel.createPost(…)                        // inchangé
case .send(.durableOutbox):  await viewModel.publish(PublishIntent.document(…))   // NEUF
case .send(.upload), .send(.quotedRepost), .refuse:  return refuse()   // le refus se DIT
}
```

et `ComposerDocumentSendPlan.plan` cesse de passer `hasLocalMedia: false` en dur
(`:652`) : il lit `!draft.localMedia.isEmpty`. **`ComposerDocumentSendRouting`
n'est PAS touchée** — sa garde d'appelant unique
(`test_leRoutageDEnvoi_nAQuUnSeulAppelant_etCEstLeMeuble`) reste verte, et c'est
elle qui interdit le second chemin d'envoi.

> ⚠️ **`.upload` reste REFUSÉ.** `path(hasLocalMedia: true, isOffline: false)` rend
> `.upload`, non durable. La règle du meuble est donc : **un média local part par
> la file durable, en ligne comme hors ligne** — le CONSTANT que le lot 7.4b a
> déjà tranché pour les deux jumeaux vocaux (`PublishIntent.swift` /
> `FeedViewModel.publish` doc-comments). Ce qu'on y perd est mesuré et nul : ni
> `publishAudioPost` ni `publishAudioFromSheet` n'écrivaient `uploadProgress`. Ce
> qu'on y perd VRAIMENT par rapport à la FEUILLE, en revanche, c'est sa barre de
> progression (`UploadProgressBar`, `FeedView+Attachments.swift:1149`) — **dette
> nommée D-1 au §H**, à ne pas découvrir à T3.1.

---

## C. Ce que la feuille porte — inventaire des SEIZE, et ce que le meuble doit tenir

Relu ligne à ligne sur `FeedComposerSheet` (`FeedView+Attachments.swift:842-1961`).

| # | ce que la feuille porte | site | tenu par |
|---|---|---|---|
| 1 | texte + focus différé 0,3 s | `:853`, `:1357-1362` | **déjà** (`ComposerDocumentSurface.focusDelay`, `:1047`) |
| 2 | `initialText` (graine de texte) | `:844`, `:1358` | **sans objet sur iPhone** (§A.5-1) ; iPad → T3.4 |
| 3 | `pendingAttachmentType` (outil pré-ouvert) | `:845`, `:1367-1375` | **sans objet sur iPhone** ; iPad → T3.4 |
| 4 | six outils d'attache | `:1166-1204` | **T2.3 / T2.5 / T2.6** |
| 5 | capsule de LANGUE + sélecteur | `:909`, `:1207-1227`, `:1253-1263` | **T2.2** |
| 6 | audience + liste nommée | `:881-901` | **déjà** (lot 4.9, socle) |
| 7 | bascule `forcePlainPost` | `:906`, `:936-948` | **T2.6** |
| 8 | lieu + tuile + second opt-in | `:863`, `:1139-1144`, `:1690-1695` | **T2.5** |
| 9 | références (`ReferenceComposerBar`) | `:913`, `:1159-1163`, `:1700-1703` | **NON — dette D-2 (§H)** |
| 10 | citation (`quotePost`) | `:846`, `:1713-1718` | **NON — T3.2, condition 7.5** |
| 11 | cible de dépôt (drag & drop) | `:1235-1238` | **NON — dette D-3 (§H)** |
| 12 | éditeur d'image / prévisualisation vidéo | `:1291-1352` | **NON — dette D-4 (§H)** |
| 13 | barre de progression d'upload | `:1147-1151` | **NON — dette D-1 (§H)**, sans objet sur file durable |
| 14 | tuiles de pièces en préparation | `:1379-1395` | **T2.3** (une tuile par média, sans édition) |
| 15 | son EMPRUNTÉ (`onPublishBorrowed`) | `:1247-1250`, `:1899-1910` | **NON — dette D-5 (§H)** |
| 16 | sortie (`onDismiss`) | `:847` | **déjà** (`onClose`, `ComposerDocumentSurface.swift:1038`) |

**Cinq lignes ne sont pas absorbées, et c'est écrit ici pour être opposable** :
9, 11, 12, 15 sont des dettes NOMMÉES (§H) ; 10 a une condition de levée nommée
(7.5). **Aucune n'est un oubli.** T3.5 les recompte avant tout retrait.

---

## D. Décision — l'éventail sous `.feedComposer` : ce qu'on NE fait pas, et pourquoi

Trois issues étaient possibles au constat du §A.3.

- **(A) rétrécir l'offre** de `.feedComposer` à `[.post]` — l'éventail
  disparaîtrait « proprement » (`isVisible == false`). **Rejetée** : cela
  EFFACERAIT la dette au lieu de la porter. La table §C de la spec dit
  `feedComposer → post · story · réel*` ; retirer `.story` de l'offre ferait
  perdre au dépôt la trace du blocage SDK, et la condition de levée écrite trois
  fois (`ComposerFormatFan.swift:80-86`, `MeeshyComposerHost.swift:793-798`,
  `ComposerIntent.swift:395-397`) n'aurait plus d'objet.
- **(B) descendre l'éventail quand même** — **rejetée**, et c'est la régression
  que la règle existe pour nommer : choisir « Story » monterait l'atelier et
  `documentText` n'aurait aucun chemin pour l'y suivre. La saisie disparaîtrait
  sans un mot, sur la surface de création la plus fréquentée de l'app.
- **(C) servir la bascule POST ↔ RÉEL par un INTERRUPTEUR** — **retenue**.

**Pourquoi (C) est la bonne, et pas un contournement** : la feuille absorbée n'a
**jamais eu de sélecteur de format**. Elle a un interrupteur `forcePlainPost`
(`:906`), qui n'apparaît que si la composition qualifie et dont l'unique effet est
de passer `forcePlainPost:` à `ReelComposition.defaultType`. Servir un éventail
là où il y avait un interrupteur, ce serait AJOUTER une capacité en croyant en
absorber une — et il faudrait alors répondre pour `.story`, que rien ne sait
servir.

**Conséquence à écrire à voix haute** (sans quoi elle devient la loi lue par la
suivante) : la porte `.feedComposer` livre un composer dont l'offre DÉCLARE
`.story` et dont l'écran ne l'offre pas. **Ce n'est pas une violation de la
loi 4** — « un format non offert est ABSENT, jamais grisé » parle de PIXELS, et
il n'y a ici aucun pixel : l'éventail entier ne se peint pas. `offeredFormats` est
une donnée du CONTRAT (loi 1), pas une affordance. La loi 4 serait violée par
(B), pas par (C).

**Le test `("composer du fil · Post", .feedComposer, .post, false)` reste VERT
après le lot 3.** C'est la preuve, dans le gate, qu'on n'a pas contourné la règle.

---

## E. L'ordre contraint, et les trois invariants durs

```
2.1 canal + publieur ─► 2.2 langue ─► 2.3 photo·caméra·document ─► 2.4 bascule POST↔RÉEL
                                                                          │
                                          2.5 lieu ◄───────────────────────┘
                                             │
                                          2.6 micro   (retourne « servedRow != canonicalRow »)
                                             │
3.1 le plein composer iPhone ◄───────────────┘   (retourne « montages == 0 », ARME la garde conditionnelle)
   │
3.2 la citation reste sur la feuille, et c'est GARDÉ
   │
3.3 l'overlay iPad reçoit un NOM ─► 3.4 l'overlay iPad passe par le meuble
   │
3.5 STOP du retrait de FeedComposerSheet + inventaire
```

1. **Le canal et le publieur AVANT le premier outil.** Un outil dont le résultat
   n'a pas de destination est exactement ce que `ComposerDocumentTool.effect`
   refuse (`:390-398` : « la question n'est pas “sait-on ouvrir le sélecteur ?”
   mais “où va son RÉSULTAT ?” »). Peindre d'abord, brancher ensuite, ce serait
   livrer — ne serait-ce qu'un commit — la photothèque au-dessus du trou.
2. **La bascule POST ↔ RÉEL immédiatement après les médias visuels.** Dès que
   `documentMedia` peut contenir une vidéo ou deux images, `qualifiesAsReel`
   devient vrai et `defaultType` élit `"REEL"` : **sans l'interrupteur, l'auteur
   n'a plus aucun moyen de garder son post en POST**, capacité que la feuille lui
   donne. Une tâche de plus entre les deux serait une régression livrée.
3. **T2.6 avant T3.1, sans exception.** `test_aucunSiteDeProduction_neMonteUnePorteDocument…`
   est vacuous aujourd'hui ; T3.1 l'arme, et sa première assertion exige
   `servedRow == canonicalRow`. Câbler la porte plus tôt ferait rougir une garde
   dont l'échec ne dit rien d'autre que « le lot 2 n'est pas fini ».

> **T3.4 peut tomber du périmètre.** C'est le lot le plus lourd et le moins
> fréquenté (iPad, un hôte unique). S'il tombe, T3.3 reste — et l'overlay est
> alors NOMMÉ et GARDÉ, ce qui est strictement mieux qu'aujourd'hui. Si T3.3
> tombe aussi, il faut l'ÉCRIRE plutôt que le taire.

---

## F. Les tâches

Convention : **RED → GREEN → REFACTOR**. Chaque garde est accompagnée de la
**MUTATION** qui doit la faire rougir — une garde dont on ne sait pas dire ce qui
la fait tomber n'est pas une garde. Gate : `gate.sh test <Suites>`.

---

### T2.1 — Un brouillon de document peut PORTER un média, un lieu et une langue ; et le publieur qui les accepte est nommé

> **Taille : M.** Aucun outil n'est peint, aucun écran ne change. C'est la
> DESTINATION, posée avant les gestes qui la remplissent.

**Files**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift`
  (`ComposerDocumentDraft:805-817` + `document(…):888` + `ComposerDocumentSendPlan.plan:633-657`)
- Modify: `apps/ios/Meeshy/Features/Main/Services/PublishIntent.swift` (fabrique `document(…)`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift` (`DocumentComposerDoor.publish:1258`)
- Test (existants, étendus): `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentSurfaceTests.swift`,
  `apps/ios/MeeshyTests/Unit/Services/PublishIntentTests.swift`
- **Aucun fichier neuf ⇒ aucune greffe pbxproj.**

- [ ] **Step 1 — Tests ROUGES**

| # | Test | Mutation qui le fait rougir |
|---|---|---|
| 1 | `ComposerDocumentDraft.document(…, localMedia: [m], location: p, …)` porte les deux ; **RED = échec de COMPILATION** du bundle de test (les champs n'existent pas) | — c'est le rouge attendu, et il doit être VU |
| 2 | `ComposerDocumentSendPlan.plan(for: draftAvecMedia, isOffline: false) == .send(.durableOutbox)` — **et non `.upload`** | laisser `hasLocalMedia: false` en dur (`:652`) ⇒ `.textOnly`, le média ne partirait pas |
| 3 | `plan(for: draftAvecMedia, isOffline: true) == .send(.durableOutbox)` — le MÊME chemin dans les deux conditions réseau | brancher sur `isOffline` ⇒ deux comportements, dont le moins emprunté sera celui qui perd |
| 4 | un brouillon **sans texte mais AVEC un média** n'est plus refusé pour `emptyDraft` | garder `guard let texte…` en tête ⇒ une photo seule serait rejetée, là où la feuille l'accepte (`hasContent`, `:925-928`) |
| 5 | `PublishIntent.document(localMedia: [vidéo 4 s], forcePlainPost: false).type == "REEL"` ; `forcePlainPost: true` ⇒ `"POST"` ; une image seule ⇒ `"POST"` | coder `"POST"` en dur ⇒ rouge sur le premier cas |
| 6 | `PublishIntent.document(…).originalLanguage == "es"` quand on le lui donne | l'ignorer ⇒ le Prisme mal étiquette |
| 7 | **garde de source ÉTENDUE** : `test_laFabriqueDeLIntention_nePoseAucunDefaut` lit désormais les DEUX fabriques ; la liste de paramètres de `static func document(` ne contient aucun `=` | ajouter `content: String? = nil` ⇒ ROUGE. Si elle reste verte, elle lit un commentaire : vérifier que `AppSourceGuard.stripComments` précède la lecture |
| 8 | **garde de source** : le corps de `DocumentComposerDoor.publish` contient `viewModel.publish(PublishIntent.document(` **et** `viewModel.createPost(` — deux chemins, un seul décideur | appeler `postService` en direct ⇒ le second chemin d'envoi que C2 interdit |
| 9 | **garde de source, NÉGATIVE + garde-fou** : le corps de `publish` ne contient **pas** `TusUploadManager` ; garde-fou « le corps lu est non vide et contient `ComposerDocumentSendPlan` » | y remettre un upload direct ⇒ un média composé hors ligne serait perdu |

- [ ] **Step 2 — Voir le rouge.** En Swift, l'ajout d'un champ rend le rouge sous
      forme d'échec de COMPILATION du bundle de test : c'est le rouge attendu, et
      il doit être VU avant d'écrire la production.
- [ ] **Step 3 — Implémenter.** `ComposerDocumentMedia` (`nonisolated struct`,
      `Equatable`, `Sendable` : `url: URL`, `mimeType: String`, `durationMs: Int?`)
      naît **dans `ComposerDocumentSurface.swift`**, à côté du brouillon qu'il
      sert. Les champs neufs du brouillon **n'ont PAS de valeur par défaut sur
      `document(…)`** — la discipline que le lot 4.9 a posée deux fois sur cette
      même fabrique (`visibilityUserIds`, `repostOfId`, doc-comment `:863-881`) —
      et chaque champ porte **un commentaire disant pourquoi il ne vit nulle part
      ailleurs**.
- [ ] **Step 4 — Vert.** `gate.sh test ComposerDocumentSurfaceTests PublishIntentTests MeeshyComposerHostGuardTests EditParityInventoryTests`
- [ ] **Step 5 — Commit.** « feat(ios/composer): un post composé dans le meuble
      peut enfin porter une photo, une position et sa langue — et il part par la
      file durable ».

**DoD.** Les deux gardes de la porte restent **VERTES** (aucun outil n'a gagné
d'effet, la langue est encore la constante) : c'est la preuve que cette tâche n'a
livré aucune moitié d'écran.

**STOP.** Si `ReelComposition.defaultType` n'a pas exactement la signature lue
(`mimeTypes:durationsMs:forcePlainPost:`, `PublishIntent.swift:152-156`) —
**vérifier à la source avant d'appeler**, ce lot ne peut pas compiler sinon.

---

### T2.2 — L'auteur DÉCLARE la langue de son post

> **Taille : M.** Impact Prisme direct : aujourd'hui un « Hello everyone » part
> étiqueté français, le pipeline le traduit FR→EN sur un texte déjà anglais, la
> carte affiche un badge faux, et l'auteur n'a aucun moyen de corriger.

**Files**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift`
  (`documentLanguage` + la capsule dans la rangée + la feuille `AudioLanguagePickerView`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift`
  (`ComposerDocumentDraft.originalLanguage`, `ComposerDocumentCopy`, `DocumentComposerDoor.publish`)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` — **1 clé neuve, 7 langues, édition TEXTUELLE**
- Test (existants, étendus): `ComposerDocumentSurfaceTests.swift`, `MeeshyComposerHostGuardTests.swift`,
  `EditParityInventoryTests.swift`, `LocalizationConsistencyTests.swift`

**La forme retenue, et pourquoi c'est celle de la feuille** : la capsule est
`ComposerLanguageFlag.label(for:)` (`ComposerModels.swift:124-131`, `nonisolated`
au niveau du TYPE, déjà) posée à droite de la rangée d'outils, et le sélecteur est
`AudioLanguagePickerView` (`Views/AudioPostComposerView.swift:730`) — les deux que
`FeedComposerSheet` monte (`:1207-1227`, `:1253-1263`). **En fabriquer un second
donnerait deux listes de langues et deux mémoires à faire diverger.**

- [ ] **Step 1 — Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | `ComposerDocumentDraft.document(…, originalLanguage: "es").originalLanguage == "es"` | RED de compilation attendu |
| 2 | **RETOURNEMENT** de l'assertion 4 de la garde de la porte : le corps de `publish` **ne contient PLUS** `originalLanguage: DefaultComposerLanguage.resolve()` et contient `draft.originalLanguage` | y remettre la constante |
| 3 | **RETOURNEMENT** de l'assertion 6 : la source de la porte contient `originalLanguage` **et** `ComposerLanguageFlag` | retirer la capsule |
| 4 | l'assertion 5 (`DefaultComposerLanguage.resolve() == "fr"`) **reste** : ce n'est pas `resolve()` qui change, c'est la PORTE qui cesse de l'appeler ; elle reste le point de DÉPART du meuble | la supprimer ⇒ on perdrait la prémisse qui fait sens des deux autres |
| 5 | garde de source : le meuble monte `AudioLanguagePickerView` **une fois** et ne déclare aucune liste de langues à lui | fabriquer un second sélecteur |
| 6 | `EditParityInventoryTests` : la capacité « langue source » passe de `attendue: false` à `attendue: true`, et son `mesureDit` est réécrit | laisser `false` ⇒ l'inventaire mentirait dans l'autre sens |
| 7 | cliquet i18n : la clé neuve existe dans les **7** locales (`ar, de, en, es, fr, it, pt-BR`), vérifié par **dump du catalogue**, jamais à l'œil | en oublier une |

- [ ] **Step 2 — Voir le rouge. Step 3 — Implémenter.**
      La clé neuve est **symbolique** : `composer.document.a11y.language`, sur le
      patron de `composer.document.a11y.tools` (présente en 7 langues, vérifié).
      **Ne PAS reprendre le littéral `"Langue du post"` de la feuille** : sa clé
      contient des espaces et **échappe au cliquet français** (§A.5-4) — la
      recopier importerait une dette invisible dans le fichier que ce chantier
      construit.
- [ ] **Step 4 — Vert.** `gate.sh test ComposerDocumentSurfaceTests MeeshyComposerHostGuardTests EditParityInventoryTests LocalizationConsistencyTests FrenchDefaultValueRatchetTests`
- [ ] **Step 5 — Commit.** « feat(ios/composer): un post écrit en anglais cesse de
      partir étiqueté français ».

**MUTATION qui prouve la garde 2** : remettre la constante dans le corps de
`publish` ⇒ l'assertion retournée rougit **en nommant la ligne**.

**Piège.** L'édition du catalogue est **TEXTUELLE**. `json.load` / `json.dump`
réordonnerait et reformaterait 3369 entrées : le diff serait illisible et un
conflit avec une session voisine indémêlable. Insérer le bloc à sa place
alphabétique, à la main, avec les 7 locales.

---

### T2.3 — Photo · caméra · document : trois outils qui posent un fichier LOCAL

> **Taille : L.** Trois outils, **une** chaîne : un fichier local + son mime
> DÉCLARÉ. C'est pourquoi ils voyagent ensemble.

**Files**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift`
  (`ComposerDocumentToolEffect` + `ComposerDocumentTool.effect`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift`
  (état, `handleDocumentTool`, les trois sélecteurs, les tuiles)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentToolChainTests.swift`
  **(NEUF — cible `MeeshyTests`, greffe pbxproj OBLIGATOIRE)**
- Test (existants, étendus): `ComposerDocumentSurfaceTests.swift`, `EditParityInventoryTests.swift`

- [ ] **Step 1 — Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | `ComposerDocumentTool.photo.effect != nil`, idem `.camera`, `.document` | les laisser à `nil` |
| 2 | `servedRow` contient désormais `[.photo, .camera, .emoji, .document]` **dans l'ordre de `canonicalRow`** | écrire une seconde liste ⇒ l'ordre que les doigts connaissent bougerait |
| 3 | `servedRow != canonicalRow` reste **VRAI** (lieu et micro manquent) — l'assertion 3 de la garde de la porte ne se retourne PAS encore | donner un effet aux six d'un coup ⇒ la garde tomberait avant que le lot soit fini |
| 4 | `ComposerDocumentToolEffect` est **exhaustif** : le `switch` de `handleDocumentTool` n'a plus de branche `default` | un `default` ⇒ un septième effet hériterait du silence |
| 5 | `ComposerIngestRouter.route(mime:)` est le SEUL classement : garde de source, le meuble ne contient ni `hasPrefix("image/")` ni `hasPrefix("video/")` | reclasser à la main ⇒ second pipeline |
| 6 | comportement : un fichier local ajouté ⇒ `ComposerDocumentDraft.localMedia` le porte avec son **mime DÉCLARÉ**, pas dérivé de l'extension | dériver de l'extension ⇒ un `.caf` repart en `application/octet-stream` (le défaut mesuré, `PublishIntent.swift:64-75`) |
| 7 | garde de source : la surface `ComposerDocumentSurface` ne monte **aucun** `photosPicker` / `fileImporter` / `CameraView` — l'ingestion appartient au meuble | l'y remonter ⇒ la surface cesserait d'être sans état |
| 8 | garde-fou du corpus : le fichier de test lit une source **non vide** contenant `struct MeeshyComposerHost` | un chemin devenu faux ⇒ toutes les gardes négatives ci-dessus passeraient au vert sur une chaîne vide |

- [ ] **Step 2 — Voir le rouge. Step 3 — Implémenter.**
      `ComposerDocumentToolEffect` gagne `.attachesLocalMedia(ComposerMediaIntake)`
      (`.photoLibrary` / `.camera` / `.files`) — **une valeur associée plutôt que
      trois cas**, pour que `handleDocumentTool` reste aiguillé sur l'EFFET et non
      sur l'outil (`MeeshyComposerHost.swift:843-849`, la raison y est écrite).
- [ ] **Step 4 — Vert.** `gate.sh test ComposerDocumentToolChainTests ComposerDocumentSurfaceTests MeeshyComposerHostGuardTests EditParityInventoryTests`
- [ ] **Step 5 — Commit.**

**Pièges nommés pour cette tâche.**
- **Fichier de test NEUF** ⇒ `gate.sh build` régénère par `xcodegen` ; **vérifier
  le delta pbxproj avant de committer** :
  `grep -c 'ComposerDocumentToolChainTests.swift' apps/ios/Meeshy.xcodeproj/project.pbxproj` → **4**,
  et `grep -c '\.swift in Sources'` ne doit **jamais décroître**.
- **Pas de `@ViewBuilder` + `if #available` imbriqué** dans la rangée ni dans les
  tuiles : débordement de pile par PROFONDEUR DE TYPE, invisible au simulateur
  (pile 8 Mo) et fatal à l'appareil (1008 Ko).
- **Isolation MainActor par défaut (Swift 6.2)** : `ComposerDocumentMedia`,
  `ComposerMediaIntake` et tout modèle pur neuf naissent `nonisolated` **au niveau
  du TYPE** — patron `ComposerLanguageFlag` (`ComposerModels.swift:122-124`), dont
  le doc-comment dit la cause : « la cible app compile sous
  `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`, le bundle de tests non ».

---

### T2.4 — La bascule POST ↔ RÉEL : un auteur peut garder son post simple

> **Taille : M.** Elle vient ICI et pas plus tard : depuis T2.3, une vidéo ou deux
> images font élire `"REEL"` par `ReelComposition.defaultType`, et **rien ne
> permettrait plus de garder un POST** — une capacité de la feuille perdue.

**Files**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift`
  (`documentForcePlainPost` + l'interrupteur, gaté)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift`
  (le brouillon porte `forcePlainPost`, la porte le passe à la fabrique)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` — **réutilise `feed.post.reel.toggle*` si elle existe ; sinon 1 clé neuve, 7 langues** (à MESURER avant d'écrire : la feuille pose ses deux libellés en littéral, `:943-947`)
- Test (existants, étendus): `ComposerDocumentToolChainTests.swift`, `ComposerDocumentSurfaceTests.swift`

- [ ] **Step 1 — Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | l'interrupteur est **ABSENT** quand la composition ne qualifie pas (une image seule, un texte seul) — loi 4 | le peindre grisé |
| 2 | il est **PRÉSENT** dès qu'elle qualifie (vidéo ≥ 3 s, audio ≥ 3 s, ≥ 2 images), via `ReelComposition.qualifiesAsReel` et **pas** une règle recopiée | recopier le seuil ⇒ deux règles à faire diverger, dont l'une côté serveur |
| 3 | `forcePlainPost` armé ⇒ `PublishIntent.document(…).type == "POST"` sur une vidéo de 10 s | ignorer le drapeau |
| 4 | **retirer** un média qui dé-qualifie fait DISPARAÎTRE l'interrupteur, et le drapeau retombe à `false` | le laisser armé ⇒ un état invisible gouvernerait la publication suivante |
| 5 | garde de source : `ComposerFormatFan(` reste monté **une seule fois** dans le meuble et l'interrupteur n'est pas dans `plateauTools` | y monter un second sélecteur ⇒ deux contrôles pour un format |
| 6 | **NON-RÉGRESSION, à ne pas retourner** : `ComposerFormatFanPlacement.paints(surface: .document, opening: .keyboardOnContent, offeredFormats: profil(.feedComposer).offeredFormats) == false` | la retourner ⇒ §D(B), la saisie disparaît |

- [ ] **Step 2 — Voir le rouge. Step 3 — Implémenter. Step 4 — Vert.**
      `gate.sh test ComposerDocumentToolChainTests ComposerDocumentSurfaceTests MeeshyComposerHostGuardTests`
- [ ] **Step 5 — Commit.** « feat(ios/composer): une vidéo composée dans le meuble
      peut rester un post simple ».

---

### T2.5 — Lieu : un post composé dans le meuble porte sa position, et son second opt-in

> **Taille : M.**

**Files**
- Modify: `ComposerDocumentSurface.swift` (`effect` de `.place`, canal `location` + `discoverabilityPrecision` sur le brouillon)
- Modify: `MeeshyComposerHost.swift` (état, `LocationPickerView`, la tuile de lieu, le toggle de proximité)
- Test (existants, étendus): `ComposerDocumentToolChainTests.swift`, `EditParityInventoryTests.swift`

- [ ] **Step 1 — Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | `ComposerDocumentTool.place.effect != nil` | le laisser `nil` |
| 2 | un lieu choisi ⇒ `PublishIntent.document(…).location` le porte | le jeter |
| 3 | **le second opt-in voyage avec le lieu** : `discoverabilityPrecision` n'est posé que si l'auteur l'a choisi, et il vaut `nil` sinon | poser une valeur par défaut ⇒ on rendrait trouvable un contenu que personne n'a accepté de rendre trouvable |
| 4 | le toggle de proximité n'apparaît que sous la règle du dépôt (`FeedNearbyDiscoverability.offers(hasPlace:visibility:)`, `FeedView+Attachments.swift:1690-1695`) — **appelée**, pas recopiée | recopier la condition |
| 5 | un lieu SEUL, sans texte ni média, **peut partir** (parité `hasContent`, `:925-928`) | exiger un texte ⇒ le défaut que la Task 13 du 2026-07-29 avait déjà corrigé sur la feuille |
| 6 | `EditParityInventoryTests` : la capacité « position tri-état » reste `attendue: false` — **ce lot pose le premier des trois états, pas les trois** | la passer à `true` ⇒ l'inventaire mentirait, et 7.8 croirait la parité tenue |

- [ ] **Step 2 → 5.** Gate : `gate.sh test ComposerDocumentToolChainTests ComposerDocumentSurfaceTests EditParityInventoryTests`

> **Le tri-état de la POSITION appartient à l'ÉDITION, pas à la création**
> (`PostLocationUpdate` : remplacer / retirer / ne pas toucher). Ce lot crée ; il
> ne pose que « remplacer ». Écrit ici pour que 7.8 ne le compte pas comme acquis.

---

### T2.6 — Micro : un vocal composé dans le meuble part par la file durable, AVEC sa transcription

> **Taille : L.** C'est la tâche qui **RETOURNE** l'assertion 3 de la garde de la
> porte (`servedRow != canonicalRow`) — le dernier outil.

**Files**
- Modify: `ComposerDocumentSurface.swift` (`effect` de `.microphone`, canal `mobileTranscription`)
- Modify: `MeeshyComposerHost.swift` (état, `AudioPostComposerView`)
- Modify: `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentSurfaceTests.swift` (**retournement** de l'assertion 3)
- Test (existants, étendus): `ComposerDocumentToolChainTests.swift`

- [ ] **Step 1 — Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | `servedRow == canonicalRow` — les six outils, dans l'ordre | oublier un `effect` |
| 2 | **RETOURNEMENT** de l'assertion 3 : `XCTAssertEqual(servedRow, canonicalRow, …)`, avec un message qui dit **pourquoi elle a changé de côté** (la rangée couvre la feuille absorbée ; c'est la PREMIÈRE des deux conditions, la seconde étant tombée à T2.2) | la supprimer plutôt que la retourner |
| 3 | **ce qui QUALIFIE la chaîne voyage avec elle** : `PublishIntent.document(…).mobileTranscription` est non-nil et porte le texte transcrit | l'omettre ⇒ le serveur re-transcrit (`PostService.ts:329-340`) et jette en silence le travail fait sur l'appareil |
| 4 | la LANGUE d'un vocal composé ici est celle du meuble (T2.2), **pas** celle de la transcription — et c'est un ÉCART assumé avec `audioRecording` : ici l'auteur a un contrôle, là il n'en a pas | fondre les deux règles ⇒ soit un vocal perd sa langue parlée, soit un texte perd la langue déclarée |
| 5 | le fichier enregistré **existe encore** après le retour de `publish` (jamais de `removeItem`) | le détruire dans un `catch` ⇒ le défaut exact que 7.4b a fermé |
| 6 | garde de source : le meuble n'appelle **pas** `PublishIntent.audioRecording(` — la garde d'appelants (`test_lIntentionDePublication_nEstComposeeQueParLesDeuxJumeauxAudio`, `appels == 2`, `fichiersAppelants == ["FeedView+Attachments.swift"]`) reste **VERTE** | y appeler la fabrique vocale ⇒ **trois** appelants, garde rouge, et un geste écrit une troisième fois |

- [ ] **Step 2 → 4.** Gate : `gate.sh test ComposerDocumentToolChainTests ComposerDocumentSurfaceTests MeeshyComposerHostGuardTests PublishIntentTests EditParityInventoryTests`
- [ ] **Step 5 — Commit.** « feat(ios/composer): les cinq outils de la barre du
      composer font enfin quelque chose ».

**DoD du LOT 2.** `servedRow == canonicalRow`, la porte poste la langue du meuble,
et `test_aucunSiteDeProduction_neMonteUnePorteDocument…` — encore vacuous —
rendrait ses trois booléens VRAIS si on l'armait. **Le vérifier explicitement**
avant d'ouvrir T3.1 : ajouter, dans `ComposerDocumentToolChainTests`, une
assertion directe sur `leMeubleSertLaRangeeDuDocument()`-équivalent, plutôt que
d'attendre que T3.1 la découvre.

---

### T3.1 — Le plein composer du fil (iPhone) passe par le meuble

> **Taille : L.** C'est la porte la plus utilisée de l'app.

**Files**
- Modify: `apps/ios/Meeshy/Features/Main/Views/RootViewComponents.swift` (`:898-908`)
- Modify: `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentSurfaceTests.swift` (**retournement** de l'assertion 2)
- Test (existants, étendus): `MeeshyComposerHostGuardTests.swift` (la garde conditionnelle s'ARME),
  `apps/ios/MeeshyTests/Unit/Architecture/AppInitWireupTests.swift`

**Ce que le site devient** :

```swift
.fullScreenCover(isPresented: $showFullComposer) {
    DocumentComposerDoor(
        intent: ComposerIntent(origin: .feedComposer),
        viewModel: viewModel
    )
}
```

**Trois faits mesurés qui rendent ce site le PLUS simple des quatre** :
`initialText` y vaut toujours `""` et `pendingAttachmentType` toujours `nil`
(§A.5-1) ; ce n'est pas une citation ; et `DocumentComposerDoor` porte déjà
l'envoi, la sortie et le refus.

- [ ] **Step 1 — Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | **RETOURNEMENT** de l'assertion 2 : `XCTAssertEqual(montages, 1)` et le site est nommé (`RootViewComponents.swift`), avec un message qui dit ce qu'un SECOND montage signifierait | mettre `>= 1` ⇒ la garde cesserait de compter |
| 2 | la garde conditionnelle s'ARME : `sitesDeProductionOuvrantUnePorteDocument()` n'est plus vide, et ses trois booléens sont VRAIS | l'un des trois faux ⇒ le lot 2 n'était pas fini |
| 3 | garde de source : `RootViewComponents.swift` ne contient plus `FeedComposerSheet(` **au site du plein composer** — mais en contient encore **UN** (la citation, T3.2). Assertion sur le COMPTE (`== 1`), jamais sur l'absence | assérer `0` ⇒ rouge injustifié, et la tentation de recâbler la citation sur une porte qui la REFUSE |
| 4 | `test_chaqueSiteQuiMonteLeMeuble_luiDonneSonCanalDePublication_etSaGraine` reste **VERTE** et son `Set` **ne change pas** : la porte vit dans `ComposerDocumentSurface.swift`, déjà listé | monter `MeeshyComposerHost(` directement dans `RootViewComponents` ⇒ garde rouge, **et elle a raison** : le montage porte l'envoi et la sortie, recopié il divergerait au premier second site |
| 5 | comportement : ce que l'auteur tape puis publie atteint `FeedViewModel` — via `MockFeedViewModel`-équivalent ou la garde d'issue existante | — |

- [ ] **Step 2 — Voir le rouge. Step 3 — Implémenter. Step 4 — Vert.**
      `gate.sh test ComposerDocumentSurfaceTests MeeshyComposerHostGuardTests AppInitWireupTests ComposerIntentTests EditParityInventoryTests`
- [ ] **Step 5 — Commit.** « feat(ios/composer): le composer du fil passe par le
      meuble unifié — sans perdre un seul de ses outils ».

**STOP — à ne pas franchir sans mesure.** Avant de committer, dérouler à la main,
sur le simulateur DÉDIÉ `Meeshy-Composer`, les **six** gestes de la rangée plus la
langue, plus une publication hors ligne. Un composer qui s'ouvre n'est pas un
composer qui publie, et c'est la porte la plus utilisée de l'app. *(Ce plan ne
lance rien : c'est une instruction d'exécution.)*

**Ce que T3.1 ne fait PAS** : elle ne touche ni les deux citations, ni l'overlay
iPad, ni `FeedComposerSheet` elle-même.

---

### T3.2 — La citation RESTE sur la feuille, et c'est GARDÉ

> **Taille : S.** Une tâche dont le livrable est une garde et une phrase — parce
> que sans elles, la session suivante « finira le travail » en câblant deux sites
> sur une porte qui les REFUSE (§A.4), et le refus sera silencieux : le composer
> se refermera exactement comme quand tout va bien.

**Files**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift`
  (le doc-comment de `DocumentComposerDoor` nomme la condition de levée 7.5)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentQuoteRefusalTests.swift`
  **(NEUF — cible `MeeshyTests`, greffe pbxproj)**

- [ ] **Step 1 — Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | `ComposerDocumentSendPlan.plan(for: draftAvecRepostOfId, isOffline: false) == .refuse(.nonDurablePath(.quotedRepost))` — le refus est NOMMÉ, pas déduit | rendre `.quotedRepost` durable sans écrivain ⇒ la citation partirait par un chemin que rien ne rejoue |
| 2 | `ComposerProfile.profile(for: .repost(ofPostId: "p", sourceFormat: .post)).routesToLegacy != nil` — la porte d'une citation de POST route vers l'historique | la passer à `nil` ⇒ le meuble servirait une citation qu'il refuse ensuite |
| 3 | garde de source : les **deux** sites de citation montent encore `FeedComposerSheet(` — `RootViewComponents.swift` (1) et `FeedView.swift` (1) — et le message d'échec nomme **7.5** comme condition de levée | les recâbler ⇒ ROUGE, avec la raison écrite dans le message |
| 4 | garde-fou : les sources lues sont non vides et contiennent `struct RootViewComponents` / `struct FeedView` | un chemin faux ⇒ garde verte sur une chaîne vide (le mode d'extinction propre aux gardes négatives) |

- [ ] **Step 2 → 5.** Gate : `gate.sh test ComposerDocumentQuoteRefusalTests ComposerIntentTests ComposerDocumentSurfaceTests`

**Piège nommé.** Ne pas écrire dans un commentaire de ce dépôt la séquence de glob
que `MeeshyComposerHost.swift:255` nomme : le dépouilleur l'a déjà lue comme une
ouverture de commentaire de bloc et a jeté 738 lignes, aveuglant toutes les gardes
de source du fichier — **une seule avait rougi**.

---

### T3.3 — L'overlay inline iPad reçoit un NOM et une garde

> **Taille : S.** Aujourd'hui il **sortira du radar de toutes les gardes
> existantes** : `LegacyComposer` ne le nomme pas, et le commentaire de
> `.feedComposer` (`ComposerIntent.swift:245-247`) le dit lui-même.

**Files**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerIntent.swift`
  (`LegacyComposer` gagne `feedInlineComposer`)
- Test: `apps/ios/MeeshyTests/Unit/Composer/FeedInlineComposerGuardTests.swift`
  **(NEUF — cible `MeeshyTests`, greffe pbxproj)**
- Modify: `apps/ios/MeeshyTests/Unit/Composer/ComposerIntentTests.swift`
  (`composersHistoriques:544` gagne le cas)

- [ ] **Step 1 — Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | `LegacyComposer.feedInlineComposer` existe et reste DÉCLARÉ même sans porte qui y route — doctrine du « cas qui reste déclaré » (`ComposerIntent.swift:145-148`) | le retirer |
| 2 | **inventaire, pas compte** : `FeedView.swift` arme `showComposer = true` depuis **cinq** sites, identifiés par déclaration englobante et jamais par numéro de ligne | assérer un nombre nu ⇒ il passerait au vert dès qu'on ajoute et retire un site dans le même lot |
| 3 | `FeedView()` n'a **qu'un** hôte de production (`iPadRootView.swift`) — le fait qui rend cet overlay « iPad » | un second hôte ⇒ l'overlay atteindrait l'iPhone, et la mesure du lot serait fausse |
| 4 | garde-fou : la source lue est non vide et contient `private var composerOverlay` | — |

- [ ] **Step 2 → 5.** Gate : `gate.sh test FeedInlineComposerGuardTests ComposerIntentTests`

---

### T3.4 — L'overlay inline iPad passe par le meuble

> **Taille : L.** Peut tomber du périmètre (§E) — auquel cas T3.3 le laisse
> NOMMÉ et GARDÉ, et il faut l'ÉCRIRE.

**Files**
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedView.swift` (`:59`, `:624-625`, `:733/766/782/808/824`, `:1401`)
- Modify: `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift`
  (`DocumentComposerDoor` gagne `openingTool: ComposerDocumentTool?`, **sans défaut**)
- Modify: `apps/ios/MeeshyTests/Unit/Composer/FeedInlineComposerGuardTests.swift` (**retournement**)

**La forme** : les cinq armements deviennent **un** état
`@State private var inlineComposer: ComposerDocumentTool??` — ou, plus simple et
préféré, un `enum FeedComposerRequest { case blank, tool(ComposerDocumentTool) }`
optionnel. `openingTool` vit sur la PORTE, **pas sur `ComposerIntent`** : la table
ignore ce qu'une porte transporte, sauf le FORMAT, qui fait partie de son identité
(`ComposerIntent.swift:26-30`) — un sélecteur pré-ouvert n'est pas un format.

- [ ] **Step 1 — Tests ROUGES** : (1) les cinq armements produisent la bonne
      demande ; (2) `openingTool` n'a **pas** de valeur par défaut (garde de
      source, patron `test_laFabriqueDeLIntention_nePoseAucunDefaut`) ; (3)
      l'audio, qui n'ouvrait PAS le composer (`FeedView.swift:793-800`), y entre
      désormais par le même chemin que les quatre autres — **ou reste dehors, et
      c'est écrit** ; (4) garde de source : `FeedView.swift` ne contient plus
      `composerOverlay` ; (5) `FeedView+Attachments.swift` perd son second chemin
      d'envoi (`:285-545`) — **compte de `TusUploadManager(` dans le fichier**,
      qui doit décroître de la valeur mesurée avant le lot.
- [ ] **Step 2 → 5.** Gate : `gate.sh test FeedInlineComposerGuardTests ComposerDocumentSurfaceTests MeeshyComposerHostGuardTests AppInitWireupTests`

**STOP.** Ne pas retirer `FeedView.composerOverlay` sans avoir **mesuré, avant le
retrait**, ce que son chemin d'envoi fait de plus que le meuble
(`FeedView+Attachments.swift:285-545` : références, `nearbyPrecision`,
`composerForcePlainPost`, `feedDeclaredReferences`). L'inventaire se fait AVANT,
et il s'écrit dans le commit.

---

### T3.5 — Le retrait de `FeedComposerSheet` : le STOP et sa double preuve

> **Taille : S.** Le livrable est un inventaire EXÉCUTABLE et un STOP écrit —
> **pas un retrait.** Patron : 4.8 (`StatusComposerView`, 363 l. de code mort
> retenu par 3 suites qui l'épinglent par chemin) et 7.8
> (`EditParityInventoryTests:375`, qui assère le SET des noms tenus, pas le
> compte).

**Files**
- Test: `apps/ios/MeeshyTests/Unit/Composer/FeedComposerSheetRetirementInventoryTests.swift`
  **(NEUF — cible `MeeshyTests`, greffe pbxproj)**

**La double preuve, et pourquoi elle n'est PAS obtenue par ces lots :**

| preuve | état après T3.4 | ce qui manque |
|---|---|---|
| **appelants recâblés** | 2 sur 4 (T3.1, T3.4) | les **deux citations** — condition **7.5** (§A.4) |
| **capacités tenues** | 11 sur 16 (§C) | références (D-2), dépôt (D-3), éditeur d'image (D-4), son emprunté (D-5), progression (D-1) |

- [ ] **Step 1 — Tests ROUGES** : le test assère le **SET des noms** de capacités
      tenues et le **SET des fichiers** montant encore la feuille, jamais un
      compte. Message d'échec : « ce SET a changé — si une capacité est passée au
      meuble, la déplacer ici ; si une a été PERDUE, c'est une régression, pas une
      mise à jour d'inventaire. »
- [ ] **Step 2 → 5.** Gate : `gate.sh test FeedComposerSheetRetirementInventoryTests`

**Coût annexe à inventorier maintenant, pas au retrait** : chercher les suites qui
lisent `FeedView+Attachments.swift` **par chemin** — elles rougiraient par un
*throw* de lecture, « le genre de rouge qu'on répare en supprimant le test »
(le piège que 7.8 a déjà nommé, `EditParityInventoryTests:449`).

---

### T3.6 — Gate final des deux lots

- [ ] `gate.sh build` — puis, si `xcodegen` a tourné, **vérifier le delta pbxproj**
      contre `origin/main` : n'ajouter QUE les fichiers neufs de ces lots
      (`grep -c '<Fichier>.swift'` → 4 chacun ; `grep -c '\.swift in Sources'`
      ne décroît JAMAIS). **Ne jamais committer un pbxproj régénéré en entier** :
      il emporterait le WIP des worktrees voisins.
- [ ] `gate.sh test` sur les suites touchées, **chiffres RÉELS consignés au
      commit** (nombre de suites, de tests, `malloc-errors=`), jamais « ça passe ».
- [ ] `gate.sh sdk MeeshyUITests MeeshySDKTests` **seulement si** une tâche a
      touché `packages/MeeshySDK` — aucune ne le prévoit (§H).
- [ ] Cliquet i18n : dump du catalogue, **7 locales** pour chaque clé neuve.
- [ ] **Aucune commande `git` qui écrit** hors `git commit -F <fichier> -- <chemins>`.

---

## G. Fichiers NEUFS, par cible

| fichier | cible | greffe pbxproj ? |
|---|---|---|
| `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentToolChainTests.swift` | `MeeshyTests` | **OUI** |
| `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentQuoteRefusalTests.swift` | `MeeshyTests` | **OUI** |
| `apps/ios/MeeshyTests/Unit/Composer/FeedInlineComposerGuardTests.swift` | `MeeshyTests` | **OUI** |
| `apps/ios/MeeshyTests/Unit/Composer/FeedComposerSheetRetirementInventoryTests.swift` | `MeeshyTests` | **OUI** |

**Aucun fichier de PRODUCTION neuf.** Les quatre types nouveaux
(`ComposerDocumentMedia`, `ComposerMediaIntake`, l'effet `.attachesLocalMedia`, la
demande de composer inline) naissent **dans les fichiers qui les servent** —
`ComposerDocumentSurface.swift`, `ComposerIntent.swift`, `FeedView.swift`.

**Pourquoi la greffe est obligatoire et dangereuse.** Les cibles `Meeshy` et
`MeeshyTests` sont déclarées par RÉPERTOIRE dans `apps/ios/project.yml`
(`:146-149`, `:290-292`) : sans `xcodegen generate`, un fichier de test neuf
**n'existe pas pour `xcodebuild`** et la suite passe verte en ne l'exécutant
jamais. Et un pbxproj régénéré en ENTIER emporte le WIP des sessions voisines :
diffier, greffer le **delta**.

---

## H. Ce que ces lots NE font PAS — opposable

### H.1 Dettes de PARITÉ ouvertes par l'absorption (§C)

| # | dette | site | pourquoi pas ici |
|---|---|---|---|
| **D-1** | **la barre de progression d'upload** disparaît | `FeedView+Attachments.swift:1147-1151` | sans objet sur la file durable : ni `publishAudioPost` ni `publishAudioFromSheet` n'écrivaient `uploadProgress`, et `enqueueDurableMediaPost` rend la main dès l'enfilage. Ce qui la remplace est le **post OPTIMISTE**, immédiat. À DIRE dans le commit de T3.1 : c'est un changement visible |
| **D-2** | **les références** (`ReferenceComposerBar`) | `FeedView+Attachments.swift:913`, `:1159-1163` | `ComposerDocumentDraft.document(…)` pose `mentions: nil` **délibérément** (`ComposerDocumentSurface.swift:866-870`) : « lui inventer des champs qu'aucune vue ne remplit aurait fabriqué une capacité que le premier lecteur aurait crue tenue ». L'ajouter demande la barre ET le canal ET la normalisation loi 3 (`nil` vs `[]`) — une tâche à elle |
| **D-3** | **la cible de DÉPÔT** (drag & drop) | `FeedView+Attachments.swift:1235-1238` (`ComposerDropTargetModifier`) | le modificateur existe et est partagé ; le brancher sur le meuble est **cheap** mais rouvre l'ingestion multi-fichiers au moment où T3.1 doit être vérifiable à la main. À prendre juste après |
| **D-4** | **l'éditeur d'image et la prévisualisation vidéo** | `FeedView+Attachments.swift:1291-1352` (`MeeshyImageEditorView`, `context: .post`) | une chaîne entière (édition → recompression → remplacement du fichier local). Aucun rapport avec la loi 4 : l'outil « photo » a bien un effet sans elle |
| **D-5** | **le son EMPRUNTÉ** | `FeedView+Attachments.swift:1247-1250` → `createBorrowedSoundPost` (`FeedViewModel.swift:636-647`) | c'est le **6ᵉ constructeur de corps** du dépôt, hors `PostService` et hors file (dette 7.4b-D4 de l'audit). Le rendre durable exige `storyEffects` dans `CreatePostPayload`, **coupé** par le plan du lot 7 §A.3. Les deux vont ensemble, dans une tâche qui les possède tous les deux |

### H.2 Hors périmètre, par décision

- **La CITATION.** Condition de levée : **7.5** (§A.4). T3.2 la garde.
- **Le retrait de `FeedComposerSheet`.** Double preuve non obtenue (T3.5).
- **`ComposerFormatFanPlacement` et l'offre de `.feedComposer`.** Aucune ligne
  n'y touche (§D). Le test `("composer du fil · Post", …, false)` reste VERT.
- **`packages/MeeshySDK`.** Aucune tâche n'y écrit. La condition de levée de
  l'éventail sous `.feedComposer` — un écrivain public de TEXTE sur l'atelier —
  appartient à un lot qui possédera `MeeshyUI` ; **aucun lot v2 ne le possède**
  (audit item 23).
- **Le trou de la garde-bascule** (`MeeshyComposerHostGuardTests:1583-1590` :
  `RootView.swift:657` et `iPadRootView.swift:155` atteignent le document par
  BASCULE de format et échappent au filtre). **Consigné, pas comblé** : le
  préjudice y est nul (on ancre une humeur), et l'ancrage est tenu par
  `test_leRepostDUnMood_offreLAncrage_ET_unEcranLePeint`. Le combler demanderait
  de faire du filtre une fonction de l'ÉVENTAIL et non du seul `initialFormat` —
  un changement de la garde, pas du produit.
- **iPadOS au sens de C5.** G8 est vrai — 0 occurrence d'idiome sous `Composer/` —
  et **il le reste**. T3.4 fait passer l'overlay iPad par le meuble ; il ne donne
  pas au meuble une logique de plateau élargi (règle G6 du design). **La
  vérification iPadOS de C5 n'est pas tenue par ces lots**, et la ligne C5 de la
  matrice continue de le dire.
- **`apps/web`, `apps/android`, `services/gateway`.** Aucune ligne.
- **`7.8-parité-édition`.** Voir §I.

---

## I. Où `7.8-parité-édition` se raccroche — sans être absorbée

`EditParityInventoryTests:95-234` mesure **2 capacités tenues sur 7**. Ces lots en
DÉBLOQUENT trois, dans les mêmes fichiers, et **n'en tiennent aucune pour
l'édition** :

| capacité | mesurée par | ce que ces lots changent | ce qui reste à 7.8 |
|---|---|---|---|
| langue source | `langueEnDur` (`:122`) | **T2.2 la tient** ⇒ `attendue: true` | rien |
| retrait de médias | `outilsDeMedia.contains { $0.effect != nil }` (`:151`) | **T2.3 lève la PRÉCONDITION** (« on ne retire pas ce qu'on ne sait pas porter ») | le RETRAIT lui-même : `removeMediaIds`, l'hydratation des médias existants |
| position tri-état | `.place.effect != nil` (`:158`) | **T2.5 pose le premier des trois états** | « retirer » et « ne pas toucher » (`PostLocationUpdate`) |
| éventail POST/RÉEL gaté | `gateDuRepost` (`:135`) | **rien** | `ComposerOrigin.edit` doit PORTER « c'est un repost » — le serveur miroite le type d'un repost, l'auteur n'a pas à en choisir un |
| repli automatique du réel | `repliAutomatique` (`:147`) | **rien** | le gate AJOUTE le réel et ne le RETIRE jamais |

> **Ne pas passer une capacité à `attendue: true` en passant.** L'inventaire
> gouverne le retrait d'`EditPostSheet.swift` (689 l.) ; une case cochée par
> anticipation ferait retirer une feuille dont une capacité n'est pas reprise.
> **Chaque tâche qui coche une case le fait dans SON commit, avec sa mesure.**

---

## J. Ce que ce plan n'a PAS vérifié

Écrit ici parce qu'une affirmation non vérifiée présentée comme mesurée est un
défaut, pas une approximation.

- **Aucun build, aucun test, aucun simulateur n'a été lancé.** Toute phrase
  « cette garde rougirait » est une lecture de source, jamais une exécution.
- **Les libellés de la bascule POST↔RÉEL n'ont pas été cherchés au catalogue.**
  T2.4 dit « réutilise si elle existe, sinon 1 clé neuve » — **à MESURER avant
  d'écrire**, pas à l'estime. La feuille les pose en littéral (`:943-947`).
- **`AudioPostComposerView` n'a été lu que par sa signature d'appel**
  (`FeedView+Attachments.swift:1240-1252`). Son `onPublish` rend
  `(audioURL, mimeType, durationMs, transcription)` ; ce que fait sa fermeture
  `onPublishBorrowed` n'a pas été suivi jusqu'au bout (dette D-5).
- **`LocationPickerView` et `CameraView` n'ont pas été ouverts** — seulement leurs
  sites de montage. Leurs permissions (`MediaPermissionCoordinator`) et leur coût
  de présentation ne sont pas caractérisés.
- **Le comportement HORS LIGNE de bout en bout n'a pas été observé.** La chaîne
  `PublishIntent.document` → `publish` → `enqueuePostMedia` → `OutboxDispatcher`
  est une déduction de lecture, maillon par maillon ; `OutboxDispatcher.swift`
  n'a **pas** été rouvert dans cet arbre pour cette forme de charge.
- **`FeedView+Attachments.swift:285-545` (le chemin d'envoi de l'overlay iPad) a
  été lu en diagonale.** T3.4 exige son inventaire complet AVANT retrait ; ce plan
  ne le fournit pas.
- **Le nombre de suites de `MeeshyTests` et leur temps de gate n'ont pas été
  mesurés.** Les commandes `gate.sh test <Suites>` de ce plan nomment les suites
  qu'il faut ; elles n'ont jamais été lancées.
- **Le catalogue `apps/ios/Meeshy/Localizable.xcstrings` ne porte AUCUNE clé en
  double aujourd'hui** — mesuré deux fois (3369 clés au parseur textuel, 3369 par
  `json.load`). La règle « édition TEXTUELLE » de cette session reste néanmoins la
  bonne, pour une raison indépendante : un `json.dump` réordonnerait et
  reformaterait les 3369 entrées, rendant le diff illisible et tout conflit avec
  une session voisine indémêlable.
- **La planche P0** (`docs/superpowers/specs/2026-08-19-meeshy-composer-views.html`)
  n'a pas été relue : elle est réécrite en parallèle par un autre agent. Les
  cellules à y porter sont déposées dans `wave1/planche-deltas.md`.
