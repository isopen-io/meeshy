# Sprint 3 — Affichage optimiste des medias (image / video / audio)

**Status:** Draft (2026-05-18)

**Scope:** `packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift`,
`apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift`,
`apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift`,
`apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift`,
`apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift`,
`packages/MeeshySDK/Sources/MeeshySDK/Cache/DiskCacheStore.swift` (lecture seule — comportement deja correct).
Tests : `packages/MeeshySDK/Tests/MeeshySDKTests/Configuration/MeeshyConfigTests.swift`,
nouveau `apps/ios/MeeshyTests/Unit/Views/AttachmentDownloaderTests.swift`.

---

## 1. Problem / Symptoms

Quand l'utilisateur envoie une image (ou une video / un audio) dans une conversation,
il **ne voit pas son media**. A la place, la bulle affiche un cadre sur fond violet
(`accent.opacity(0.85)`) avec une icone de telechargement `arrow.down.to.line`, comme
si un fichier deja present localement devait etre re-telecharge.

Comportement attendu (Prisme / Instant App — cache-first) : le media qui vient d'etre
envoye s'affiche **immediatement**, dans le bon format (image visible, video/audio
jouable), manipulable (zoom image, lecture video/audio), **depuis les donnees locales**,
**sans aucun re-telechargement**, y compris apres confirmation serveur (`message:new`).

Le mecanisme optimiste existe deja mais est inerte : l'attachment optimiste porte bien
l'URL locale (`fileUrl = fileURL.absoluteString`, soit `file:///var/mobile/.../camera_X.jpg` —
`ConversationView+AttachmentHandlers.swift:105` et `:108` pour `thumbnailUrl`), et
`DiskCacheStore.cacheImageForPreview(_:key:)` (`DiskCacheStore.swift:371-377`) seed deja
le cache. La reference n'est pas perdue dans le modele — elle est **detruite au moment
du rendu** par `MeeshyConfig.resolveMediaURL`.

---

## 2. Root Causes

| ID | Cause | Fichier:ligne (verifie) | Effet |
|----|-------|-------------------------|-------|
| **RC3.1** | `resolveMediaURL` n'a aucun fast-path `file://`. Une URL `file:///var/...` ne commence ni par `http(s)://` ni par `/` → branche `else` → reecrite en `https://<server>/file:///var/...`. | `MeeshyConfig.swift:58-66` (corps de `resolveMediaURL`, branche `else` ligne 64-66) | (a) la cle de cache ne matche plus le seed (`SHA256("file://…")` ≠ `SHA256("https://…/file://…")`) → cache miss ; (b) le chargement reel part en HTTP et 404. |
| **RC3.2** | `AttachmentDownloader.checkCache` ne verifie que le store audio/video, jamais le store images, et passe par `resolveMediaURL` casse. `DownloadBadgeView` superpose `idleBadge` (cercle `accent.opacity(0.85)` = le fond violet) sur chaque cellule media non protegee. | `ConversationMediaViews.swift:149-154` (`checkCache`), `:49-95` (`idleBadge`, fond violet ligne 59), `:81-94` (polling `.task` qui ne lit que `audio`/`video`) ; overlay : `ThemedMessageBubble+Media.swift:242-254` (`downloadBadgeOverlay`) | `downloader.isCached` ne passe jamais a `true` → le badge violet reste affiche en permanence sur le media optimiste. |
| **RC3.3** | A l'arrivee de l'echo serveur, `ConversationSocketHandler` ecrase l'`attachmentsJson` optimiste avec les donnees serveur (URL distante). L'upload seed bien `CacheCoordinator.images` via `store(data, for: result.fileUrl)`, mais si `result.fileUrl` est relatif (`/api/...`) la cle differe de `resolveMediaURL(...)` = `https://server/api/...`. | `ConversationSocketHandler.swift:257-276` (`updateServerAckedFields`, `attachmentsJson`), `:287-303` (`updateAttachmentsJson` du chemin `containsMessage`) ; seed post-upload : `ConversationView+AttachmentHandlers.swift:254` | A la transition optimiste → confirme, le renderer cherche `resolveMediaURL(serverFileUrl)` et ne trouve rien en cache → re-telechargement force, flicker / shimmer. |

### Note sur l'audio (cause derivee de RC3.1)

