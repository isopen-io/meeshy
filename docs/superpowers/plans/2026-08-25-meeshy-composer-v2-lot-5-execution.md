# Lot 5 — Média reçu et composer (O13) — PLAN D'EXÉCUTION

> Remplace, pour l'exécution, `docs/superpowers/plans/2026-08-24-meeshy-composer-v2-lot-5.md`
> (rév. 2). Ce plan n'invalide pas son §1.4 (les trous du pont serveur, tous
> re-vérifiés VRAIS ci-dessous) : il **retire ces trous du périmètre** parce
> qu'ils tombent hors de la zone de fichiers de cette session, et il **corrige
> trois affirmations** de son §1.2/§4 que la mesure du 2026-08-25 dément.
>
> **Aucun build, aucun test n'a été lancé pour écrire ce plan.** Toute phrase
> « cette garde rougirait » est une lecture de source. Les affirmations
> d'EXISTENCE (une garde verte qui assère déjà X) sont, elles, des lectures de
> tests présents dans l'arbre.

**Worktree** : `/Users/smpceo/Documents/v2_meeshy-composer`, branche `main`.
**HEAD au moment de la mesure** : `22d8ea9831`.
**⚠️ L'arbre est SALE — 93 entrées, +3742/−648 lignes appartenant à d'AUTRES
chantiers** (transport média web/gateway, idempotence des reposts, outbox SDK).
Tous les numéros de ligne de ce plan sont ceux de l'arbre SALE. `git add -A` est
interdit ; committer par `git commit -- <chemins>` et relire `git status --short`
avant chaque commit.

---

## 0. Ce que ce plan tranche, en une page

| Question de la mission | Réponse TRANCHÉE | Preuve |
|---|---|---|
| Quelle graine le meuble accepte, sous quelle forme ? | Une graine **MeeshyUI** posée à la CONSTRUCTION du ViewModel, `StoryComposerSeed` — `image(UIImage)` **déjà décodée** ou `video(fileURL:)`. `StoryComposerViewModel(seeding:)` reste le bon foyer, mais **il ne suffit pas** : il faut un 4e cas d'`openingDraftAction`, sans quoi la graine est soit invisible, soit détruite. | §2 |
| Où naît le geste « Composer » ? | Dans **`PrimaryAction`** (la liste verticale de l'appui long), pas dans la feuille « Plus… » — O13 exige **2 gestes**, et « Plus… » en coûte 3. Second déclencheur : la section « Publier » de `ForwardPickerSheet` (loi 6). | §4 |
| Ce que la porte OFFRE / REFUSE | Offre : **story · post · réel\*** — mais seulement après avoir changé son `opensWith`, faute de quoi l'éventail **ne se peint PAS DU TOUT** (mesuré, test vert à l'appui). Refuse : audio, document, PDF, lieu, vue-unique, chiffré, lot multi-pièces. | §3 |
| Comment la loi 6 est tenue ENTIÈREMENT | L'aperçu est rendu par `StoryComposerView` (l'atelier du SDK) — le MÊME registre de rendu que le lecteur de story. Aucune surface de ce lot ne redessine un aperçu ; la seule surface qui le pourrait (`ComposerDocumentSurface`) est mise hors d'atteinte par le §3. | §3 + §5 |
| Ordre contraint | graine (T1) → offre (T2) → meuble (T3) → porte (T4) → geste (T5) → 2e déclencheur (T6). | §6 |

---

## 1. Mesure — ce que j'ai vérifié moi-même, et les TROIS corrections

### 1.1 Ce que le plan rév. 2 dit de VRAI (re-vérifié, sans réserve)

- **La porte `.conversationMedia` existe et n'a AUCUN appelant de production.**
  `ComposerIntent.swift:33`. `grep "ComposerIntent(" hors tests` rend **cinq**
  sites — `iPadRootView.swift:155`, `RootViewComponents.swift:890`,
  `RootView.swift:657`, `StoryTrayActions.swift:192`, `ConversationListView.swift:1090`
  — aucun n'est `.conversationMedia`. (Le plan rév. 2 en comptait UN : les lots 3/4
  en ont ajouté quatre depuis.)
- **Le meuble n'a AUCUN canal de graine média.** `MeeshyComposerHost.init`
  (`:377-419`) prend `intent`, `initialVisibility`, `draftId`,
  `onPublishAllInBackground`, `onPublishDocument`, `moodSeed`, `onPreview`,
  `onDismiss`. Rien pour un média.
- **Le SDK n'a aucun écrivain de média PUBLIC.** `insertForegroundImage` /
  `insertForegroundVideo` (`StoryComposerViewModel+Capture.swift:26` et `:60`),
  `setImage(_:for:)` (`+Slides.swift:242`), `slides`, `slideImages`,
  `loadedImages`, `loadedVideoURLs`, `hasBackgroundImage` — **tous `internal` à
  `MeeshyUI`**. L'app ne peut rien poser.
- **Le précédent public existe** : `StoryComposerViewModel.init(reposting:authorHandle:)`
  (`+Repost.swift:30`, `public convenience init`), consommé par
  `StoryComposerView.init(viewModel:…)` (`StoryComposerView.swift:337`, `public`).
- **La feuille de forward tient la loi 6 à moitié** : `publicationSection`
  (`ForwardPickerSheet.swift:298`), `performPublish` envoie `content: nil`
  (`:451`), **0 `TextField` sur 760 lignes**, `publicationTargets` appelle
  `PublicationTargetRule.targets(forMimeType:)` **sans durée** (`:294`).
- **Les cinq trous du pont serveur (T1–T5) sont TOUS confirmés** par lecture
  directe : `grep -c` rend **0** pour `isViewOnce`, `isEncrypted`,
  `capturedInApp` et `withMutationLog` dans
  `services/gateway/src/services/posts/publishAttachment.ts`, et le `select` de
  la route (`routes/posts/core.ts:222-228`) ne demande ni `isViewOnce` ni
  `isEncrypted`. `DEFAULT_PUBLICATION_VISIBILITY` s'applique à tous les types
  (`core.ts:278`) là où `POST /posts` retombe sur `FRIENDS` pour une STORY
  (`core.ts:330`). **Ces cinq fichiers sont HORS ZONE — voir §8.**

### 1.2 Correction n° 1 — **l'éventail de `.conversationMedia` ne se peint PAS**, et c'est la loi 4 qui tombe

Le plan rév. 2 promet en DoD de sa tâche 5.6 : « l'atelier s'ouvre …, éventail
`story · post` (+ `réel` si la composition qualifie) ». **C'est faux dans l'arbre
courant, et un test VERT le dit déjà.**

`ComposerFormatFanPlacement.paints` (`ComposerFormatFan.swift:91-107`) exige que
**tous** les formats offerts atterrissent du même côté de la frontière
scène / pas-de-scène que la surface montée :

```swift
case .scene:  return offeredFormats.allSatisfy(monteUneScene)
```

Or `.conversationMedia` ouvre sur `.keyboardOnContent`, et
`ComposerSurfaceRouting.surface(.keyboardOnContent, .post)` rend **`.document`**
(`ComposerDocumentSurface.swift:78-89`). L'offre `plusReel([.story, .post])`
contient donc un format qui n'atterrit pas sur la scène ⇒ `paints == false` ⇒
`mounts == false` ⇒ **aucun sélecteur de format n'est peint**.

