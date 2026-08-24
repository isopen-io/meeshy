# Lot 5 — Média reçu et forward (O13) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un média reçu en conversation devient publiable de DEUX façons, et les deux
disent la vérité : **tel quel avec un mot** (le pont serveur, déjà livré — il lui manque
ses gardes, son offre juste et son champ de saisie iOS), ou **composé** (la porte
`.conversationMedia`, définie depuis trois lots et branchée sur RIEN). Le lot referme les
trous du premier chemin, puis ouvre le second.

**Architecture:** Trois couches, dans cet ordre. (1) `packages/shared` +
`services/gateway` : le pont `MessageAttachment`→`PostMedia` gagne ses gardes (`isViewOnce`,
`isEncrypted`) et cesse d'affirmer ce qu'il ne fait pas (`capturedInApp`) ; la règle d'offre
partagée obéit enfin à la loi 4 (`qualifiesAsReel`, donc la DURÉE). (2) `ForwardPickerSheet`
gagne le mot à écrire — parité avec le web, qui l'envoie déjà. (3) La porte
`.conversationMedia` reçoit ce qui lui manque pour exister : une **graine** publique côté
SDK (miroir de `StoryComposerViewModel(reposting:)`), un canal de graine sur
`MeeshyComposerHost`, une action de message qui l'ouvre, et la matérialisation locale par
`MediaSaveSourceResolving` — le mécanisme que la spec v1 avait nommé pour O13 et que
personne n'a jamais branché.

**Tech Stack:** TypeScript strict + Vitest (`packages/shared`), Jest (`services/gateway`,
`apps/web`), Swift Testing (`MeeshySDK-Package`), XCTest (`apps/ios`), scheme app + scheme
`MeeshySDK-Package`.

**Spec:** `docs/superpowers/specs/2026-08-23-meeshy-composer-v2-design.md` (§E lot 5, lois 4
et 6, table des portes §C, « Hors v2 » §G) et le contrat gelé
`docs/superpowers/specs/2026-08-20-meeshy-composer-execution-spec.md` (**ligne O13**, qui
reste la définition opposable de ce lot — voir §2 ci-dessous).

---

## 1. État des lieux MESURÉ (2026-08-24, worktree `v2_meeshy-composer`, HEAD `fb7afd471`)

> **Avertissement de fraîcheur — PÉRIMÉ, remplacé par l'audit du 2026-08-24 (HEAD `d4a40f600`).**
> La rédaction initiale décrivait un arbre SALE et deux workflows « en vol ». **Les deux ont MERGÉ** :
> lot 3 = `96b707da6`, lot 0 bis = `d4a40f600` (27 fichiers). `git status` ne montre plus que des `.md`
> sous `docs/`. Trois conséquences pour ce plan :
>
> 1. **Les préconditions de 5.5 et 5.6 sont LEVÉES.** Le tableau du §5 les déclare « bloquantes sur le
>    lot 3 » : elles ne le sont plus. Ce lot rebase sur `d4a40f600` et démarre.
> 2. **Les ancres de `Composer/` sont désormais STABLES et mesurables** — et différentes de celles citées
>    ici. À `d4a40f600` : `ComposerIntent.swift` **372 l.**, la porte `.conversationMedia`
>    `case` `:33` et son profil `:307-324` (`routesToLegacy: nil` `:324`) ;
>    `MeeshyComposerHost.swift` **578 l.**, `init` `:186-209`, `chromeOwner = .atelier` **`:269`**,
>    `ComposerFormatFan` **`:437`**. Aucun numéro de ce plan ne doit être recopié sans être revérifié.
> 3. **Une collision non déclarée existe avec le lot 4** — voir §5, ligne « Lot 4 », corrigée.

### 1.1 Ce que le §E lot 5 dit, et qui est FAUX

> « Le pont serveur `MessageAttachment`→`PostMedia` remplace le re-upload local de v1. »

Cette phrase est fausse **deux fois**, et les deux erreurs comptent pour l'exécution.

**(a) Le pont EXISTE, complet, depuis le 2026-08-23.** Ouvert et lu :
`services/gateway/src/services/posts/publishAttachment.ts` (135 l. : `planAttachmentPublication`
:72, `postMediaFieldsFromAttachment` :109, `DEFAULT_PUBLICATION_VISIBILITY` :135),
la route `POST /posts/from-attachment` (`services/gateway/src/routes/posts/core.ts:205-289`,
contrôle d'appartenance par `canAccessConversation` :230-239, duplication
`MediaService.duplicate` :261-264, `prisma.postMedia.create` :266, `postService.createPost`
:275), le schéma `PublishAttachmentSchema` (`routes/posts/types.ts:556-562`), le client SDK
(`PostService.swift:558-574`, requête `PublishAttachmentRequest`, `StoryModels.swift:2636-2655`),
la modale web (`apps/web/components/conversations/forward-message-modal.tsx:429-460`) et la
feuille iOS (`ForwardPickerSheet.swift:284-475`). Commits : `d1cfffe59` (gateway + shared +
web) puis `9b687a056` (SDK + iOS, « le troisième client » = **iOS**, pas Android —
`grep -rn "publishAttachment\|from-attachment" apps/android` rend **rien**, vérifié).

**(b) Le « re-upload local de v1 » n'a JAMAIS existé.** C'était la mission du **lot G** de la
spec gelée (`2026-08-20-…-execution-spec.md:82`, ligne O13, avec la mention « Plan détaillé À
ÉCRIRE au lancement »). `ls docs/superpowers/plans/ | grep -i lot-g` rend **rien** : le plan
n'a jamais été écrit, le lot jamais exécuté. Preuve de code : `MessageActionResolver.MoreItem`
(`apps/ios/.../MessageActionResolver.swift:11-21`) énumère `reply, forward, thread, media, pin,
unpin, star, unstar, delete, edit, copy, share, language, views, reactions, transcription,
sentiment, history, report` — **aucune** action « Créer un post ». Et
`AttachmentMediaSaveResolver` (`MediaSaveCoordinator.swift:271-299`), que O13 désignait comme la
brique de matérialisation, n'a qu'un consommateur : `MediaSaveCoordinator.init(resolver:)` :111,
c'est-à-dire le flux « Enregistrer dans Photos ».

**Conséquence pour ce plan : le lot 5 ne REMPLACE rien et n'a RIEN à retirer.** Les deux
mécanismes ne sont pas concurrents, ils servent deux gestes différents — et c'est le seul
arbitrage structurant de ce lot :

| Geste | Chemin | Canevas ? | Octets transférés | État |
|---|---|---|---|---|
| « publie ça, avec un mot » | `POST /posts/from-attachment` | **non** | zéro | **livré**, gardes manquantes |
| « je compose par-dessus » | porte `.conversationMedia` → meuble | **oui** | matérialisation locale + TUS | **rien n'existe** |

Le pont ne peut PAS servir le second : `postMediaFieldsFromAttachment` produit un `PostMedia`
et rien d'autre — il n'a aucun canal pour un `storyEffects`. Le composer ne peut PAS servir le
premier sans payer les octets. Les deux restent.

### 1.2 La porte `.conversationMedia` — définie, testée, branchée sur rien

- **Elle existe** : `ComposerOrigin.conversationMedia(messageId:attachmentId:)`
  (`ComposerIntent.swift:33`, identique à HEAD).