`AudioPlayerView.AudioPlaybackManager.play(urlString:)` (`AudioPlayerView.swift:32-55`,
appel ligne 369) lit l'audio via `CacheCoordinator.shared.audio.data(for: resolved)`.
`DiskCacheStore.data(for:)` (`DiskCacheStore.swift:150-181`) **rejette explicitement**
tout schema non `http/https` (`scheme == "https" || scheme == "http"` sinon
`throw DiskCacheError.notCached`, lignes 162-166). Donc meme avec RC3.1 corrige, un
attachment audio optimiste `file://` passe a `play(urlString:)` ne lirait rien depuis le
cache. `playLocal(url:)` (`:58-68`) charge bien le fichier directement, mais n'est jamais
appele depuis la bulle de message. RC3.2 doit donc router l'audio optimiste local de
maniere a ne pas dependre de `data(for:)` — voir T2.

### Ce qui marche deja et qu'il faut juste debloquer

- `DiskCacheStore.image(for:)` a deja un fast-path `file://` correct
  (`DiskCacheStore.swift:321-328`) qui lit depuis le filesystem — mais il n'est jamais
  atteint car `resolveMediaURL` reecrit l'URL **avant**.
- `DiskCacheStore.cacheImageForPreview(_:key:)` (`:371-377`) seed deja le cache image
  optimiste.
- L'attachment optimiste porte deja le `file://` (`ConversationView+AttachmentHandlers.swift:105`,
  `:108`).

→ Le seul fix RC3.1 reconcilie automatiquement (a) le seed `cacheImageForPreview` et
(b) le fast-path filesystem de `image(for:)`. Une seule ligne debloque les deux
mecanismes deja en place pour les images.

---

## 3. Design / Solution

### RC3.1 — Passthrough `file://` dans `resolveMediaURL`

Ajouter, **tout au debut** de `resolveMediaURL` (avant la construction de `resolved` et
**avant** les checks anti-SSRF), un fast-path : si l'URL parse avec `scheme == "file"`,
la retourner inchangee.

```swift
public static func resolveMediaURL(_ urlString: String) -> URL? {
    // Local optimistic media (camera capture, recorded audio, picked file)
    // is referenced by its on-device file:// URL. It is NEVER prefixed with
    // the server origin and is NEVER subject to the SSRF host checks — it
    // does not touch the network. Returning it verbatim makes both the
    // cacheImageForPreview() seed key and DiskCacheStore.image(for:)'s
    // file:// filesystem fast-path line up. See Sprint 3 RC3.1.
    if urlString.hasPrefix("file://"),
       let fileURL = URL(string: urlString),
       fileURL.isFileURL {
        return fileURL
    }
    let resolved: String
    ...
}
```

Pourquoi `hasPrefix("file://")` plutot que parser puis tester `scheme`: le test de
prefixe garantit que l'on ne traite comme `file://` que des chaines explicitement
locales, et evite qu'une chaine `"file"` sans `://` (improbable mais possible cote
serveur) tombe dans ce chemin. `fileURL.isFileURL` confirme le parse.

Effet : (a) `SHA256("file:///var/...")` au seed === `SHA256` au render → cache hit ;
(b) `DiskCacheStore.image(for:)` voit `url.scheme == "file"` et lit le filesystem
(`:322-327`). L'image s'affiche depuis le local, instantanement, sans HTTP.

### RC3.2 — Badge de telechargement : multi-store + masquage pour media local

Deux changements dans `ConversationMediaViews.swift`.

**a) `AttachmentDownloader.checkCache` doit aussi consulter le store images.**
Actuellement il choisit `audio` ou `video` selon `isAudio` et ignore les images.
Le rendre conscient du type de media et du schema `file://` :

```swift
func checkCache(_ urlString: String, mediaKind: MediaKind) async {
    // Local optimistic media is, by definition, already on disk — no
    // download badge should ever appear for it.
    if urlString.hasPrefix("file://") {
        if FileManager.default.fileExists(atPath: URL(string: urlString)?.path ?? "") {
            isCached = true
        }
        return
    }
    let resolved = MeeshyConfig.resolveMediaURL(urlString)?.absoluteString ?? urlString
    let cached: Bool
    switch mediaKind {
    case .audio: cached = await CacheCoordinator.shared.audio.isCached(resolved)
    case .video: cached = await CacheCoordinator.shared.video.isCached(resolved)
    case .image: cached = await CacheCoordinator.shared.images.isCached(resolved)
    }
    if cached { isCached = true }
}
```