Ce n'est pas une déduction : `ComposerDocumentSurfaceTests` l'épingle déjà, en
toutes lettres, sur les deux formats —

```
("média de conversation · Story", mediaRecu, .story, false),
("média de conversation · Post",  mediaRecu, .post,  false)
```
(`test_lePlacementDeLEventail_suitLaSurfaceOuAtterrissentSesFormats`), et

```
("média de conversation · scène", mediaRecu, .scene, false)
```
(`test_lesDeuxReglesDeLEventail_seLisentENSEMBLE_dansUneSeuleRegle`).

**Conséquence produit** : câbler la porte telle qu'elle est livrerait un composer
qui DÉCLARE trois formats et n'en offre aucun contrôle. C'est exactement l'UI
morte que la loi 4 nomme — un cran pire, même : le lot 4 a écrit la règle
`paints` PRÉCISÉMENT en citant `.conversationMedia` comme le cas qui la rend
nécessaire, en écrivant « le jour où le lot G le câblera, la règle aura déjà
tranché ». Elle a tranché **contre** le profil actuel.

**Le plan rév. 2 ne pouvait pas le savoir** — `ComposerFormatFanPlacement` est né
le 2026-08-24/25, après sa rédaction.

### 1.3 Correction n° 2 — **`opensWith: .keyboardOnContent` est INERTE sous la scène**

`ComposerSurfaceRouting.focusesContentOnAppear(opening:)` n'a **qu'un seul
consommateur de production** : `MeeshyComposerHost.swift:795`, où il est passé à
`ComposerDocumentSurface(focusesOnAppear:)`. Sous la SCÈNE, rien ne le lit — et
l'atelier n'a pas de champ « contenu » à mettre au foyer : on écrit dans une story
en posant un OBJET TEXTE, pas en remplissant un champ.

Donc la phrase du profil — « le média reçu est déjà posé par la porte : il ne
reste que le mot à écrire », épinglée par
`ComposerIntentTests.test_profile_conversationMedia_ouvreUneStorySurSaGraine` —
**annonce un clavier qui ne se lève pas**. C'est la forme exacte du défaut que le
cycle 123 a nommé sur `StoryViewer` : *une surface qui ANNONCE ce qu'elle
n'applique pas*.

Mesure de contrôle : `ComposerOpening` n'a que **deux** consommateurs de
production dans tout le dépôt — `ComposerSurfaceRouting.surface` et
`focusesContentOnAppear` (plus `ComposerFormatFanPlacement`, qui le reçoit en
paramètre). **Une ouverture est aujourd'hui une CLÉ DE ROUTAGE, rien d'autre** :
`.cameraReady` n'ouvre aucune caméra (c'est `profile.allowsCapture` qui gate la
capture, `test_host_gatesCaptureOnTheProfile`). C'est ce fait qui rend le
correctif du §3 bon marché **et** honnête.

### 1.4 Correction n° 3 — **le montage ne peut PAS vivre dans `ConversationView`**

Le plan rév. 2 écrit : `Modify: ConversationView.swift (le seul bloc de
présentation, à côté de :864)`. Une garde du lot 4 l'interdit :

```swift
XCTAssertEqual(Set(sitesVus),
  ["StoryTrayActions.swift", "ComposerMoodSurface.swift", "ComposerDocumentSurface.swift"],
  "Les sites qui montent le MEUBLE lui-même sont écrits en toutes lettres, et ce sont des PORTES : …")
```
(`MeeshyComposerHostGuardTests.test_chaqueSiteQuiMonteLeMeuble_luiDonneSonCanalDePublication_etSaGraine`).

Monter `MeeshyComposerHost` depuis `ConversationView` ferait rougir cette garde —
et elle a raison : le montage porte l'envoi, la reprise et la sortie ; posé dans
une feuille de présentation, il serait recopié au premier second site. **Ce lot
crée donc une PORTE**, `ConversationMediaComposerDoor`, sur le patron de
`MoodComposerDoor` / `DocumentComposerDoor`, et l'ajoute à cette liste.

### 1.5 Ce que la mesure ajoute, et que personne n'avait écrit

1. **Le chemin d'UPLOAD ne lit PAS `slide.mediaURL`.** `runStoryUpload`
   (`StoryViewModel.swift:2223`) n'envoie un fond que si
   `upload.slideImages[slide.id]` porte un **UIImage** ; les premiers plans
   partent de `loadedVideoURLs[obj.id]` (fichier) ou `loadedImages[obj.id]`
   (bitmap). Un objet déclaré **sans actif chargé** est sauté avec un log
   (`"layer will be invisible to viewers"`, `:2288`) — c'est le mode d'échec
   exact d'une graine mal formée. Le §8 du plan rév. 2 le listait comme
   « hypothèse non vérifiée » ; il est désormais mesuré.
2. **Une graine d'IMAGE doit être posée AVANT `onAppear`, une graine de VIDÉO non.**
   Le fond de slide est recopié dans un `@State` de la VUE (`selectedImage`) par
   `restoreCanvas(from:)` (`+SyncRestore.swift:88-89`) — un INSTANTANÉ. Un bitmap
   qui arriverait après ne serait jamais relu. Le premier plan, lui, se rafraîchit
   par version (`registerLoadedImage` bump `loadedImagesVersion`), donc il tolère
   un remplissage asynchrone. **Cette asymétrie commande la forme de la graine
   (§2).**
3. **Une session FRAÎCHE n'appelle jamais `restoreCanvas`** :
   `openingDraftAction(…) == .offerDraftResume` fait `checkForDraft()` +
   `seedHistory()` (`StoryComposerView.swift:463-479`), sans restauration. Un fond
   semé sur le ViewModel resterait donc **invisible**.
4. **Et pire : elle propose une REPRISE de brouillon par-dessus la graine.**
   `restoreDraft()` écrase `viewModel.slides` sans condition
   (`+SyncRestore.swift:632-671`, y compris la branche `UserDefaults` legacy
   `:667-671`). Taper « Reprendre » sur la carte détruirait le média semé, sans
   un mot. *(Le repost est exposé au même défaut aujourd'hui — voir §8, dette
   D-6 : ce lot le ferme pour les sessions SEMÉES, pas pour le repost, qui n'est
   pas dans son périmètre.)*
5. **Le fichier rendu par la matérialisation appartient au CACHE.**
   `AttachmentMediaSaveResolver.resolveLocalFile(for:)`
   (`MediaSaveCoordinator.swift:271-299`) rend `store.localFileURL(for:)` — le
   fichier du `DiskCacheStore`, soumis à éviction mtime. Le composer, lui, exige
   la convention « `obj.id` == nom du fichier » et **copie** plutôt que de
   référencer (`StoryComposerView+Media.swift:513-518`). La graine doit donc
   **copier**, jamais référencer : une éviction entre l'ouverture et l'envoi
   ferait échouer l'upload d'une vidéo déjà composée.

---

## 2. Décision — LA GRAINE

### 2.1 Le foyer : `StoryComposerViewModel(seeding:)` **oui**, mais accompagné