- **Son profil est écrit** (`:298-316` arbre de travail / `:260` à HEAD) :
  `initialFormat: .story`, `offeredFormats: plusReel([.story, .post])`,
  `opensWith: .keyboardOnContent`, `allowsCapture: true`, `routesToLegacy: nil`.
  Le commentaire `:300` dit encore « Profil DÉFINI, câblage **lot G** » — **exact**, et
  à corriger en « lot 5 » par ce plan.
- **Elle monte la SCÈNE, pas le document** : `ComposerSurfaceRouting.surface(.keyboardOnContent, .story)`
  → `.scene` (`ComposerDocumentSurface.swift:53-60`), et `ComposerDocumentSurfaceTests.swift:229-232`
  l'épingle. **C'est une bonne nouvelle** : la branche scène monte l'atelier du SDK, donc la
  barre de publication existe (`MeeshyComposerHost.swift:230` — `chromeOwner = .atelier`, le socle
  n'est pas peint). Contrairement au mood du lot 4, cette porte n'a AUCUN problème de publieur.
- **Elle n'a AUCUN appelant.** `grep -rn "ComposerIntent(" --include="*.swift" apps packages`
  hors tests rend **une seule ligne de production** : `StoryTrayActions.swift:192`, avec
  `.storyTray`. Idem pour le meuble : `MeeshyComposerHost(` n'a qu'un montage,
  `StoryTrayActions.swift:191`.
- **Le meuble n'a AUCUN canal de graine.** Lu ligne à ligne :
  `MeeshyComposerHost.init` (`:185-209`) prend `intent`, `initialVisibility`, `draftId` et trois
  fermetures. Aucun média, aucune URL, aucun identifiant de pièce jointe. Le seul peuplement
  est `composer.adoptDraft(id:)` (:202), qui reprend un BROUILLON.
- **Le SDK n'a aucun écrivain de média public.** Vérifié : `grep "public func"` sur les six
  fichiers `StoryComposerViewModel*.swift` rend **9 méthodes**, aucune ne pose de média
  (`adoptDraft`, `detachFromAdoptedDraft`, `adoptDeclaredReferences`, `exportableCurrentSlide`,
  + 5 méthodes de timeline). `posePastedItems` (`StoryComposerView+Canvas.swift:594`),
  `addCapturedMedia` (`StoryComposerView+Media.swift:474`) et `addRecordingToBackground`
  (`:670`) sont **internal à `MeeshyUI`** et vivent sur la VUE, pas sur le ViewModel : l'app
  ne peut pas les appeler.
- **MAIS le précédent existe, et il est public** :
  `StoryComposerViewModel.init(reposting: StoryItem, authorHandle: String)`
  (`StoryComposerViewModel+Repost.swift:30`) est une `public convenience init` qui construit un
  `StorySlide` peuplé (`:46-55`) et le pose (`self.slides = [cloned]`, :89). Et
  `StoryComposerView.init(viewModel:…)` (`StoryComposerView.swift:337`) accepte un ViewModel
  pré-construit. **C'est le gabarit exact de la graine du lot 5** — pas une invention.

### 1.3 La feuille de forward — la loi 6 tenue à MOITIÉ, par un chemin qui contourne le meuble

`ForwardPickerSheet.swift` (760 l., **un seul montage** : `ConversationView.swift:864`, gardé par
`msg.isForwardable`, trois déclencheurs — `:967` overlay, `:1612` swipe,
`ConversationView+MessageRow.swift:326`) offre DÉJÀ une section « Publier »
(`publicationSection` :298-353, posée en `safeAreaInset(.bottom)` :125-134 avec le commentaire
« Transférer à quelqu'un et PUBLIER sont deux gestes voisins et un seul point de départ »).
Elle appelle `postService.publishAttachment` (:448-453) — le PONT, pas le meuble.

**Quatre écarts mesurés**, tous à corriger par ce lot :

1. **Jamais trois destinations, deux au maximum.** `publicationTargetsFor`
   (`packages/shared/utils/forward-to-publication.ts:54`) rend `[fallback, 'STORY']` ; miroir
   Swift `PublicationTargetRule.targets(forMimeType:)` (`PublicationTarget.swift:52-55`),
   identique. Image → `[POST, STORY]` ; vidéo/audio → `[REEL, STORY]` ; document → `[]`.
   « Mon fil » et « mes réels » **s'excluent par construction**. La loi 6 en demande trois.
2. **Loi 4 violée : REEL offert sans lire la DURÉE.** `defaultPublicationTargetFor` (:37)
   rend `REEL` pour tout `video/*`/`audio/*`. Or `qualifiesAsReel`
   (`packages/shared/utils/reel-composition.ts:30-38`) exige ≥ `MIN_QUALIFYING_DURATION_MS`
   = 3000 ms. **Conséquence chaînée et vérifiée** : `PostService.createPost` DÉGRADE
   silencieusement un REEL non qualifiant en POST (`PostService.ts:253-276`, `effectiveType =
   PostType.POST` :269, journalisé, jamais renvoyé au client). Taper « Nouveau réel » sur une
   vidéo d'1 s produit donc un POST, sans un mot. La durée est disponible des deux côtés :
   `MessageAttachment.duration` est en **MILLISECONDES** (`schema.prisma:901`, vérifié), la route
   la SÉLECTIONNE (`core.ts:224-225`), `PostMedia.duration` est aussi en ms (vérifié — pas de
   conversion d'unité cachée), et le modèle client la porte (`MeeshyMessageAttachment.duration:
   Int?`, `CoreModels.swift`). Le prédicat Swift public existe :
   `ReelComposition.qualifiesAsReel(mimeTypes:durationsMs:)` (`FeedModels.swift:904`).
3. **iOS n'a pas le mot à écrire.** `performPublish` envoie `content: nil` (:451) et la feuille
   ne contient **aucun** `TextField` (0 occurrence sur 760 l., vérifié). Le web, lui, envoie
   `content: noteRef.current.trim() || undefined` (`forward-message-modal.tsx:436`). C'est
   précisément ce que le profil `.conversationMedia` promet en ouvrant sur `.keyboardOnContent`
   (« il ne reste que le mot à écrire »).
4. **Zéro couverture iOS.** `grep -rn "publishAttachment" apps/ios/MeeshyTests` → **rien** ;
   `grep -rn "PublicationTarget" apps/ios/MeeshyTests` → **rien**. Les 227 lignes ajoutées à
   la feuille par `9b687a056` ne sont testées nulle part côté app. (Deux gardes de source
   existent sur ce fichier et lisent son CHEMIN — `ForwardPickerSpokenNameTests.swift:79`,
   `ForwardPickerSuccessToastGuardTests.swift:30` — elles ne mesurent pas la publication.)

### 1.4 Les trous du pont serveur — trois gardes absentes, une divergence produit, une idempotence manquante

Tous **vérifiés par lecture directe**, pas par sonde :

| # | Trou | Preuve |
|---|---|---|
| T1 | **`isViewOnce` n'est vérifié NULLE PART côté serveur** | `grep -n "isViewOnce" services/gateway/src/routes/posts/core.ts services/gateway/src/services/posts/publishAttachment.ts` → **0 occurrence**. Le champ existe (`schema.prisma:881`) mais n'est pas dans le `select` de la route (`core.ts:222-228`) — piège mémoire connu : *un champ vérifié DOIT figurer dans le `select` Prisma*. La garde O13 « `!isViewOnce` » n'est tenue que **côté client**, par `Message.isForwardable` (`apps/ios/.../Models/Message.swift:25` : `!isViewOnce`) qui masque `.forward` (`MessageActionResolver.swift:92`) et donc la feuille entière. Un appel direct au pont contourne la règle produit. |
| T2 | **`isEncrypted` non plus** | Même grep, **0 occurrence**. `MessageAttachment.isEncrypted` existe (`schema.prisma:1009`). La spec gelée O13 dit pourtant : « `isEncrypted` passe par le SEUL chemin re-upload local (le blob serveur est chiffré) ». Le pont duplique donc du chiffré dans un `PostMedia` destiné à un fil PUBLIC — **illisible par construction**. Le drapeau est disponible côté client aussi (`MeeshyMessageAttachment.isEncrypted: Bool = false`, vérifié). |
| T3 | **`capturedInApp` est accepté et JAMAIS lu** | `grep -n "capturedInApp" services/gateway/src/routes/posts/core.ts` → **0**. Le champ est pourtant dans le Zod (`types.ts:561`) et **DEUX commentaires affirment qu'il sert** : `types.ts:550-554` (« il l'enregistre dans le journal de mutation ») et `PostService.swift:568-570` (« Omis quand faux : le serveur applique le même défaut »). `PostMedia` n'a aucune colonne pour l'accueillir. **C'est le motif que le dépôt a déjà payé deux fois** : un commentaire qui énonce un invariant plus large que ce que le code tient devient la loi lue par la session suivante. |
| T4 | **Divergence de visibilité** | Le pont pose `visibility: parsed.data.visibility ?? 'PUBLIC'` pour **tous** les types (`core.ts:278`, `DEFAULT_PUBLICATION_VISIBILITY = 'PUBLIC'`), là où `POST /posts` retombe sur `FRIENDS` pour une STORY (`core.ts:330`, vérifié : `parsed.data.visibility ?? (parsed.data.type === 'STORY' ? 'FRIENDS' : 'PUBLIC')`). Ni le SDK (`PublishAttachmentRequest` : 4 champs, **pas de `visibility`**) ni la modale web n'envoient ce champ. Une story née du partage naît donc **PUBLIQUE**, alors que la même story née du composer naît entre amis. |
| T5 | **Pas d'idempotence** | `POST /posts` est enveloppé par `withMutationLog(kind: 'createPost')` (`core.ts:321-336`) ; `POST /posts/from-attachment` appelle `postService.createPost` **en direct** (:275). Un retry réseau publie deux fois. *Ce trou n'est PAS de ce lot* — voir §6. |

Ce qui **est** correct et ne change pas : la duplication des octets plutôt qu'un partage de
chemin (raison écrite `publishAttachment.ts:9-21` — `reclaimMediaRowBytes` n'interroge que la
table `Sound`, un `PostMedia` pointant sur le fichier d'un `MessageAttachment` ferait
disparaître la photo SOUS la conversation ; c'est le motif qui a déjà détruit des avatars) ;
l'appartenance vérifiée AVANT le type (:81-88) ; le refus d'une pièce jointe orpheline ;
l'expiration posée par `ephemeralExpiresAt(type)` (`PostService.ts:154`) ; et le refus des
lieux, tenu **gratuitement** par le mime (`application/x-location` → `AttachmentKind.other` →
`defaultPublicationTargetFor` → `null` → `unpublishable-media`) — vérifié, la garde O13
« jamais `.location` » est déjà honorée.

---

## 2. Les lois produit que ce lot câble

**Loi 6 — « La fiche de forward est le "où va ceci ?" universel »** (design v2 §B) :
« ma story · mon fil · mes réels », et **« ce n'est pas une dixième porte : c'est un second
point d'entrée de `.conversationMedia` — même graine, même éventail »**. La table §C confirme :
`conversationMedia` et `forward(média)` ouvrent tous deux sur **story**, éventail
`story · post · réel*`. Le lot les traite comme **une** porte à deux déclencheurs.

**Loi 4 — « La porte déclare un éventail, pas un format »**, doublée de la loi 4 de la
doctrine (« Rien à l'écran sans raison ») : **un format non offert est ABSENT, jamais grisé.**
`qualifiesAsReel` est la source unique, déjà partagée. C'est cette loi qui borne la loi 6 :
trois destinations quand le média qualifie, deux sinon — et **jamais** une pilule « Nouveau
réel » que le serveur dégradera en silence.

**Loi 3 — « On n'écrit que ce qu'on sait complet »** : le corollaire, sur un lot qui touche
des commentaires de protocole, est que **le code ne doit pas affirmer plus que ce qu'il tient**
(T3 ci-dessus).

**O13 (contrat GELÉ, `execution-spec.md:82`) — c'est lui qui définit ce lot, pas le §E** :
appui long sur un média REÇU → composer préconfiguré, média posé, **2 gestes** ; gardes
`!isViewOnce` et jamais `.location` ; `isEncrypted` hors du pont ; et — clause à ne pas
perdre — **« AUCUNE référence automatique vers l'expéditeur : un média reçu en privé n'est pas
une publication ; l'attribuer d'office exposerait la relation privée »**. Le repost pose une
mention SILENT parce que sa source est PUBLIQUE ; ici, mention manuelle seulement.

---

## 3. Global Constraints

- **Fichiers POSSÉDÉS par ce lot** :
  `packages/shared/utils/forward-to-publication.ts` (+ son test) ·
  `services/gateway/src/services/posts/publishAttachment.ts` ·
  `services/gateway/src/routes/posts/core.ts` (**bloc `/posts/from-attachment` UNIQUEMENT**, l. 195-289) ·
  `services/gateway/src/routes/posts/types.ts` (**bloc `PublishAttachmentSchema` uniquement**) ·
  `packages/MeeshySDK/Sources/MeeshySDK/Models/PublicationTarget.swift` ·
  `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` (**la seule méthode `publishAttachment`**) ·
  `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Seed.swift` (NOUVEAU) ·
  `apps/ios/Meeshy/Features/Main/Components/ForwardPickerSheet.swift` ·
  `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift` ·
  `apps/ios/Meeshy/Features/Main/Components/MessageMoreSheet.swift` ·
  `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (**le seul bloc de présentation**) ·
  `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift` (**init + graine uniquement — et APRÈS le lot 4, qui réécrit le même `init` en 4.5 ; voir §5**) ·
  `apps/web/components/conversations/forward-message-modal.tsx` (**l'appel à `publicationTargetsFor` uniquement**) ·
  `apps/ios/Meeshy/Localizable.xcstrings` · les tests nommés par chaque tâche.
- **Fichiers INTERDITS** : `ComposerIntent.swift` **profil `.conversationMedia` mis à part**
  (une ligne de commentaire, tâche 5.6) — le fichier était tenu par le **lot 3**, **MERGÉ `96b707da6`** ; il reste interdit parce que le **lot 4** l'écrit ensuite ;
  `ComposerDocumentSurface.swift` (lot 2/3) ; tout `RepostModal`/`posts.service.ts`/
  `common.json` web (**lot 0 bis**, MERGÉ `d4a40f600` — le web appartient désormais au **lot 6**) ;
  toute surface de composer historique (`StatusComposerView`, `UnifiedPostComposer`,
  `FeedComposerSheet`).
  > **Correction d'audit (2026-08-24) sur l'ATTRIBUTION de ces trois surfaces.** La rédaction initiale
  > écrivait « elles appartiennent aux lots 3, 4 et 6 » : **deux tiers de cette phrase sont faux**, et
  > c'est le motif que le lot 4 nomme lui-même — *un retrait que chacun croit chez l'autre*.
  > Mesuré : `StatusComposerView.swift` appartient bien au **lot 4** (sa tâche 4.8, conditionnelle) ;
  > `UnifiedPostComposer.swift` vit sous `packages/MeeshySDK/Sources/MeeshyUI/Story/` et **n'appartient à
  > AUCUN lot v2** (le lot 4 s'interdit `MeeshyUI`, le lot 7 aussi — voir lot 4 §A.7 bis) ;
  > `FeedComposerSheet` (déclaré `FeedView+Attachments.swift:765`) **n'appartient à aucun lot non plus** —
  > le lot 3 a explicitement laissé ses trois montages debout, et le **lot 6 est WEB : il ne possède aucun
  > fichier iOS**. Le seul énoncé sûr est celui-ci : *ce lot ne touche aucune des trois.*
- **Aucun RETRAIT dans ce lot.** Rien n'est remplacé (§1.1). En particulier, la section
  « Publier » de `ForwardPickerSheet` **reste** : c'est le chemin sans-canevas, et le composer
  ne le rend pas caduc.
- **`grpc-tools` casse `bun install` derrière un proxy** : utiliser `bun install --ignore-scripts`
  (piège documenté, CLAUDE.md).
- **Isolation MainActor par défaut (Swift 6.2)** sur la cible app : tout modèle pur neuf est
  `nonisolated` (`ComposerIntent.swift:12-17` explique pourquoi).
- **Un fichier de test NEUF n'est PAS exécuté par `xcodebuild`** tant qu'il n'est pas dans
  `project.pbxproj` : `xcodegen generate` puis **greffer le delta pbxproj** contre `origin/main`
  (jamais committer un pbxproj régénéré en entier — il emporte le WIP des voisins).
- **DerivedData privée** pour tout gate long (`/tmp/meeshy-dd-lot-5-*`), et attendre le lock
  `xcodebuild` voisin : deux workflows tournent sur ce worktree.

---

## 4. Les tâches

### Task 5.1 — Le pont refuse ce qu'il ne doit pas ouvrir (T1, T2) + il cesse de mentir (T3)

**Files:**
- Modify: `services/gateway/src/services/posts/publishAttachment.ts`
- Modify: `services/gateway/src/routes/posts/core.ts` (bloc `/posts/from-attachment`, `select` + refus)
- Modify: `services/gateway/src/routes/posts/types.ts` (le commentaire de `capturedInApp`)
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` (le commentaire :568-570)
- Test: `services/gateway/src/__tests__/unit/services/posts/publishAttachment.test.ts` (existant, 170 l.)

- [ ] **Step 1: Tests ROUGES (Jest).** Étendre `PublishableAttachment` de `isViewOnce: boolean`
  et `isEncrypted: boolean` dans le `makeAttachment` du fichier, puis :
  1. `planAttachmentPublication` sur une pièce jointe `isViewOnce: true` rend
     `{ ok: false, reason: 'view-once-media' }` — **et le refus est évalué APRÈS
     l'appartenance** (un non-membre reçoit `forbidden`, jamais un verdict qui lui confirmerait
     la nature du média : c'est la règle déjà écrite l. 81-88, à ne pas défaire) ;
  2. une pièce jointe `isEncrypted: true` rend `{ ok: false, reason: 'encrypted-media' }` — la
     raison est écrite dans le test AVEC son motif : *les octets dupliqués resteraient chiffrés
     dans un `PostMedia` public, donc illisibles ; publier serait produire un post cassé* ;
  3. `isViewOnce` prime sur `isEncrypted` si les deux sont vrais (ordre déterministe, sinon deux
     runs peuvent rendre deux codes) ;
  4. les cas existants restent verts avec les deux drapeaux à `false`.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter.**
  - `PublishRefusal` gagne `'view-once-media' | 'encrypted-media'` ; `planAttachmentPublication`
    les rend, dans l'ordre appartenance → viewOnce → encrypted → type.
  - `core.ts` : **ajouter `isViewOnce: true, isEncrypted: true` au `select`** (l. 222-228) —
    sans quoi Prisma ne les rend pas et la garde lirait `undefined`, donc *faux*, donc rien ;
    mapper les deux refus sur `sendBadRequest` avec les codes `VIEW_ONCE_MEDIA` et
    `ENCRYPTED_MEDIA`.
  - **`capturedInApp` cesse de mentir** — trancher, et une seule des deux branches :
    **(A)** le retirer du Zod et des deux clients (le serveur n'en fait rien, un champ accepté
    et jamais lu est une promesse), ou **(B)** l'honorer réellement en le passant à
    `withMutationLog`. **Décision de ce plan : (A)**, parce que (B) suppose l'idempotence du
    pont, qui n'existe pas (T5) et appartient au lot 7. Les deux commentaires
    (`types.ts:550-554`, `PostService.swift:568-570`) sont réécrits pour dire ce que le code
    fait — **la confirmation de capture reste, elle est CLIENT** (`publicationNeedsCaptureConfirmation`,
    `forward-to-publication.ts:79`, inchangée).
    > Si le porteur produit refuse (A), le plan bascule sur (B) **et** T5 remonte dans ce lot :
    > ne pas laisser un troisième état où le champ voyage sans destination.
- [ ] **Step 4: Vert.** `cd services/gateway && bun run test:coverage`.
- [ ] **Step 5: Commit.**

**DoD:** un `curl` direct sur `/posts/from-attachment` avec l'id d'une pièce jointe vue-unique
rend 400 `VIEW_ONCE_MEDIA` ; avec une pièce jointe chiffrée, 400 `ENCRYPTED_MEDIA` ; aucun
commentaire du dépôt n'affirme plus que `capturedInApp` est journalisé.

---

### Task 5.2 — L'offre obéit à la loi 4 : la DURÉE décide, et les trois destinations apparaissent

**Files:**
- Modify: `packages/shared/utils/forward-to-publication.ts`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/PublicationTarget.swift` (le miroir)
- Modify: `apps/ios/.../ForwardPickerSheet.swift` (`publicationTargets`, :292-295)
- Modify: `apps/web/components/conversations/forward-message-modal.tsx` (:425, l'appel seul)
- Test: `packages/shared/__tests__/forward-to-publication.test.ts` (existant, 79 l.)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/PublicationTargetTests.swift` (existant, 105 l.)

- [ ] **Step 1: Tests ROUGES (Vitest + Swift Testing), MÊMES cas des deux côtés.** La règle
  gagne un second argument, `durationMs: number | null | undefined` :
  1. image seule → `['POST', 'STORY']` (2) — `qualifiesAsReel([image])` est faux, le réel est
     **ABSENT, pas grisé** ;
  2. vidéo **≥ 3000 ms** → `['POST', 'REEL', 'STORY']` (**3** — c'est ici, et seulement ici,
     que la loi 6 tient ses trois destinations) ;
  3. vidéo **< 3000 ms** → `['POST', 'STORY']` — **le cas qui rougit aujourd'hui**, et le test
     nomme sa raison : *sans lui, taper « Nouveau réel » produit un POST par dégradation
     silencieuse du gateway (`PostService.ts:269`), sans un mot à l'utilisateur* ;
  4. vidéo de durée **inconnue** (`null`/`undefined`) → `['POST', 'STORY']` (jamais un repli
     permissif — c'est la règle explicite de `reel-composition.ts:8-12`) ;
  5. audio ≥ 3 s → `['POST', 'REEL', 'STORY']`, audio < 3 s → `['POST', 'STORY']` ;
  6. PDF / document / `application/x-location` → `[]` (section non montée du tout) ;
  7. `defaultPublicationTargetFor` inchangé pour l'ancre serveur (une vidéo reste `REEL` par
     défaut si elle qualifie, `POST` sinon) — et le test du gateway 5.1 le confirme.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter.**
  - TS : `publicationTargetsFor(mimeType, durationMs)` s'appuie sur `qualifiesAsReel([{ mimeType,
    duration: durationMs }])` de `reel-composition.ts` — **jamais une seconde règle de mime**,
    la loi 4 en nomme une seule ; l'ordre servi est `POST · REEL · STORY` (fil, réels, story),
    celui de la loi 6.
  - Swift : `PublicationTargetRule.targets(forMimeType:durationMs:)` s'appuie sur
    `ReelComposition.qualifiesAsReel(mimeTypes:durationsMs:)` (`FeedModels.swift:904`, public).
    Le doc-comment de `PublicationTarget.swift:1-24` — qui dit aujourd'hui « une vidéo ou un son
    deviennent un REEL » — est réécrit AVEC la condition de durée, sans quoi il redevient la loi
    lue par la session suivante.
  - Les deux appelants passent `attachment.duration` (ms des deux côtés — vérifié
    `schema.prisma:901`).
- [ ] **Step 4: Vert.** `cd packages/shared && bun run test` · scheme `MeeshySDK-Package` ·
  `cd apps/web && TZ=UTC bun run test`.
- [ ] **Step 5: Commit.**

**DoD:** aucune pilule « Nouveau réel » ne s'affiche pour un média que le serveur dégraderait ;
une vidéo de 10 s montre bien **trois** pilules sur les deux clients.

---

### Task 5.3 — Le mot à écrire, sur iOS (parité web) + la story ne naît plus publique par accident (T4)

**Files:**
- Modify: `apps/ios/.../ForwardPickerSheet.swift` (`publicationSection`, `performPublish`)
- Modify: `services/gateway/src/services/posts/publishAttachment.ts` (`DEFAULT_PUBLICATION_VISIBILITY`)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings`
- Test: `apps/ios/MeeshyTests/Unit/Components/ForwardPickerPublicationTests.swift` (**NOUVEAU** — première couverture app de la section « Publier »)
- Test: `services/gateway/src/__tests__/unit/services/posts/publishAttachment.test.ts`

- [ ] **Step 1: Tests ROUGES.**
  *Gateway (Jest)* : la visibilité par défaut d'une publication née d'un partage **dépend du
  type**, exactement comme `POST /posts` (`core.ts:330`) — `STORY` → `FRIENDS`, tout le reste →
  `PUBLIC`. Le test nomme le défaut : *une story partagée depuis une conversation naissait
  PUBLIQUE alors que la même story née du composer naît entre amis ; deux portes pour un même
  contenu ne peuvent pas avoir deux audiences par défaut.*
  *iOS (XCTest, garde de source — la feuille est une `View` non montable en test unitaire ici)* :
  1. `ForwardPickerSheet.swift` contient un `TextField` **dans** `publicationSection` ;
  2. `performPublish` passe `content:` avec la note saisie, **jamais `content: nil`**
     (assertion NÉGATIVE sur le littéral `content: nil`, sur la source **décommentée** via
     `AppSourceGuard.stripComments` — sinon un doc-comment la fait passer au vert) ;
  3. garde-fou de la garde : la source lue est non vide et contient
     `struct ForwardPickerSheet` (sans lui, un chemin devenu faux rendrait les deux
     assertions vertes sur une chaîne vide — motif *« les gardes négatives meurent en silence »*) ;
  4. les cinq libellés de publication et la clé de la note sont présents dans les **7 locales**
     du catalogue (`ar, de, en, es, fr, it, pt-BR` — vérifié : les 7 clés `forward.publish-*`
     existantes les ont toutes).
- [ ] **Step 2: Rouge.** ⚠️ Fichier de test NEUF ⇒ `xcodegen generate`, puis greffer le **delta**
  pbxproj. Sans ce pas, la suite compile, ne s'exécute pas, et le lot croit être vert.
- [ ] **Step 3: Implémenter.** Un `TextField` d'une ligne au-dessus des pilules, plafonné comme
  le Zod (`content: z.string().max(5000)`), `content: note.trimmed().isEmpty ? nil : note`
  (jamais `""` : la loi 3 — on n'écrit pas une valeur qu'on ne veut pas dire) ; côté serveur,
  `DEFAULT_PUBLICATION_VISIBILITY` devient une **fonction du type**.
  **Aucune référence automatique n'est posée** (clause O13) : la note est du texte, les
  mentions restent manuelles.
- [ ] **Step 4: Vert.** `./apps/ios/meeshy.sh test` + gateway.
- [ ] **Step 5: Commit.**

**DoD:** publier une image reçue en y ajoutant « regarde ça » produit un post dont le contenu
est « regarde ça » ; publier en story depuis la feuille produit une story **FRIENDS**.

---

### Task 5.4 — La graine, côté SDK : `StoryComposerViewModel(seeding:)`

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerViewModel+Seed.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Story/StoryComposerSeedTests.swift` (**NOUVEAU**)

**Interfaces** (gelées pour 5.5) :

```swift
/// Ce qu'une porte pose dans le composer avant qu'il ne s'ouvre. Opaque :
/// le SDK ne sait pas d'où ça vient, et c'est la condition de sa pureté.
public nonisolated struct StoryComposerSeed: Equatable, Sendable {
    public enum Payload: Equatable, Sendable { case image(URL), video(URL), audio(URL) }
    public let payload: Payload
    public init(payload: Payload)
}

public extension StoryComposerViewModel {
    /// Miroir de `init(reposting:authorHandle:)` : un ViewModel qui s'ouvre
    /// DÉJÀ peuplé. La différence tient en un mot — la graine est un fichier
    /// LOCAL, donc le chemin de publication normal (TUS) l'emporte tel quel,
    /// là où le repost s'appuie sur `repostOfId` côté serveur.
    convenience init(seeding seed: StoryComposerSeed)
}
```

- [ ] **Step 1: Tests ROUGES (Swift Testing).**
  1. `StoryComposerViewModel(seeding: .init(payload: .image(url)))` produit **exactement un
     slide**, `currentSlideIndex == 0`, et ce slide porte le média ;
  2. le ViewModel graine n'a **ni `repostOfId` ni `originalRepostOfId`** — une graine n'est pas
     une republication, et un `repostOfId` fabriqué ferait naître une attribution mensongère
     (le média vient d'un message PRIVÉ : c'est la clause O13 « aucune référence automatique ») ;
  3. **aucun `StoryTextObject` verrouillé** n'est posé (`isLocked: true` reste l'apanage exclusif
     du badge d'attribution du repost, `StoryComposerViewModel+Repost.swift:63-79` — en poser un
     ici afficherait « Reposté de @… » sur un média reçu en privé) ;
  4. les trois familles (`image`/`video`/`audio`) posent chacune leur objet, et **aucune** ne
     jette : le document n'entre pas dans le type, exactement comme `StoryPastedItem`
     (`StoryCanvasStarterEnvironment.swift:159-163`) l'exclut par construction ;
  5. une URL qui ne pointe sur aucun fichier laisse le ViewModel dans l'état **vierge**
     (`slides` comme un `init()` nu) plutôt que de porter un slide au média mort.
- [ ] **Step 2: Rouge.**
- [ ] **Step 3: Implémenter** — copier la forme de `+Repost.swift` (construction de `StorySlide`,
  `self.slides = [slide]`, `currentSlideIndex = 0`), sans le badge, sans la chaîne d'ids, sans le
  préchargement distant (**la graine est LOCALE : rien à télécharger**).
  **Pureté SDK** : ce fichier ne connaît ni `MessageAttachment`, ni `CacheCoordinator`, ni la
  moindre règle « quand semer ». Il prend une URL et un genre, et pose. L'orchestration reste
  app-side (5.5/5.6) — c'est le test de grain de `packages/MeeshySDK/CLAUDE.md`.
- [ ] **Step 4: Vert** (scheme `MeeshySDK-Package`, DerivedData `/tmp/meeshy-dd-lot-5-sdk`).
- [ ] **Step 5: Commit.**

---

### Task 5.5 — Le meuble accepte une graine

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift` (**`init` seul**)
- Test: `apps/ios/MeeshyTests/Unit/Composer/MeeshyComposerHostSeedTests.swift` (**NOUVEAU**)

- [ ] **Step 1: Tests ROUGES (garde de source + assertion de comportement).**
  1. `MeeshyComposerHost.init` porte un paramètre `seed: StoryComposerSeed?` **avec une valeur
     par défaut `nil`** — sans le défaut, l'unique appelant existant (`StoryTrayActions.swift:191`)
     casse, et un lot qui casse la porte la plus utilisée n'est pas livrable seul ;
  2. `seed` et `draftId` sont **mutuellement exclusifs** : le test exerce les deux ensemble et
     exige que le brouillon adopté l'emporte — ouvrir un brouillon en écrasant son contenu par
     une graine serait la perte silencieuse d'un travail en cours ;
  3. garde de source : `MeeshyComposerHost.swift` construit `StoryComposerViewModel(seeding:)`
     et **ne construit pas un second `StoryComposerViewModel`** (le motif déjà nommé par
     `AppInitWireupTests.swift:255-260` — deux ViewModels font s'autosauvegarder le composer
     sous un id neuf).
- [ ] **Step 2: Rouge.** (Fichier neuf ⇒ `xcodegen generate` + delta pbxproj.)
- [ ] **Step 3: Implémenter** — dans `init`, `let composer = seed.map(StoryComposerViewModel.init(seeding:)) ?? StoryComposerViewModel()`,
  puis `if let draftId { composer.adoptDraft(id: draftId) }` **inchangé** (l'adoption vient
  après, donc elle gagne — c'est ce que le test 2 grave).
- [ ] **Step 4: Vert.** **Step 5: Commit.**

> **Ce que cette tâche NE fait PAS** : elle ne monte aucune seconde présentation du meuble.
> `MeeshyComposerHost` garde son unique appelant jusqu'à 5.6. Le lot reste livrable ici.

---

### Task 5.6 — La porte s'ouvre : « Composer » sur un média reçu (O13, 2 gestes)

**Files:**
- Modify: `apps/ios/.../MessageActionResolver.swift` (`MoreItem`, `moreSections`, `MessageMenuContext`)
- Modify: `apps/ios/.../MessageMoreSheet.swift` (la rangée)
- Modify: `apps/ios/.../ConversationView.swift` (le **seul** bloc de présentation, à côté de `:864`)
- Modify: `apps/ios/.../ForwardPickerSheet.swift` (la section « Publier » gagne l'entrée « Composer » — loi 6 : même graine, même éventail, second déclencheur)
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (7 locales)
- Modify: `apps/ios/.../Composer/ComposerIntent.swift` — **une ligne de commentaire** (`:300` : « câblage lot G » → « câblé au lot 5 »). ⚠️ Fichier tenu par le **lot 3** : rebaser sur son état AVANT de toucher, ne jamais y committer autre chose.
- Test: `apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift` (existant)
- Test: `apps/ios/MeeshyTests/Unit/Composer/ConversationMediaDoorWiringTests.swift` (**NOUVEAU**)

- [ ] **Step 1: Tests ROUGES.**
  *Résolveur (pur, XCTest)* — `MessageMenuContext` gagne `publishableMediaCount: Int` (0 par
  défaut, calculé au point d'usage comme `saveableAttachmentCount` l'est déjà, :44-46) :
  1. `.compose` apparaît **seulement si** `publishableMediaCount == 1` — la première pièce jointe
     décide déjà pour la publication (`ForwardPickerSheet.swift:286-289`), un lot hétérogène
     mentirait sur ce qui partirait ;
  2. `.compose` **n'apparaît jamais** quand `isForwardable == false` (vue unique — même règle
     que `.forward`, `:92`, et c'est la garde O13 `!isViewOnce` côté client) ;
  3. `.compose` n'apparaît pas pour un lieu, un PDF, un document (via `publishableMediaCount == 0`,
     qui dérive de `PublicationTargetRule.targets` — donc **une seule** règle de mime dans l'app) ;
  4. `.compose` n'apparaît pas pour une pièce jointe **chiffrée** (miroir client de 5.1/T2 : ne
     pas offrir un geste que le serveur refusera).
  *Câblage (garde de source, source décommentée)* :
  5. `ConversationMediaDoorWiringTests` balaie `apps/ios/Meeshy/` et exige qu'**au moins un**
     fichier de production construise `ComposerIntent(origin: .conversationMedia(` — c'est
     **la garde que `ComposerDocumentSurfaceTests.swift:217-221` a explicitement laissée au lot
     qui câblerait la porte** (« la garde qui compterait les ORIGINES effectivement construites
     reste à écrire — elle appartient au lot qui câblera réellement la porte ») ;
  6. le montage passe `initialVisibility:` — sinon le SDK retombe sur `PostVisibility.friends`
     **sans un mot** (loi 10, garde `AppInitWireupTests.test_everyCreationComposerPresentation_passesTheMemorisedAudience`,
     :299-313) ; **ajouter le nouveau site à `storyComposerCreationMounts`** (:293-296) fait
     partie du DoD ;
  7. garde-fou : la source balayée compte > 50 fichiers (motif de
     `MeeshyComposerHostGuardTests.swift:100-104`).
- [ ] **Step 2: Rouge.** (Deux fichiers de test neufs ⇒ `xcodegen generate` + delta pbxproj.)
- [ ] **Step 3: Implémenter.**
  - `MoreItem` gagne `.compose`, placé dans la section « faire » **juste après `.forward`** :
    transférer, publier, composer sont le même voisinage de gestes (loi 6).
  - Le tap **matérialise d'abord** : `MediaSaveSourceResolving.resolveLocalFile(for:)` —
    `AttachmentMediaSaveResolver` (`MediaSaveCoordinator.swift:271-299`) cascade déjà
    `file://` direct → cache typé image/vidéo/audio → téléchargement. **C'est le « zéro
    téléchargement dans le cas nominal » que O13 exigeait, et il existe depuis des mois.**
    L'injection passe par le protocole (seam de test), pas par le type concret.
  - Puis présentation : `MeeshyComposerHost(intent: ComposerIntent(origin: .conversationMedia(
    messageId:attachmentId:)), initialVisibility:, seed: .init(payload: …), …)`, avec le même
    câblage de publication que `StoryComposerCover` (`StoryTrayActions.swift:193-215` →
    `StoryViewModel.publishStoryInBackground(targetType:…)`, qui porte **déjà** le format de
    l'éventail).
  - **Échec de matérialisation** = message, jamais un composer vide : ouvrir une scène sans son
    média serait pire que ne rien ouvrir (même doctrine que
    `StoryCanvasStarterEnvironment.swift:174-176`, « une amorce qui ouvre le vide est pire que
    pas d'amorce »).
  - Libellés en **7 locales** — `compose` n'est pas « publier » : la pilule de la feuille dit
    « Ma story / Nouveau post / Nouveau réel » (publication directe), l'entrée du menu dit
    **« Composer »** (on ouvre l'atelier).
- [ ] **Step 4: Vert.** `./apps/ios/meeshy.sh test`.
- [ ] **Step 5: Commit.**

**DoD:** appui long sur une photo reçue → « Composer » → l'atelier s'ouvre avec la photo posée,
clavier levé sur le contenu, éventail `story · post` (+ `réel` si la composition qualifie) —
**deux gestes**, comme O13 l'écrit. Et `ConversationMediaDoorWiringTests` rougirait si le
montage disparaissait.

---

### Task 5.7 — Gate final + tableau de bord

- [ ] `cd packages/shared && bun run build && bun run test`
- [ ] `cd services/gateway && bun run test:coverage` — suites complètes vertes
- [ ] `cd apps/web && TZ=UTC bun run test` — suites complètes vertes
- [ ] Scheme `MeeshySDK-Package` COMPLET (DerivedData `/tmp/meeshy-dd-lot-5-sdk`)
- [ ] `./apps/ios/meeshy.sh test` — chiffres RÉELS consignés au commit (nombre de suites,
      nombre de tests), pas « ça passe »
- [ ] **Planches P0** (`docs/superpowers/specs/2026-08-19-meeshy-composer-views.html`) :
      camembert ET matrice mis à jour **dans le MÊME commit que ce gate** — la règle de
      maintenance héritée (design v2 §A bis) fait d'un P0 périmé un défaut bloquant.
      *État REMESURÉ par l'audit du 2026-08-24, et il invalide la ligne précédente de ce plan :
      la planche porte **rév. 22 (2026-08-24)** (posée par le lot 3), pas la rév. 18, et elle est
      **modifiée NON COMMITTÉE** dans l'arbre. Surtout, elle **se contredit elle-même** — l'arc et le
      centre disent `62 / 70` (l. 278-281) quand la puce verte dit « Fait & testé — **57 tâches
      (81,4 %)** » (l. 287), et les notes de révision se contredisent aussi (rév. 17 « INCHANGÉ :
      57/70 » contre rév. 22 « INCHANGÉ à 62/70 »). Ni 57/70 ni 50/65 ne peuvent donc être repris
      tels quels : les réconcilier, ou dire laquelle fait foi, dans le commit du gate. Relire la
      dernière révision AVANT d'écrire — la ligne la plus RÉCENTE fait foi (règle du lot D).*
- [ ] **Ordre de merge** : après le lot 3 et le lot 0 bis (voir §5), avant le lot 7.

---

## 5. L'ordre contraint, et pourquoi

```
5.1 ─┐
5.2 ─┼─► indépendants entre eux, livrables seuls, aucun n'ouvre la porte
5.3 ─┘   (5.3 dépend de 5.1 : les deux touchent publishAttachment.ts/.test.ts)

5.4 ──► 5.5 ──► 5.6 ──► 5.7
```

- **5.1 avant 5.3** : même fichier, même suite de tests. Les faire en parallèle produit un
  conflit sur `makeAttachment`.
- **5.2 avant 5.6** : l'entrée « Composer » du menu se gate sur `PublicationTargetRule.targets`
  (test 3 de 5.6). Si la règle ne lit pas encore la durée, la garde grave une offre fausse — et
  une garde qui grave le mauvais invariant est plus coûteuse que pas de garde.
- **5.4 avant 5.5 avant 5.6**, strictement : la graine SDK est le seul mécanisme public capable
  de poser un média (§1.2) ; le meuble ne peut l'accepter avant qu'elle existe ; la porte ne peut
  ouvrir avant que le meuble sache la recevoir. Câbler la porte d'abord aurait ouvert **un
  composer vide** — exactement le défaut que la rév. 4 de `.feedComposer` retenait.

**Dépendances vers les autres lots :**

| Lot | Nature | Conséquence pour le lot 5 |
|---|---|---|
| **Lot 3** (`.feedComposer` cesse de router) — **MERGÉ `96b707da6`** | A modifié `ComposerIntent.swift`, `MeeshyComposerHost.swift`, 3 suites Composer | **Précondition LEVÉE** (audit 2026-08-24). Rebaser sur `d4a40f600` et **relire** : les ancres ont bougé deux fois. La ligne de commentaire de 5.6 (« câblage lot G ») est le SEUL contact avec `ComposerIntent.swift` — elle est désormais dans le bloc `:307-324`. Le lot 3 a aussi ajouté `MeeshyComposerHostGuardTests.test_aucunSiteDeProduction_neMonteUnePorteDocument_…` : sans effet ici (`.conversationMedia` monte la SCÈNE), à ne pas casser. |
| **Lot 0 bis** (repost web) — **MERGÉ `d4a40f600`** | A modifié 27 fichiers : `apps/web/**` (dont `components/v2/PostDetail.tsx`, `services/posts.service.ts`, `ReelsFeedScreen.tsx`, 4 `common.json` **et 4 `components.json`**) + `packages/shared/{types/post.ts,utils/repost-target.ts,utils/index.ts}` | **Non bloquant, et la précondition est levée.** 5.2 ne touche `forward-message-modal.tsx` que sur **une ligne d'appel** et n'ajoute aucune clé i18n web. Noter que `packages/shared/utils/index.ts` a gagné un ré-export (`repost-target.js`) : ne pas l'écraser. |
| **Lot 1** (l'éventail) | `ComposerFormatFanPolicy.isVisible` / `.resolvedSelection` (`MeeshyComposerHost.swift:238`, `:427`) | **Livré et vérifié** — 5.6 s'appuie dessus plutôt que de réinventer une règle de format. |
| **Lot 2** (surface document) | `ComposerDocumentSurface` | **Sans objet** : `.conversationMedia` monte la SCÈNE (§1.2), pas le document. |
| **Lot 4** (mood / repost) | `StatusComposerView`, `UnifiedPostComposer`, **et `MeeshyComposerHost.init`** | **COLLISION — corrigée par l'audit du 2026-08-24.** La ligne disait « Aucun recouvrement » : **c'est faux**. La tâche **4.5 du lot 4** réécrit `MeeshyComposerHost.init` pour y ajouter `onPublishDocument`, et la tâche **5.5 de ce lot** réécrit **le même `init`** pour y ajouter `seed:`. Le lot 4 a posé la règle et ce plan la reprend : **le lot 4 passe en premier** (4.5 est le bloquant de six de ses tâches ; 5.5 est un paramètre à défaut `nil` qui se greffe sur un `init` déjà remanié). **5.5 rebase sur l'`init` issu de 4.5, jamais l'inverse.** Ce qui reste vrai : le lot 5 ne retire aucun composer. |
| **Lot 6** (web) | Composer web complet | Le second point d'entrée web de `.conversationMedia` lui appartient. Le lot 5 ne touche au web que pour la règle partagée (5.2) et rien d'autre. |
| **Lot 7** (`PublishIntent`) | File de publication unique | Hérite **T5** (l'idempotence absente du pont) — voir §6. |
| **Lot H** (Android) | **Suspendu** (directive 2026-08-23, §G) | Vérifié : `apps/android` n'a **aucune** trace de `publishAttachment`. Le lot 5 ne l'ouvre pas. |

---

## 6. Les pièges NOMMÉS

1. **Une garde NÉGATIVE dont la cible disparaît passe au VERT en perdant sa protection.**
   Deux gardes de ce lot en sont : l'assertion « pas de `content: nil` » (5.3) et l'assertion
   « aucun `isLocked: true` » (5.4). Toutes deux se lisent sur la source **décommentée**
   (`AppSourceGuard.stripComments`) et sont doublées d'un garde-fou qui exige une source non
   vide. On **reformule** une garde, on ne la supprime jamais.
2. **Un fichier de test NEUF n'est PAS exécuté par `xcodebuild`** tant qu'il n'est pas dans
   `project.pbxproj`. Trois fichiers neufs ici (5.3, 5.5, 5.6 ×2) : `xcodegen generate`, puis
   **greffer le delta** contre `origin/main`. Committer un pbxproj régénéré en entier emporte
   le WIP des deux workflows voisins.
3. **Isolation MainActor par défaut (Swift 6.2)** sur la cible app : `StoryComposerSeed` est
   `nonisolated` — sans quoi jusqu'à sa conformance `Equatable` devient inutilisable hors du
   main actor (`ComposerIntent.swift:12-17` documente le cas).
4. **Pas de `@ViewBuilder` + `if #available` imbriqué** dans le `TextField` de 5.3 ni dans la
   rangée de 5.6 : débordement de pile par PROFONDEUR DE TYPE (pile device 1008 Ko contre
   8 Mo au simulateur — le crash ne se voit qu'à l'appareil).
5. **Un champ vérifié DOIT figurer dans le `select` Prisma.** T1/T2 échouent en silence si
   `isViewOnce`/`isEncrypted` ne sont pas ajoutés au `select` de `core.ts:222-228` : la garde
   lirait `undefined`, donc faux, donc rien. C'est le pas 3 de la tâche 5.1, pas un détail.
6. **Un schéma de réponse Fastify TRONQUE en silence les champs non listés.** Si 5.1 fait
   remonter un nouveau code d'erreur par le corps de réponse, vérifier que le schéma de la
   route ne l'écrête pas. (`/posts/from-attachment` n'en déclare pas aujourd'hui — vérifié —
   mais n'en ajouter aucun sans lister les champs.)
7. **Un commentaire qui énonce un invariant PLUS LARGE que son correctif devient la loi lue par
   la suivante.** Ce lot en corrige **trois** vivants (T3 ×2 : `types.ts:550-554` et
   `PostService.swift:568-570` ; loi 4 : le doc-comment de `PublicationTarget.swift:1-24`) et ne
   doit pas en écrire un quatrième. En particulier : **ne pas écrire « le lot 5 remplace le
   re-upload local »** — il n'y a jamais eu de re-upload local (§1.1).
8. **Le web est localisé en 4 langues, iOS en 7.** Aucune clé web n'est ajoutée par ce lot ;
   toute clé iOS neuve entre dans les **sept** (`ar, de, en, es, fr, it, pt-BR` — mesuré sur
   les 7 clés `forward.publish-*` existantes). Le cliquet français est aveugle aux clés sans
   accent : vérifier par un dump du catalogue, pas à l'œil.
9. **Le worktree est partagé.** Deux workflows tiennent 15 fichiers. Committer par
   `git commit -- <chemins>` (jamais `git add -A`, jamais `--amend`), et vérifier
   `git status --short` avant chaque commit : un `git add -A` ici emporterait le lot 3 et le
   lot 0 bis.

---

## 7. Ce que le lot 5 NE fait PAS (renvoi à « Hors v2 » §G — la liste est opposable)

- **Aucun RETRAIT de composer.** Rien n'est remplacé par ce lot (§1.1) ; la section « Publier »
  de `ForwardPickerSheet` **reste** — le chemin sans-canevas et le chemin composé coexistent par
  construction.
- **Android** — mis de côté par directive du 2026-08-23 (§G) ; lot H suspendu. Vérifié :
  `apps/android` n'a aucun miroir de `publishAttachment`.
- **Le second point d'entrée WEB de `.conversationMedia`** — il appartient au **lot 6**
  (composer web complet, §E). Le lot 5 ne touche au web que la ligne d'appel de la règle
  partagée.
- **L'idempotence du pont (T5)** — `POST /posts/from-attachment` n'est pas enveloppé par
  `withMutationLog`, là où `POST /posts` l'est (`core.ts:321-336`). C'est un vrai défaut
  (un retry réseau publie deux fois), et il appartient au **lot 7** : « file de publication
  UNIQUE (`PublishIntent`, S2) » est la ligne promue qui possède ce sujet. Le noter au P0
  comme dette VISIBLE plutôt que le corriger ici.
- **La fusion des destinations DANS la liste de `ForwardPickerModel`** — la loi 6 la suggère,
  la section « Publier » actuelle vit HORS de la liste et le lot la garde là : `ForwardPickerModel.states`
  est keyée sur `ForwardTarget.id` (conversations et contacts), et y injecter des cibles non-conversation
  est un chantier de modèle, non de composer. **Non vérifié en profondeur** — `ForwardPickerViewModel.search`
  et `apps/web/lib/forward-picker-model.ts` n'ont pas été ouverts.
- **Documents, PDF, code, archives, lieux** — sans destination publique, par la règle de mime
  déjà partagée. Le lieu est refusé **gratuitement** (`application/x-location` →
  `AttachmentKind.other`, vérifié) : la garde O13 « jamais `.location` » n'a pas besoin d'un site.
- **Toute mention automatique de l'expéditeur** — interdit par O13 : « un média reçu en privé
  n'est pas une publication ; l'attribuer d'office exposerait la relation privée ».
- Tout le reste de `F. Hors v1` (spec du 2026-08-20) que la section A du design v2 ne promeut
  pas explicitement.

---

## 8. Ce que ce plan n'a PAS vérifié (dit une fois, pour que personne ne le lise comme acquis)

- **`MediaService.duplicate`** n'a pas été ouvert. Le coût réel de la duplication côté serveur —
  et donc l'économie que le pont revendique — est **affirmé par ses commentaires, pas mesuré**.
  Si le stockage est objet (S3), « dupliquer » peut être une copie serveur-à-serveur ou un
  aller-retour complet : ce n'est pas tranché.
- **`runStoryUpload`** (le chemin TUS du composer) n'a été lu que par son point d'entrée
  (`StoryViewModel.publishStoryInBackground` :1396-1460). Que la graine locale de 5.4 y monte
  bien comme un média capturé — et non comme un fond de repost — est une **hypothèse** que
  la tâche 5.6 doit prouver par un envoi RÉEL avant de se déclarer verte.
- **`StoryPublishQueue`** (le second magasin persisté, distinct de l'outbox) n'a pas été ouvert.
  Le comportement hors ligne de la porte `.conversationMedia` n'est donc **pas caractérisé** :
  ne rien promettre à ce sujet dans le commit.
- **Les deux plans de forward existants** (`2026-08-19-forward-reach.md`, 57 Ko ;
  `2026-08-19-media-forward-reliability-and-more-menu.md`, 40 Ko) n'ont **pas** été lus. S'ils
  portent des cases non cochées qui recoupent ce lot, elles ne sont pas dans ce plan.
- **Les planches P0** n'ont été lues que par extraction (rév. 18, 57/70). Le fichier a bougé
  pendant cette rédaction : relire avant d'y écrire.
- **Aucun build, aucun test n'a été lancé** pour écrire ce plan. Toute phrase du type « cette
  garde rougirait » est une lecture de source, pas une mesure d'exécution.