`MediaKind` est un `enum { case image, video, audio }` deduit de `attachment.mimeType`
(prefixe `image/`, `video/`, `audio/`). Les appelants de `checkCache` (le `.task` de
`idleBadge` lignes 77-80, et le `.task` polling lignes 81-94) passent la bonne valeur.
Le polling `.task` (`:81-94`) doit lui aussi router vers le bon store et court-circuiter
sur `file://` (sortie immediate avec `isCached = true`).

**b) Masquer le badge pour tout attachment local ou en cours d'envoi.**
Ajouter a `DownloadBadgeView` un test precoce : un attachment dont le `fileUrl` est une
URL `file://`, OU dont le message porteur est en etat `.sending` / optimiste, ne doit
JAMAIS afficher de badge de telechargement — le media est deja local.

`DownloadBadgeView` ne recoit aujourd'hui que `attachment` + `accentColor`. Il faut lui
passer l'etat du message (le `Message.deliveryStatus` du porteur) — propage depuis
`BubbleGridCell` (`ThemedMessageBubble+Media.swift:144-184`, qui a deja `messageId` ; on
ajoute `messageDeliveryStatus: Message.DeliveryStatus` en `let`). Le `body` de
`DownloadBadgeView` devient :

```swift
private var isLocalMedia: Bool { attachment.fileUrl.hasPrefix("file://") }
private var isOptimistic: Bool {
    messageDeliveryStatus == .sending || messageDeliveryStatus == .invisible
}

var body: some View {
    if isLocalMedia || isOptimistic {
        EmptyView()                      // local media never needs a download button
    } else {
        Group { ... existing 3-state switch ... }
    }
}
```

Le meme garde s'applique a l'overlay `downloadBadgeOverlay`
(`ThemedMessageBubble+Media.swift:242-254`) : la condition existante
`if !attachmentIsProtected || isRevealed` est conservee ; `DownloadBadgeView`
court-circuite en interne, donc aucun changement structurel n'est requis cote overlay,
seulement le passage du nouveau parametre.

**Audio optimiste** : `AudioMediaView` (`ConversationMediaViews.swift:276-590`) a son
propre cycle (`audioPlaceholder` + polling `.task` lignes 381-391 sur
`CacheCoordinator.shared.audio.isCached`). Pour un attachment `file://`, ce polling ne
matchera jamais (l'audio local n'est pas dans le store). Donc :
- si `attachment.fileUrl.hasPrefix("file://")`, `AudioMediaView` doit traiter
  `isCached = true` immediatement (le fichier est local) ;
- `AudioPlayerView` doit, pour un `file://`, jouer via `playLocal(url:)` plutot que
  `play(urlString:)` (qui passerait par `data(for:)` qui rejette `file://` — voir §2).
  L'aiguillage se fait dans le call-site `AudioPlayerView.swift:369` :
  `if attachment.fileUrl.hasPrefix("file://"), let u = URL(string: attachment.fileUrl) { player.playLocal(url: u) } else { player.play(urlString: attachment.fileUrl) }`.

### RC3.3 — Alignement de cle post-upload + pas d'ecrasement premature

Apres l'upload TUS (`ConversationView+AttachmentHandlers.swift:245-263`), le seed se fait
via `CacheCoordinator.shared.images.store(fileData, for: result.fileUrl)` (`:254`). Si
`result.fileUrl` est relatif, la cle ne matchera pas le render. Corriger en seedant
**sous la cle exacte que le renderer utilisera** :

```swift
if let fileData {
    let renderKey = MeeshyConfig.resolveMediaURL(result.fileUrl)?.absoluteString
        ?? result.fileUrl
    await CacheCoordinator.shared.images.store(fileData, for: renderKey)
    // Pre-seed the in-memory UIImage cache too, under the SAME key, so the
    // optimistic→confirmed transition reads a hot cache and never re-decodes
    // or re-downloads.
    if let image = UIImage(data: fileData) {
        DiskCacheStore.cacheImageForPreview(image, key: renderKey)
    }
    ...
}
```