Le foyer proposé par le plan rév. 2 reste le bon, pour trois raisons mesurées :
le meuble construit son ViewModel dans son `init` (`MeeshyComposerHost.swift:396`)
et l'enveloppe dans un `@StateObject` — donc la graine doit s'appliquer à la
construction ; `StoryComposerView.init(viewModel:)` accepte déjà un ViewModel
pré-peuplé ; et `init(reposting:)` en est le jumeau exact.

**Mais un `init` seul ne suffit pas** (§1.5, points 2–4). Le lot livre donc
**deux** pièces SDK, indissociables :

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Seed.swift  (NEUF)

/// Ce qu'une porte pose dans le composer avant qu'il ne s'ouvre. OPAQUE : le
/// SDK ne sait pas d'où ça vient — c'est la condition de sa pureté.
public struct StoryComposerSeed {
    public enum Payload {
        /// Un bitmap DÉJÀ DÉCODÉ. Le décodage appartient à l'appelant, qui est
        /// déjà dans un contexte asynchrone (il vient de matérialiser le
        /// fichier). Le faire ici imposerait un décodage synchrone au moment où
        /// la vue se construit — et il DOIT être synchrone, parce que le fond
        /// de slide est recopié dans un `@State` de la vue par un INSTANTANÉ
        /// (`restoreCanvas`), qui ne relit jamais ce qui arrive après lui.
        case image(UIImage)
        /// Un fichier LOCAL. Le composer le COPIE sous sa convention de nom
        /// (`{objectId}.{ext}`) : le référencer laisserait l'envoi dépendre du
        /// cache typé, soumis à éviction mtime.
        case video(fileURL: URL)
    }
    public let payload: Payload
    public init(payload: Payload)
}

public extension StoryComposerViewModel {
    convenience init(seeding seed: StoryComposerSeed)
}
```

Ni `Sendable` ni `Equatable` : `UIImage` n'est ni l'un ni l'autre proprement, la
graine est construite et consommée sur le main actor, et aucune garde ne les
exige (contrairement à `ComposerMoodSeed`, qui voyage par la file durable).

**Ce que l'`init` fait, et l'asymétrie assumée :**

| Graine | Pose | Pourquoi |
|---|---|---|
| `.image` | `setImage(bitmap, for: slide.id)` — **synchrone, complet** | Le fond n'a pas de chemin de rafraîchissement : `selectedImage` est un instantané pris une seule fois. |
| `.video` | copie du fichier vers `tmp/{objectId}.{ext}` puis `insertForegroundVideo(url:thumbnail:nil, aspectRatio:nil, duration:nil, …)` **synchrone**, puis une `Task` qui remplit vignette / ratio / durée | `loadedVideoURLs[obj.id]` suffit à l'ENVOI dès la première ligne ; l'affichage se rafraîchit par `loadedImagesVersion`, donc il tolère l'asynchrone. Sans ce découpage, on décoderait une piste vidéo sur le main actor dans un `init` de `View`. |

**Ce que l'`init` ne fait PAS**, et chaque refus a son test :
- aucun `repostOfId` / `originalRepostOfId` — une graine n'est pas une
  republication (clause O13 : « aucune référence automatique vers l'expéditeur ») ;
- aucun `StoryTextObject` avec `isLocked: true` — le badge d'attribution est
  l'apanage EXCLUSIF du repost (`+Repost.swift:63-79` en est l'unique producteur) ;
  en poser un afficherait « Reposté de @… » sur un média reçu **en privé** ;
- aucun préchargement distant : la graine est LOCALE ;
- **aucun cas `.audio`** — voir §3.3.

### 2.2 La seconde pièce : le 4e cas d'ouverture de brouillon

```swift
// packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift  (MODIFIÉ)
nonisolated enum ComposerOpeningDraftAction {
    case restoreAdoptedDraft, offerDraftResume, hydratedByEditMode
    case adoptSeededCanvas          // ← NEUF
}

nonisolated static func openingDraftAction(
    isEditingExistingStory: Bool,
    isAdoptedDraftSession: Bool,
    isSeededSession: Bool            // ← NEUF
) -> ComposerOpeningDraftAction
```

Précédence : `isAdoptedDraftSession` > `isSeededSession` > `isEditingExistingStory`
> `offerDraftResume`. La branche `.adoptSeededCanvas` fait
`restoreCanvas(from: viewModel.currentSlide)` puis `viewModel.seedHistory()` — et
**n'offre aucune carte de reprise**.

Elle règle **deux** défauts d'un coup, et il faut les nommer séparément parce que
les fermer à moitié laisserait un produit plausible :
1. sans elle, le fond semé n'est jamais recopié dans `selectedImage` ⇒
   **canvas vide** sous une porte qui vient d'annoncer un média posé ;
2. sans elle, la carte « Reprendre » se propose par-dessus la graine, et
   `restoreDraft()` **écrase `slides`** ⇒ le média disparaît d'un tap.

`isSeededSession` est un `public internal(set) var` posé par `init(seeding:)`, sur
le modèle exact d'`editingPostId` / `isAdoptedDraftSession`.

---

## 3. Décision — CE QUE LA PORTE OFFRE, ET CE QU'ELLE REFUSE

### 3.1 L'offre : `story · post · réel*`, obtenue par le ROUTAGE et non par un rabotage

Deux issues étaient possibles au constat du §1.2 :

- **(A) rétrécir l'offre** à `plusReel([.story])` — l'éventail se peint alors dès
  que le réel qualifie, et `.post` quitte le chemin composé ;
- **(B) élargir le routage** — donner à cette porte une ouverture qui envoie
  **tous** ses formats sur la scène, exactement comme `.storyTray` (offre
  identique `story · post · réel*`, ouverture `.cameraReady`, éventail peint,
  `paints == true` mesuré dans la même table de test).

**Ce plan retient (B)**, pour trois raisons dans cet ordre :

1. **(A) diverge de la table §C de la spec** (`conversationMedia` → `story · post ·
   réel*`), (B) l'honore ;
2. **le mécanisme de (B) existe déjà et tourne** : `.storyTray` publie un POST
   avec média par l'atelier, `publishTargetType: selectedFormat.postType`
   (`MeeshyComposerHost.swift:684`) → `publishStoryInBackground(targetType:)`
   (`StoryViewModel.swift:1396-1400`). Rien à inventer ;
3. **(B) RETIRE une déclaration inerte** (§1.3) au lieu de rétrécir une offre
   produit. Entre supprimer un mensonge et supprimer une capacité, on supprime le
   mensonge.

Concrètement — `ComposerOpening` gagne un cas, et **rien d'autre ne bouge** :

```swift
// ComposerIntent.swift
nonisolated enum ComposerOpening: Equatable {
    case cameraReady, keyboardOnContent, videoCameraReady, moodGrid, resume
    case mediaSeeded            // ← NEUF : le média est DÉJÀ posé
}

// ComposerDocumentSurface.swift — ComposerSurfaceRouting
case .cameraReady, .videoCameraReady, .resume, .mediaSeeded: return .scene
// focusesContentOnAppear : `.mediaSeeded` rejoint la liste des `false`