Le pre-seed doit avoir lieu **avant** que l'echo `message:new` n'ecrase l'attachment
optimiste. Comme l'upload se termine puis `sendMessage(...)` / `sendWithAttachmentsAsync`
est appele (qui declenche l'echo), seeder dans la boucle d'upload (avant l'envoi socket)
garantit que le cache est chaud sous la cle serveur au moment ou
`ConversationSocketHandler` substitue l'`attachmentsJson` serveur. Resultat : la bulle
passe de `file://` → URL serveur **sans cache miss**, donc sans flicker ni shimmer.

Le meme principe vaut pour l'audio (`:238`,
`CacheCoordinator.shared.audio.store(audioData, for: result.fileUrl)`) et pour les
thumbnails (`:258`) : utiliser systematiquement la cle resolue via `resolveMediaURL`.

**Cleanup des fichiers temp.** `ConversationView+AttachmentHandlers.swift:306-307`
supprime les `file://` temporaires apres l'upload. Cette suppression ne doit intervenir
qu'**apres** le pre-seed du cache sous la cle serveur, sinon la preview optimiste se base
sur un fichier deja supprime entre la fin d'upload et l'arrivee de l'echo. L'ordre
actuel (seed dans la boucle `:245-263`, suppression dans le `MainActor.run` final
`:305-317`) est correct ; veiller a ne pas le reordonnancer.

### RC3.3 + dependance Sprint 2 (zone `ConversationSocketHandler.swift:257-303`)

Sprint 2 (rendu temps reel) reecrit cette meme zone : il route l'ingestion via le chemin
complet `APIMessage` et reconcilie par `clientMessageId`. Sprint 3 ne doit PAS dupliquer
ni contredire ce routage. Sprint 3 ajoute, **par-dessus** la version Sprint 2 de la
reconciliation :

1. Lors de la conversion `apiMsg.toMessage(...)` cote echo, **avant** d'ecrire
   `attachmentsJson` (le futur point de reecriture, actuellement `:257-264` /
   `:297-302`), pre-seeder le cache image/video sous la cle serveur resolue si l'attachment
   optimiste correspondant portait un `file://` et que ses bytes sont encore disponibles
   (deja garanti par le pre-seed RC3.3 cote upload — ce point est une ceinture+bretelles
   defensif, optionnel si le pre-seed upload est en place).
2. Ne jamais ecraser l'attachment optimiste tant que la cle serveur n'est pas garantie
   chaude en cache. Concretement : le pre-seed RC3.3 cote `ConversationView+AttachmentHandlers`
   etant fait AVANT l'envoi socket, l'echo arrive toujours apres un cache chaud — la
   reecriture `attachmentsJson` de Sprint 2 devient sure sans modification supplementaire
   du handler.

→ En pratique, **Sprint 3 ne modifie `ConversationSocketHandler.swift` que si le
pre-seed cote upload (RC3.3 / `ConversationView+AttachmentHandlers.swift`) s'avere
insuffisant** (ex. l'echo arrive avant la fin de l'upload sur reseau tres lent). Le merge
map (§7) liste ce fichier comme « touche conditionnellement » — le mergeur applique le
diff Sprint 2 d'abord, puis Sprint 3 ajoute seulement, si necessaire, le pre-seed
defensif decrit ci-dessus, sans toucher au routage `clientMessageId` de Sprint 2.

### T4 — Centralisation de la resolution d'URL media (REFACTOR)

Une fois RC3.1 en place, auditer tous les call-sites de `resolveMediaURL` pour garantir
un comportement uniforme face au `file://` :
- `CachedAsyncImage` / `CachedAvatarImage` / `CachedBannerImage` / `ProgressiveCachedImage`
  (`CachedAsyncImage.swift` — `resolveMediaURL` utilise lignes 28, 68, 86, 129, 153, 175,
  200, 230, 241, 276, 285, 326, 331, 342, 352) : tous passent deja par `resolveMediaURL`,
  donc le fast-path RC3.1 les corrige sans changement.
- `VideoPlayerView` (`VideoPlayerView.swift:63` lecture inline, `:134` thumbnail, `:382`
  et `:411` fullscreen) : consomme directement l'URL resolue dans `AVPlayer(url:)` —
  RC3.1 suffit (AVPlayer lit nativement un `file://`).
- `DownloadBadgeView` (`ConversationMediaViews.swift:83`, `:150`, `:167`, `:207`) :
  corrige par RC3.2.
- `AudioPlayerView` (`AudioPlayerView.swift:39`, `:742`) : RC3.1 + l'aiguillage
  `playLocal` decrit en RC3.2.

Le refactor se limite a vérifier l'uniformite et a documenter, dans un commentaire au
sommet de `resolveMediaURL`, le contrat « `file://` => passthrough, jamais de SSRF ».
Aucune nouvelle abstraction n'est introduite (eviter le sur-engineering — CLAUDE.md
« Demand Elegance (Balanced) »).

---

## 4. Tasks (TDD — RED / GREEN / REFACTOR)

### T0 — RED : ecrire les tests qui echouent

`MeeshyConfigTests.swift` (XCTest, suit le style du fichier existant) :
- `test_resolveMediaURL_withFileScheme_returnsURLUnchanged` — une URL
  `file:///var/mobile/Containers/.../camera_X.jpg` est retournee verbatim.
- `test_resolveMediaURL_withHttpsURL_unchanged` — regression : `https://cdn…/x.png`
  inchangee (deja couvert par `testResolveMediaURLReturnsAbsoluteHTTPSAsIs`, garder).
- `test_resolveMediaURL_withRelativePath_prependsOrigin` — regression : `/api/v1/...`
  prefixe par l'origine (deja couvert par `testResolveMediaURLResolvesRelativePath`).
- `test_resolveMediaURL_withFileScheme_skipsSSRFChecks` — un `file://` pointant sur un
  chemin qui contiendrait `127.0.0.1` dans le path n'est PAS rejete (le fast-path court-
  circuite les checks IP) ; un `https://127.0.0.1/...` reste rejete.

`AttachmentDownloaderTests.swift` (NOUVEAU, `apps/ios/MeeshyTests/Unit/Views/`, XCTest,
`@MainActor`) :
- `test_checkCache_imageAttachment_checksImageStore` — un attachment image dont l'URL est
  dans le store images fait passer `isCached` a `true`.
- `test_checkCache_localFileAttachment_setsCachedWithoutNetwork` — un attachment
  `file://` existant sur disque → `isCached == true`, aucun acces store/reseau.
- `test_downloadBadge_forSendingMessage_isHidden` — `DownloadBadgeView` dont le message
  porteur est `.sending` ne rend rien (`EmptyView`).
- `test_downloadBadge_forLocalFileAttachment_isHidden` — `DownloadBadgeView` dont
  `attachment.fileUrl` est un `file://` ne rend rien.

Test de rendu (snapshot ou behavior, selon l'infra dispo) : un message optimiste portant
un attachment `file://` affiche l'image, pas le shimmer ni le badge violet.

### T1 — GREEN (RC3.1)
Fast-path `file://` au sommet de `resolveMediaURL` (`MeeshyConfig.swift`). Les tests
`MeeshyConfigTests` passent au vert. Verifier que les 18 tests `resolveMediaURL` /
SSRF existants restent verts (non-regression).

### T2 — GREEN (RC3.2)
`checkCache` multi-store + `MediaKind` ; `DownloadBadgeView` masque pour media local /
optimiste ; propagation de `messageDeliveryStatus` depuis `BubbleGridCell` ;
aiguillage `playLocal` pour l'audio `file://` dans `AudioPlayerView`. Les tests
`AttachmentDownloaderTests` passent au vert.

### T3 — GREEN (RC3.3)
Seed post-upload sous la cle `resolveMediaURL(result.fileUrl)` pour images / audio /
thumbnails dans `ConversationView+AttachmentHandlers.swift` ; pre-seed du UIImage cache.
Verifier l'ordre seed → suppression des fichiers temp. Si necessaire, pre-seed defensif
dans `ConversationSocketHandler.swift` (par-dessus Sprint 2 — voir §3 et §7).

### T4 — REFACTOR
Audit des call-sites `resolveMediaURL` (CachedAsyncImage, ProgressiveCachedImage,
VideoPlayerView, AudioPlayerView, DownloadBadgeView) pour comportement `file://`
uniforme. Commentaire de contrat au sommet de `resolveMediaURL`.

### T5 — VERIF
`./apps/ios/meeshy.sh test` vert (app) + tests SDK
(`xcodebuild test -scheme MeeshySDK-Package -only-testing:MeeshySDKTests/MeeshyConfigTests`).
Test manuel sur simulateur : envoyer image, video, audio → affichage immediat,
lecture / manipulation OK, aucun re-telechargement apres confirmation serveur.

---

## 5. Risks

- **Securite / SSRF.** `resolveMediaURL` contient des checks anti-SSRF (`isLocalhost`,
  `isPrivateIP`, `MeeshyConfig.swift:71-90`). Le fast-path `file://` est ajoute **avant**
  ces checks — c'est intentionnel et sans danger : un `file://` ne touche jamais le
  reseau. Le RISQUE serait qu'un `file://` provenant du **serveur** (champ `fileUrl` d'un
  `APIMessage`) ouvre une lecture de fichier local arbitraire. Mitigation : le serveur ne
  renvoie jamais de `file://` (il renvoie des chemins relatifs `/api/...` ou des URLs
  absolues `https://`). Le fast-path se contente de retourner une `URL` ; il n'ouvre
  aucun fichier — c'est `DiskCacheStore.image(for:)` (`:322-327`) qui lit le filesystem,
  et il le fait deja aujourd'hui pour les `file://`. Le fast-path n'elargit donc PAS la
  surface d'attaque par rapport a l'existant : il rend simplement atteignable un chemin
  deja present et deja considere sur pour les medias d'origine locale (capture camera,
  enregistrement audio, fichier importe). Verifier en revue qu'aucun chemin de decodage
  ne reçoit un `file://` issu d'un payload reseau non valide.