// ComposerIntent.swift — profil de .conversationMedia
opensWith: .mediaSeeded        // était .keyboardOnContent
offeredFormats: plusReel([.story, .post])   // INCHANGÉ
```

Les deux `switch` sur `ComposerOpening` sont exhaustifs : le compilateur nomme
lui-même les sites. Effet mesurable de la bascule :
`paints(.scene, .mediaSeeded, [.story, .post, .reel])` devient **true** — toutes
les branches de `surface(opening: .mediaSeeded, format:)` rendent `.scene`.

> **Le doc-comment du profil doit changer avec le code.** Il dit aujourd'hui « il
> ne reste que le mot à écrire » et « câblage lot G ». La première phrase
> annonçait un clavier qui ne se lève pas (§1.3) ; la seconde désigne un lot qui
> n'a jamais existé. Un commentaire qui énonce plus que ce que le code tient
> devient la loi lue par la session suivante — le dépôt l'a déjà payé trois fois.

### 3.2 Ce que la porte offre, en un tableau

| Ce que l'auteur voit | Quand | Mécanisme |
|---|---|---|
| l'atelier, média posé, format **Story** | toujours | `ComposerSurfaceRouting → .scene` + graine |
| chip **Post** | toujours | éventail (après §3.1) — publie par l'atelier avec `publishTargetType: .post` |
| chip **Réel** | quand `ComposerReelGate.compositionQualifiesAsReel(viewModel.currentEffects)` | l'éventail RESPIRE : une vidéo ≥ 3 s ou une 2e image le fait apparaître, la retirer le fait disparaître |
| l'audience | peinte par l'ATELIER (`chromeOwner == .atelier` sous `.scene`) | inchangé |

### 3.3 Ce que la porte REFUSE, et pourquoi chaque refus est mesuré

| Refusé | Raison MESURÉE | Où le refus vit |
|---|---|---|
| **audio** | `runStoryUpload` ne transporte un son que par un `audioPlayerObject` (branche `updatedEffects.audioPlayerObjects`), qui exige une place, une durée et un contrôle sur le canvas — une décision de composition que la porte ne peut pas prendre. Une graine audio produirait un objet sans actif chargé, donc « invisible aux lecteurs » (`StoryViewModel.swift:2288`). | `StoryComposerSeed.Payload` n'a **pas** de cas `.audio` ; la règle de composabilité l'exclut |
| **document, PDF, code, archive, texte** | `AttachmentKind` les range hors `.image`/`.video` ; le fil ne sait pas les rendre | règle de composabilité |
| **lieu** (`application/x-location`) | `AttachmentKind(mimeType:)` rend `.other` — la garde O13 « jamais `.location` » est tenue **gratuitement** | règle de composabilité |
| **vue unique** | `Message.isForwardable` (`Message.swift:25`) est `!isViewOnce` ; c'est déjà ce qui masque `.forward` | contexte du menu |
| **chiffré** | `MeeshyMessageAttachment.isEncrypted` (`CoreModels.swift:1448`). Ne pas offrir un geste dont le serveur ne veut pas — et le serveur, lui, ne le refuse PAS encore (T2, §8) | contexte du menu |
| **lot de plusieurs pièces jointes** | la première pièce décide déjà pour la publication (`ForwardPickerSheet.swift:289`) ; un lot hétérogène mentirait sur ce qui partirait | `composableAttachmentCount == 1`, sur le patron exact de `saveableAttachmentCount` |

Le refus n'est **jamais** un contrôle grisé : l'entrée du menu est **absente**
(loi 4).

> **La règle de composabilité n'est PAS `PublicationTargetRule.targets`**, et
> c'est délibéré. Ce sont deux questions différentes : `targets` répond « où le
> PONT peut-il envoyer ces octets tels quels ? » (POST/REEL/STORY, audio compris) ;
> la composabilité répond « la GRAINE peut-elle poser ceci sur un canvas ? »
> (image/vidéo seulement). Les fondre ferait offrir « Composer » sur une note
> vocale que la graine ne sait pas poser.

---

## 4. Décision — OÙ NAÎT LE GESTE

### 4.1 Déclencheur principal : `PrimaryAction.compose`, pas `MoreItem`

O13 (contrat gelé) dit **2 gestes**. La feuille « Plus… » en coûte trois (appui
long → « Plus… » → « Composer »). La liste verticale de l'overlay en coûte deux —
et elle porte DÉJÀ le voisin naturel : `.saveMedia`, gaté par
`saveableAttachmentCount == 1` (`MessageActionResolver.swift:84`).

Pour une photo reçue sans texte, l'overlay affiche aujourd'hui
`[Enregistrer, Plus…]`. Il affichera `[Enregistrer, Composer, Plus…]`.

```swift
// MessageActionResolver.swift
enum PrimaryAction { case edit, translate, copy, saveMedia, compose, pin, … }

struct MessageMenuContext {
    /// Pièces jointes que la GRAINE sait poser sur un canvas (image, vidéo).
    /// Distinct de `saveableAttachmentCount` : une note vocale s'enregistre et
    /// ne se compose pas.
    var composableAttachmentCount: Int = 0
    /// Une pièce jointe chiffrée ne se compose pas — miroir CLIENT d'un refus
    /// que le serveur ne pose pas encore (dette T2).
    var hasEncryptedAttachment: Bool = false
}

// primaryActions
if ctx.composableAttachmentCount == 1
    && ctx.isForwardable
    && !ctx.hasEncryptedAttachment { out.append(.compose) }