- **Dependance Sprint 2.** RC3.3 concerne `ConversationSocketHandler.swift:257-303`,
  exactement la zone que Sprint 2 (RC2.2 / RC2.3) reecrit. Sprint 3 DOIT etre
  implemente / mergé **apres** Sprint 2. Voir §7.
- **Audio.** `DiskCacheStore.data(for:)` rejette `file://` (`:162-166`) — d'ou
  l'aiguillage `playLocal` obligatoire (RC3.2). Valider la lecture audio optimiste sur
  les 3 formats (`m4a`, `mp3`, `wav`).
- **Cleanup temp.** Les fichiers `file://` temporaires (`composerState.pendingMediaFiles`,
  `pendingAudioURL`) ne doivent pas etre supprimes avant que le cache ne soit seede sous
  la cle serveur, sinon la preview se perd pendant l'upload. L'ordre actuel est correct ;
  ne pas le reordonnancer (RC3.3).
- **Video.** `VideoPlayerView` lit `MeeshyConfig.resolveMediaURL(attachment.fileUrl)`
  directement dans `AVPlayer(url:)` (`:63`). AVPlayer joue nativement un `file://` — RC3.1
  suffit. Valider la lecture inline d'une video optimiste.

---

## 6. Acceptance Criteria / Verification

1. A l'envoi d'une image, la preview s'affiche immediatement — vrai rendu, pas de cadre
   violet, pas d'icone de telechargement.
2. A l'envoi d'une video, la thumbnail s'affiche et la video est immediatement jouable.
3. A l'envoi d'un audio, le lecteur audio est immediatement fonctionnel (lecture depuis
   le `file://` local via `playLocal`).
4. Apres confirmation serveur (echo `message:new`), aucun re-telechargement : le media
   reste affiche sans flicker ni shimmer.
5. Le media est manipulable (zoom image, lecture video / audio) directement depuis le
   local.
6. `./apps/ios/meeshy.sh test` vert + `MeeshyConfigTests` vert (incluant les 18 tests
   `resolveMediaURL` / SSRF de non-regression).

---

## 7. Coordination & Merge

Cette spec est l'une de trois specs de sprint redigees **en parallele** :
- Sprint 1 — `2026-05-18-sprint1-typing-indicator.md`
- Sprint 2 — `2026-05-18-sprint2-realtime-message-rendering.md`
- Sprint 3 — ce document (`2026-05-18-sprint3-optimistic-media.md`)

**Ordre d'execution recommande : Sprint 2 D'ABORD, puis Sprint 3 (ce document), puis
Sprint 1.**

### Pourquoi Sprint 3 apres Sprint 2

RC3.3 modifie potentiellement `ConversationSocketHandler.swift` dans la zone de
reconciliation de l'echo (`~257-303` : `updateServerAckedFields` et le chemin
`containsMessage` / `updateAttachmentsJson`). C'est **exactement** la zone que Sprint 2
reecrit (RC2.2 / RC2.3 — Sprint 2 route l'ingestion via le chemin complet `APIMessage`
et reconcilie par `clientMessageId`). Ces deux sprints **ne peuvent pas** etre realises
dans des worktrees independants en toute securite : ils se chevauchent sur le meme
fichier et la meme zone.

Sprint 3 doit etre implemente / mergé **apres** Sprint 2, sur la meme branche ou en
ordre de merge strict. Concretement, le diff Sprint 3 se superpose ainsi :
1. Le mergeur applique d'abord Sprint 2 (routage `clientMessageId` complet).
2. Le gros du travail RC3.3 est cote `ConversationView+AttachmentHandlers.swift`
   (pre-seed du cache image/audio/thumb sous la cle `resolveMediaURL(result.fileUrl)`
   AVANT l'envoi socket). Ce fichier n'est **pas** touche par Sprint 2 → aucun conflit.
3. Sprint 3 ne touche `ConversationSocketHandler.swift` que si le pre-seed cote upload
   se revele insuffisant (echo arrivant avant la fin d'upload). Dans ce cas, Sprint 3
   AJOUTE seulement un pre-seed defensif du cache au point de reecriture
   `attachmentsJson`, **sans modifier** le routage `clientMessageId` de Sprint 2 :
   l'attachment optimiste `file://` voit son cache aligne / preserve a travers la
   reconciliation plutot qu'ecrase.

### Merge map — fichiers touches par Sprint 3

| Fichier | Sprint 3 | Aussi touche par Sprint 2 ? |
|---------|----------|------------------------------|
| `packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift` | RC3.1 — fast-path `file://` | Non |
| `apps/ios/Meeshy/Features/Main/Views/ConversationMediaViews.swift` | RC3.2 — `checkCache` multi-store, `DownloadBadgeView` masquage, audio optimiste | Non (a confirmer avec l'auteur Sprint 2) |
| `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift` | RC3.2 — propagation `messageDeliveryStatus` a `BubbleGridCell` / `DownloadBadgeView` | Non (a confirmer) |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift` | RC3.3 — seed post-upload sous cle resolue + pre-seed UIImage cache | Non |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift` | RC3.3 — **conditionnel** : pre-seed defensif uniquement si le pre-seed upload ne suffit pas | **OUI — zone `~257-303`, MEME zone que Sprint 2 RC2.2/RC2.3. Conflit garanti. Merge Sprint 3 APRES Sprint 2.** |
| `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift` | RC3.2 — aiguillage `playLocal` pour `file://` | Non (a confirmer) |
| `packages/MeeshySDK/Tests/MeeshySDKTests/Configuration/MeeshyConfigTests.swift` | T0 — nouveaux tests `file://` | Non |
| `apps/ios/MeeshyTests/Unit/Views/AttachmentDownloaderTests.swift` | T0 — NOUVEAU fichier de test | Non |

`DiskCacheStore.swift` est cite en `Scope` mais **n'est pas modifie** : son fast-path
`file://` (`:321-328`) et `cacheImageForPreview` (`:371-377`) sont deja corrects ; Sprint 3
les rend simplement atteignables.

### Sprint 1

Sprint 1 (indicateur de saisie) est **completement independant** : il ne touche aucun
fichier de cette merge map. Il peut etre realise en parallele dans son propre worktree
et mergé a n'importe quel moment.

### Nouveaux fichiers `.swift` et `project.pbxproj`

Sprint 3 ajoute **un** nouveau fichier source de test :
`apps/ios/MeeshyTests/Unit/Views/AttachmentDownloaderTests.swift` (cible de test
`MeeshyTests`). Aucun nouveau fichier de **code de production**.

`MeeshyConfigTests.swift` est un fichier existant — pas de nouvelle entree pbxproj cote
SDK (le package SPM compile les tests par convention de dossier).

Le nouveau fichier de test app necessite une entree dans `apps/ios/Meeshy.xcodeproj/
project.pbxproj` (cible `MeeshyTests`). Conformement a CLAUDE.md (« project.pbxproj :
gere par le DERNIER worktree a merger uniquement »), si Sprint 3 est implemente dans un
worktree, l'entree pbxproj du fichier de test doit etre reconciliee par le dernier
worktree mergé. Comme Sprint 3 se merge apres Sprint 2 (et avant ou apres Sprint 1 selon
l'ordre retenu), le mergeur final ajoute l'entree `AttachmentDownloaderTests.swift` lors
de la reconciliation `project.pbxproj`. Si les trois sprints partagent la meme branche
(recommande vu le couplage Sprint 2 / Sprint 3), l'entree est ajoutee directement, sans
reconciliation cross-worktree.