```

Trois sites construisent un `MessageMenuContext` et doivent recevoir les deux
champs : `ConversationView.swift:942` (feuille « Plus… »),
`ConversationView.swift:2532` (menu natif) et
`MessageOverlayMenu.swift:165` (overlay). Les deux derniers alimentent
`primaryActions` — ce sont eux qui portent le geste.

> ⚠️ **`ConversationView.swift:2532` ne passe PAS `isForwardable`** aujourd'hui, et
> profite donc du défaut `true`. Inoffensif tant que `primaryActions` ne le lisait
> pas ; **ce lot le rend load-bearing**. Le passer explicitement fait partie de la
> tâche T5, et un test le grave.

`.compose` reçoit son icône et son libellé aux deux sites qui les tiennent :
`MessageActionsMenu.swift:101` (`"wand.and.stars"`) et `:117` (clé neuve
`message.compose.title`, **7 locales**). Le libellé est **« Composer »**, jamais
« Publier » : la pilule de la feuille publie, l'entrée du menu ouvre l'atelier.

### 4.2 Second déclencheur : la section « Publier » de la feuille de forward (loi 6)

La loi 6 est explicite : « Ce n'est pas une dixième porte : c'est un **second
point d'entrée** de `.conversationMedia` — même graine, même éventail ». La
feuille gagne donc, à côté de ses pilules de destination, une entrée
**« Composer »** — présente sous la même condition de composabilité que le menu.

**Elle ne monte PAS le meuble** (§1.4) : elle prend une fermeture
`onCompose: () -> Void`, se referme, et l'hôte (`ConversationView`) pose le même
état que l'overlay. Un seul chemin de présentation, deux déclencheurs — ce que la
loi 6 demande, mot pour mot.

---

## 5. Comment la loi 6 est tenue ENTIÈREMENT

**Le composant qui rend l'aperçu est `StoryComposerView` — l'atelier du SDK.**

C'est le même registre de rendu que le lecteur : le meuble le monte tel quel
(`MeeshyComposerHost.composerSurface`, `:679`), il n'en redessine aucune partie,
et le doc-comment du meuble le dit déjà (« composer et viewers partagent un seul
registre de rendu »). L'œil du socle est ABSENT sous la scène
(`ComposerChromeOwnership.socleZones(for: .scene) == []`), précisément pour ne pas
peindre un second aperçu amputé des médias préchargés.

La seule surface qui pourrait mentir est `ComposerDocumentSurface` : elle rend du
TEXTE, ne porte aucun média, et `ComposerDocumentDraft` n'a **ni `mediaIds`, ni
fichier, ni lieu** (`ComposerDocumentSurface.swift:785-800` — vérifié champ par
champ). Choisir « Post » dans un composer semé y aurait fait **disparaître la
photo de l'écran ET de la publication**.

**Le §3.1 la met hors d'atteinte** : sous `.mediaSeeded`, *tous* les formats
routent vers `.scene`. Le chip « Post » change le `publishTargetType`, jamais la
surface. La loi 6 est donc tenue non par une promesse mais par le ROUTAGE — et
une garde de table le grave (T2).

---

## 6. L'ordre contraint

```
T1 (graine SDK)  ──►  T3 (le meuble l'accepte)  ──►  T4 (la porte)  ──►  T5 (le geste)  ──►  T6 (2e déclencheur)
T2 (l'offre)     ──────────────────────────────────►  ┘
```

- **T1 avant T3** : le meuble ne peut pas accepter ce qui n'existe pas ; et une
  porte ouverte sur un meuble incapable d'ingérer donne un composer VIDE — le
  défaut que la rév. 4 de `.feedComposer` retenait déjà.
- **T2 avant T4** : la porte ne s'ouvre qu'une fois son éventail RÉEL. Ouvrir
  d'abord livrerait, ne serait-ce qu'un commit, un composer à trois formats
  déclarés et zéro contrôle — et graverait une garde sur le mauvais invariant.
- **T2 avant T5** : le geste se gate sur la composabilité, qui doit exister.
- **T4 avant T5** : un menu qui ouvre sur rien est pire qu'un menu sans entrée.
- **T6 en dernier** : c'est un DEUXIÈME déclencheur d'un chemin déjà prouvé. Si le
  lot doit rétrécir, c'est lui qui tombe — et la loi 6 reste alors à moitié
  tenue, ce qu'il faudra ÉCRIRE plutôt que taire.

---

## 7. Les tâches

Convention : chaque tâche est **RED → GREEN → REFACTOR**, et chaque garde est
accompagnée de la **MUTATION** qui doit la faire rougir. Une garde dont on ne sait
pas dire ce qui la fait tomber n'est pas une garde.

---

### T1 — La graine, côté SDK

**Fichiers**
- Créer : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Seed.swift` — **cible SPM `MeeshyUI`** (aucun pbxproj)
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel.swift` (`isSeededSession`)
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+SyncRestore.swift` (`openingDraftAction`, `ComposerOpeningDraftAction`)
- Modifier : `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView.swift` (le `switch` d'`onAppear`)
- Créer : `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryComposerSeedTests.swift` — **cible SPM `MeeshyUITests`** (aucun pbxproj)

**Tests ROUGES**

| # | Test | Mutation qui le fait rougir |
|---|---|---|
| 1 | `.image` → **exactement un slide**, `currentSlideIndex == 0`, `imageForCurrentSlide()` rend le bitmap | poser le bitmap dans `loadedImages` au lieu de `slideImages` (le fond ne s'uploaderait pas) |
| 2 | `.video` → **un** `StoryMediaObject` de kind `.video` sur le slide courant, et `loadedVideoURLs[obj.id]` pointe sur un fichier qui **existe** et **n'est pas** l'URL source | remplacer la copie par une référence directe (`loadedVideoURLs[id] = seed.fileURL`) |
| 3 | `.video` → le fichier copié s'appelle `{obj.id}.{ext}` | casser la convention de nom (le `composerKey` ne retrouverait plus le bitmap) |
| 4 | ni `repostOfId` ni `originalRepostOfId` sur les deux formes | poser `repostOfId` = un id quelconque |
| 5 | **aucun** `StoryTextObject` avec `isLocked == true` — garde NÉGATIVE, doublée d'un garde-fou « le ViewModel porte bien un slide » | ajouter un badge d'attribution |
| 6 | `isSeededSession == true` après `init(seeding:)`, `false` après `init()` | oublier le drapeau |
| 7 | `.video` sur une URL qui ne pointe sur AUCUN fichier ⇒ ViewModel **vierge** (`slides` comme un `init()` nu, aucun objet orphelin) | poser l'objet quand même ⇒ « layer invisible aux lecteurs » |
| 8 | `openingDraftAction(isSeededSession: true, isAdoptedDraftSession: false, isEditingExistingStory: false) == .adoptSeededCanvas` | rendre `.offerDraftResume` ⇒ la carte de reprise écrase la graine |
| 9 | l'adoption PRIME : `(adopted: true, seeded: true) == .restoreAdoptedDraft` | inverser la précédence ⇒ un brouillon repris serait écrasé par une graine |
| 10 | table exhaustive des **8** combinaisons des trois booléens | ajouter un booléen sans le mettre dans la table |

**Implémenter** — copier la FORME de `+Repost.swift` (construction du slide,
`self.slides = [slide]`, `currentSlideIndex = 0`), sans badge, sans chaîne d'ids,
sans préchargement distant. Pureté SDK : ce fichier ne connaît ni
`MessageAttachment`, ni `CacheCoordinator`, ni la moindre règle « quand semer ».

**Vert** : scheme `MeeshySDK-Package`, DerivedData privée `/tmp/meeshy-dd-lot5-sdk`.

---

### T2 — L'offre : la porte cesse de déclarer un éventail qu'elle ne peint pas

**Fichiers**
- Modifier : `apps/ios/Meeshy/Features/Main/Composer/ComposerIntent.swift`
  (`ComposerOpening` + profil `.conversationMedia` + son doc-comment)
- Modifier : `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift`
  (`ComposerSurfaceRouting.surface`, `focusesContentOnAppear`)
- Modifier : `apps/ios/MeeshyTests/Unit/Composer/ComposerIntentTests.swift`
- Modifier : `apps/ios/MeeshyTests/Unit/Composer/ComposerDocumentSurfaceTests.swift`

**Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | `ComposerFormatFanPlacement.mounts(surface: .scene, opening: profil.opensWith, offeredFormats: profil.offeredFormats)` est **`true`** pour `.conversationMedia`, éventail qualifiant ou non | remettre `opensWith: .keyboardOnContent` |
| 2 | les **trois** formats de la porte routent vers `.scene` : `surface(.mediaSeeded, .story/.post/.reel) == .scene` | oublier `.mediaSeeded` dans la branche de scène ⇒ « Post » ouvre une surface de texte et la photo disparaît |
| 3 | `focusesContentOnAppear(.mediaSeeded) == false` | le laisser à `true` ⇒ une déclaration inerte de plus |
| 4 | l'offre reste `[.story, .post]` / `[.story, .post, .reel]` (test existant `test_conversationMedia_offreLEventailComplet_…`, **conservé**) | rétrécir l'offre |
| 5 | **retourner** les deux lignes de la table de placement — `("média de conversation · Story", …, true)` et `("… · Post", …, true)` | c'est le RED principal : la table est verte aujourd'hui **en `false`** |
| 6 | garde de corpus : `ComposerOpening` a **six** cas et chacun a un verdict de routage ET de foyer | ajouter un 7e cas sans l'inscrire |

> Les tests 5 sont ceux qui rendent ce lot vérifiable de bout en bout : ils
> **inversent une assertion verte**. Le lot 4 les a écrits « pour le jour où le lot
> G câblera la porte » — ce jour est celui-ci, et l'inversion est le geste
> attendu, pas un contournement. Le commentaire de chacune doit dire pourquoi elle
> a changé de côté (l'ouverture a changé, pas la règle).

---

### T3 — Le meuble accepte une graine

**Fichiers**
- Modifier : `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift` (**`init` + propriété seulement**)
- Modifier : `apps/ios/Meeshy/Features/Main/Views/StoryTrayActions.swift` (`mediaSeed: nil` + sa raison)
- Modifier : `apps/ios/Meeshy/Features/Main/Composer/ComposerMoodSurface.swift` (idem)
- Modifier : `apps/ios/Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift` (idem)
- Modifier : `apps/ios/MeeshyTests/Unit/Composer/MeeshyComposerHostGuardTests.swift`

**La signature**, greffée APRÈS `moodSeed:` — les deux graines côte à côte, la
plus récente en dernier, pour que la sous-suite de libellés reste lisible :

```swift
init(
    intent: ComposerIntent,
    initialVisibility: String,
    draftId: String? = nil,
    onPublishAllInBackground: @escaping (…) -> Bool,
    onPublishDocument: @escaping @MainActor (ComposerDocumentDraft) async -> Bool,
    moodSeed: ComposerMoodSeed?,
    mediaSeed: StoryComposerSeed?,          // ← NEUF, SANS valeur par défaut
    onPreview: @escaping (…) -> Void,
    onDismiss: @escaping () -> Void
)
```

**`mediaSeed` n'a PAS de valeur par défaut.** C'est la discipline que le lot 4 a
posée deux fois (`onPublishDocument`, `moodSeed`) et que
`ComposerDocumentDraft.document(…repostOfId:)` a reprise une troisième : un défaut
ferait disparaître la graine d'un site de montage **sans casser la moindre
compilation**, et la porte du média reçu ouvrirait un composer vide — un produit
parfaitement plausible. Les trois sites existants écrivent donc `mediaSeed: nil`
**et écrivent pourquoi**.

Corps de l'`init` :
```swift
let composer = mediaSeed.map(StoryComposerViewModel.init(seeding:)) ?? StoryComposerViewModel()
if let draftId { composer.adoptDraft(id: draftId) }
```

**Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | garde de source : l'`init` contient `mediaSeed: StoryComposerSeed?,` — **sans `= nil`** (jumelle exacte de `test_laGraineDuMood_nAAucuneValeurParDefaut`) | ajouter `= nil` |
| 2 | `test_chaqueSiteQuiMonteLeMeuble_…` exige désormais aussi `mediaSeed:` sur chaque site, et son `Set` attendu gagne **`ConversationMediaComposerDoor.swift`** (posé en T4) | monter le meuble ailleurs |
| 3 | `test_chaqueSiteDeMontage_presenteSesLibellesDansLOrdreDeLInit` : la liste écrite en dur passe à **9** libellés, `mediaSeed` en 7e | insérer le paramètre ailleurs qu'à son rang ⇒ erreur DURE de compilation que cette garde attrape **avant** le gate |
| 4 | garde de source : le meuble construit `StoryComposerViewModel(seeding:)` et **ne construit pas un second `StoryComposerViewModel`** hors de la branche `??` | fabriquer un second VM ⇒ autosauvegarde sous un id neuf |
| 5 | `mediaSeed` et `draftId` sont **mutuellement exclusifs**, et le brouillon adopté l'emporte (l'adoption vient après) | inverser l'ordre ⇒ perte silencieuse d'un travail en cours |

> **Cette tâche seule ne monte aucune seconde présentation.** Le meuble garde ses
> trois sites jusqu'à T4 : le lot reste livrable ici.

---

### T4 — La porte : `ConversationMediaComposerDoor`

**Fichiers**
- Créer : `apps/ios/Meeshy/Features/Main/Composer/ConversationMediaComposerDoor.swift` — **cible `Meeshy`, À GREFFER dans `project.pbxproj`**
- Créer : `apps/ios/MeeshyTests/Unit/Composer/ConversationMediaDoorTests.swift` — **cible `MeeshyTests`, À GREFFER dans `project.pbxproj`**
- Modifier : `apps/ios/MeeshyTests/Unit/Composer/MeeshyComposerHostGuardTests.swift` (le `Set` de T3-2)
- Modifier : `apps/ios/MeeshyTests/Unit/Views/AppInitWireupTests.swift` (`storyComposerCreationMounts`)

**Ce que la porte fait, dans cet ordre :**

1. **matérialise** — `MediaSaveSourceResolving.resolveLocalFile(for:)`, injecté
   **par le protocole** (seam de test), jamais par le type concret ;
2. **décode hors du main actor** — pour une image, un bitmap redimensionné ; c'est
   ici, et pas dans le SDK, parce que la porte est déjà dans un contexte
   asynchrone et que le SDK doit poser le fond **synchroniquement** (§1.5-2) ;
3. **présente** `MeeshyComposerHost(intent: ComposerIntent(origin: .conversationMedia(messageId:attachmentId:)), initialVisibility:, mediaSeed:, …)` ;
4. **publie** par le même câblage que `StoryComposerCover` —
   `StoryViewModel.publishStoryInBackground(targetType:…)`, qui porte déjà le
   format de l'éventail ;
5. **échoue en le DISANT** — un échec de matérialisation affiche un message et
   **n'ouvre rien**. Ouvrir une scène sans son média serait pire que ne rien
   ouvrir (doctrine déjà écrite : `StoryCanvasStarterEnvironment.swift:174-176`).

**Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | garde de source : **au moins un** fichier de production construit `ComposerIntent(origin: .conversationMedia(` — la garde que `ComposerDocumentSurfaceTests:217-221` avait explicitement laissée « au lot qui câblera réellement la porte » | débrancher la porte |
| 2 | garde-fou de la garde 1 : le corpus balayé compte **> 50** fichiers et contient `MeeshyComposerHost.swift` (motif `MeeshyComposerHostGuardTests:100-104`) | un chemin devenu faux ⇒ la garde 1 passerait au vert sur une chaîne vide |
| 3 | le montage passe `initialVisibility:` — et le nouveau site entre dans `AppInitWireupTests.storyComposerCreationMounts` | l'omettre ⇒ le SDK retombe sur `PostVisibility.friends` **sans un mot** (loi 10) |
| 4 | comportement : un résolveur qui **jette** ⇒ aucune présentation, un message posé | présenter quand même ⇒ atelier vide |
| 5 | comportement : un résolveur qui rend un fichier ⇒ la graine construite porte le bon cas (`.image` pour un mime image, `.video` pour un mime vidéo) | inverser les deux cas |
| 6 | garde de source : la porte **n'appelle aucun service de publication** en direct — elle passe par `StoryViewModel` (interdit du second chemin d'envoi, C2/V7) | appeler `PostService` |

> **Point non vérifié, à PROUVER avant de déclarer T4 verte** : que la graine
> locale monte bien dans `runStoryUpload` comme un média capturé. La lecture dit
> que oui (le fond part de `slideImages[slide.id]`, la vidéo de
> `loadedVideoURLs[obj.id]`), mais **aucun envoi réel n'a été fait**. Le faire —
> une photo, puis une vidéo — et consigner le résultat dans le commit.
> `StoryPublishQueue` (le second magasin persisté) n'a **pas** été ouvert : ne
> rien promettre sur le comportement HORS LIGNE de cette porte.

---

### T5 — Le geste

**Fichiers**
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift`
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageActionsMenu.swift` (icône + libellé)
- Modifier : `apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift` (contexte + `handlePrimaryAction`)
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (les **deux** contextes, l'état de présentation, le montage de la porte)
- Modifier : `apps/ios/Meeshy/Localizable.xcstrings` (**7 locales**)
- Modifier : `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift` (existant — **pas de fichier neuf**)

**Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | `.compose` apparaît quand `composableAttachmentCount == 1` | offrir sur 0 ou sur 2 |
| 2 | `.compose` **absent** quand `isForwardable == false` (vue unique) | retirer la condition ⇒ la garde O13 tombe |
| 3 | `.compose` **absent** quand `hasEncryptedAttachment` | idem |
| 4 | `.compose` **absent** pour un lieu / PDF / document (via `composableAttachmentCount == 0`) | dériver la composabilité de `PublicationTargetRule` ⇒ l'audio repasserait |
| 5 | `.compose` **absent** pour un AUDIO seul — le cas qui sépare composabilité et publiabilité | fondre les deux règles |
| 6 | ordre : `.compose` suit immédiatement `.saveMedia` | le placer après `.more` ⇒ hors du voisinage de gestes |
| 7 | garde de source : `ConversationView.swift` passe `isForwardable:` aux **deux** constructions de contexte | l'omettre ⇒ défaut `true` ⇒ « Composer » sur une vue unique |
| 8 | cliquet i18n : la clé neuve existe dans les **7** locales (`ar, de, en, es, fr, it, pt-BR`), vérifié par **dump du catalogue**, jamais à l'œil | en oublier une |

---

### T6 — Le second déclencheur (loi 6)

**Fichiers**
- Modifier : `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift` (`onCompose`, l'entrée dans `publicationSection`)
- Modifier : `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (câblage vers le MÊME état que T5)
- Modifier : `apps/ios/Meeshy/Localizable.xcstrings` (réutilise la clé de T5)
- Créer : `apps/ios/MeeshyTests/Unit/Components/ForwardPickerComposeEntryTests.swift` — **cible `MeeshyTests`, À GREFFER**

**Tests ROUGES**

| # | Test | Mutation |
|---|---|---|
| 1 | garde de source : la feuille **ne contient PAS** `MeeshyComposerHost(` — garde NÉGATIVE, doublée d'un garde-fou « la source lue est non vide et contient `struct ForwardPickerSheet` » | y monter le meuble ⇒ un second contrat d'envoi |
| 2 | garde de source : `publicationSection` contient `onCompose` | l'entrée serait un bouton inerte (loi 4) |
| 3 | la feuille se **referme** avant d'appeler `onCompose` | ouvrir le composer sous la feuille |

---

### T7 — Gate final

- [ ] Scheme `MeeshySDK-Package` COMPLET (DerivedData `/tmp/meeshy-dd-lot5-sdk`)
- [ ] `xcodegen generate` puis **greffe du DELTA pbxproj** contre `origin/main` —
      jamais un pbxproj régénéré en entier : il emporterait le WIP des chantiers
      voisins (93 fichiers dans l'arbre au moment de la rédaction)
- [ ] `./apps/ios/meeshy.sh test` — chiffres RÉELS consignés au commit (nombre de
      suites, nombre de tests), jamais « ça passe »
- [ ] Envoi RÉEL depuis la porte : une photo, une vidéo (§T4)
- [ ] Planches P0 (`docs/superpowers/specs/2026-08-19-meeshy-composer-views.html`) :
      la planche **se contredit elle-même** (arc `62/70` l. 278-281 contre puce
      « 57 tâches (81,4 %) » l. 287). Réconcilier ou dire laquelle fait foi, dans
      le commit du gate. Relire la révision la plus RÉCENTE avant d'écrire.
- [ ] **Aucune commande `git` qui écrit** hors `git commit -- <chemins explicites>`.

---

## 8. Ce que ce lot NE fait PAS — et les dettes, avec fichier et ligne

### 8.1 Hors ZONE DE FICHIERS de cette session (interdiction d'écriture)

| # | Dette | Fichier : ligne | Ce qu'il faut faire |
|---|---|---|---|
| **D-1** | `isViewOnce` n'est vérifié **nulle part** côté serveur — la garde O13 n'est tenue que par le client | `services/gateway/src/routes/posts/core.ts:222-228` (le `select`) et `services/gateway/src/services/posts/publishAttachment.ts:72-107` (`planAttachmentPublication`) | ajouter `isViewOnce: true` au `select` **et** un refus `VIEW_ONCE_MEDIA`, évalué APRÈS l'appartenance |
| **D-2** | `isEncrypted` non plus : le pont duplique des octets **chiffrés** dans un `PostMedia` public, illisible par construction | mêmes fichiers, mêmes lignes | refus `ENCRYPTED_MEDIA` |
| **D-3** | `capturedInApp` est accepté par le Zod et **jamais lu**, pendant que **deux commentaires affirment le contraire** | `services/gateway/src/routes/posts/types.ts:550-562` ; `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift:568-570` | le retirer (le serveur n'en fait rien) **ou** l'honorer via `withMutationLog` — et réécrire les deux commentaires dans les deux cas |
| **D-4** | Divergence de visibilité : une story née d'un partage naît **PUBLIQUE**, la même née du composer naît entre amis | `services/gateway/src/services/posts/publishAttachment.ts:135` (`DEFAULT_PUBLICATION_VISIBILITY`) vs `services/gateway/src/routes/posts/core.ts:330` | faire du défaut une **fonction du type** |
| **D-5** | Pas d'idempotence : `POST /posts/from-attachment` appelle `postService.createPost` en direct ; un retry réseau publie deux fois | `services/gateway/src/routes/posts/core.ts:275` (contre `:321-336` pour `POST /posts`) | envelopper par `withMutationLog` — appartient au lot 7 |
| **D-7** | **La loi 4 est violée sur les DEUX clients de la feuille de forward** : `REEL` est offert sans lire la durée, et le gateway dégrade ensuite en POST **sans un mot** (`services/gateway/src/services/PostService.ts:269`) | `packages/shared/utils/forward-to-publication.ts:54` (règle) ; `apps/web/components/conversations/forward-message-modal.tsx:425` (**seul** consommateur TS) ; `packages/MeeshySDK/.../PublicationTarget.swift:52-55` ; `apps/ios/.../ForwardPickerSheet.swift:294` | **ne PAS le faire à moitié** : la règle TS n'a qu'un consommateur, et il est dans `apps/web/**` (interdit ici). La changer sans changer son site d'appel ferait perdre la pilule « Réel » à **toutes** les vidéos du web, y compris qualifiantes. Le correctif est ATOMIQUE : règle + web + Swift + iOS dans un même lot |
| **D-8** | iOS n'a pas le mot à écrire : `content: nil` en dur, 0 `TextField` sur 760 lignes, là où le web envoie sa note | `apps/ios/.../ForwardPickerSheet.swift:451` vs `apps/web/components/conversations/forward-message-modal.tsx:436` | un `TextField` d'une ligne, plafonné comme le Zod, `content: note.trimmed().isEmpty ? nil : note` (jamais `""`). **Faisable dans cette zone** — écarté ici par ARBITRAGE de périmètre, pas par impossibilité : c'est le chemin SANS canevas, et ce lot ouvre le chemin COMPOSÉ. À reprendre immédiatement après |

### 8.2 Dans la zone, mais délibérément hors périmètre

| # | Sujet | Raison |
|---|---|---|
| **D-6** | Le composer de **REPOST** est exposé au même défaut que §1.5-4 : `openingDraftAction` lui rend `.offerDraftResume`, et taper « Reprendre » écrase le slide repartagé. | T1 ferme le cas SEMÉ, pas le cas REPOSTÉ. Le fermer aussi demanderait de décider si un repost est une session « adoptée » — une question de produit qui n'appartient pas à O13. **À ne pas traiter en passant** : c'est exactement le genre de correctif qui a l'air gratuit et change le comportement d'une porte livrée |
| — | **Aucun RETRAIT.** La section « Publier » de `ForwardPickerSheet` reste : le chemin sans-canevas et le chemin composé ne sont pas concurrents (le pont n'a aucun canal pour un `storyEffects`, le composer ne peut pas servir le partage sans payer les octets) | §1.1 du plan rév. 2, re-vérifié |
| — | **La graine AUDIO** | §3.3 — refus mesuré, pas oubli |
| — | **Le second point d'entrée WEB** de `.conversationMedia` | lot 6 ; `apps/web/**` interdit ici |
| — | **Android** | lot H suspendu ; `grep -rn "publishAttachment\|from-attachment" apps/android` rend **rien** |
| — | **La fusion des destinations DANS la liste de `ForwardPickerModel`** | chantier de modèle (`ForwardTarget.id`), pas de composer. `ForwardPickerViewModel.search` n'a pas été ouvert |

---

## 9. Fichiers NEUFS, par cible

| Fichier | Cible | Greffe pbxproj ? |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Seed.swift` | SPM `MeeshyUI` | **non** (SPM découvre) |
| `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryComposerSeedTests.swift` | SPM `MeeshyUITests` | **non** |
| `apps/ios/Meeshy/Features/Main/Composer/ConversationMediaComposerDoor.swift` | **`Meeshy`** | **OUI** |
| `apps/ios/MeeshyTests/Unit/Composer/ConversationMediaDoorTests.swift` | **`MeeshyTests`** | **OUI** |
| `apps/ios/MeeshyTests/Unit/Components/ForwardPickerComposeEntryTests.swift` | **`MeeshyTests`** | **OUI** |

**Trois fichiers à greffer.** Un fichier de test neuf absent du `project.pbxproj`
n'est pas exécuté par `xcodebuild` : la suite passe au vert **en n'existant pas**.
`xcodegen generate`, puis greffer le **delta** contre `origin/main`.

---

## 10. Les pièges NOMMÉS pour ce lot

1. **Le bundle `MeeshyTests` est compilé en isolation `nonisolated`.** Tout
   symbole `@MainActor` appelé depuis un test synchrone exige `@MainActor` sur la
   méthode de test. `StoryComposerViewModel` est un `ObservableObject` du SDK :
   les tests de T1 vivent dans `MeeshyUITests` (SPM) et doivent déclarer leur
   isolation explicitement.
2. **Isolation MainActor par défaut (Swift 6.2)** sur la cible app : tout modèle
   pur neuf est `nonisolated` — `ComposerOpening` l'est déjà, le cas ajouté en
   hérite.
3. **Pas de `@ViewBuilder` + `if #available` imbriqué** dans la rangée de T5 ni
   dans l'entrée de T6 : débordement de pile par PROFONDEUR DE TYPE, invisible au
   simulateur (pile 8 Mo) et fatal à l'appareil (1008 Ko).
4. **Ne jamais écrire, dans un commentaire de ce dépôt, la séquence de glob que
   `MeeshyComposerHost.swift:255` nomme** : le dépouilleur de
   `MyStoriesSourceCorpus` l'a déjà lue comme une ouverture de commentaire de bloc
   et a jeté 738 lignes, aveuglant toutes les gardes de source du fichier — une
   seule avait rougi.
5. **Les gardes NÉGATIVES de ce lot** (T1-5 « aucun `isLocked: true` », T6-1
   « pas de `MeeshyComposerHost(` ») se lisent sur la source **décommentée**
   (`AppSourceGuard.stripComments`) et sont doublées d'un garde-fou exigeant une
   source non vide. On reformule une garde ; on ne la supprime jamais.
6. **Un `cd` qui échoue fait tourner la suite dans l'arbre PRINCIPAL.** Toujours
   `cd /Users/smpceo/Documents/v2_meeshy-composer && …`, jamais un `cd` isolé.
7. **L'arbre est partagé et SALE.** `git commit -- <chemins>` uniquement ; jamais
   `git add -A`, jamais `--amend`, jamais `stash`. Relire `git status --short`
   avant chaque commit.

---

## 11. Ce que ce plan n'a PAS vérifié

- **`StoryPublishQueue`** n'a pas été ouvert : le comportement HORS LIGNE de la
  porte `.conversationMedia` n'est pas caractérisé. Ne rien promettre à ce sujet.
- **`MediaService.duplicate`** (gateway) n'a pas été ouvert : le coût réel de la
  duplication — donc l'économie que le pont revendique — reste **affirmé par ses
  commentaires, pas mesuré**.
- **Les deux plans de forward existants** (`2026-08-19-forward-reach.md`,
  `2026-08-19-media-forward-reliability-and-more-menu.md`) n'ont pas été lus.
  S'ils portent des cases non cochées recoupant ce lot, elles ne sont pas ici.
- **Le coût du décodage d'image dans la porte** (T4, étape 2) n'a pas été mesuré.
  La forme retenue le place hors du main actor, ce qui suffit à ne pas geler la
  présentation ; le dimensionnement du bitmap (le composer descend ses captures à
  1080 px) reste à décider **à la mesure**, pas à l'estime.
- **Aucun build, aucun test n'a été lancé** pour écrire ce plan.
