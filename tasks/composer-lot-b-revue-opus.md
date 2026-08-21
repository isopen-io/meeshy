# Revue Opus du lot B — rapport intégral (2026-08-20)

# Revue finale — lot B MeeshyComposer (`feat/composer-lot-b`, 6 commits)

Terrain : `/Users/smpceo/Documents/v2_meeshy-lot-b`. Diffs + état final lus pour les 6 commits, plus le miroir gateway `storyEffectsV3.ts`, le Zod gelé `packages/shared/types/canvas-v3.ts`, les fixtures `packages/shared/fixtures/canvas-v3/`, le plan et la spec.

---

## CONSTATS

### 1. BLOQUANT — Le son EMPRUNTÉ est détruit par la publication v3 ; la note+onde ment alors sur la provenance (viole B3.4, la loi que B5 implémente au même lot)

`packages/MeeshySDK/Sources/MeeshySDK/Models/CanvasV3Migration.swift:251-264` — le payload d'un objet `audio` ne porte que trois clés :

```swift
for audio in effects.audioPlayerObjects ?? [] {
    …
    payload: [
        "postMediaId": audio.postMediaId.isEmpty ? .null : .string(audio.postMediaId),
        "mediaURL": audio.mediaURL.map(CanvasJSONValue.string) ?? .null,
        "placement": .string(audio.placement),
    ]))
```

Le pont de rendu ne les restitue pas davantage — `CanvasV3Migration.swift:543-553` :

```swift
var audio = StoryAudioPlayerObject(
    id: object.id,
    postMediaId: object.payload.string("postMediaId") ?? "",
    placement: object.payload.string("placement") ?? "overlay",
    x: …, y: …, startTime: …, sourceLanguage: …, keyframes: …, mediaURL: …)
```

`soundId`, `soundAuthorUsername`, `volume`, `waveformSamples`, `isBackground`, `duration`, `loop`, `fadeIn/fadeOut`, `name`, `backgroundAudioVariants` disparaissent. Le dépôt AVERTIT explicitement contre exactement ce défaut, `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryModels.swift:990-994` :

```swift
// ⚠ Le `CodingKeys` de ce type est EXPLICITE : ajouter une propriété
// sans ajouter son `case` compile sans le moindre avertissement, et le
// champ n'est alors ni encodé ni décodé — le son emprunté serait perdu
// à la publication, en silence.
case soundId
case soundAuthorUsername
```

B7 rend ce chemin OBLIGATOIRE (`StoryModels.swift:1830` : `try CanvasV3(migrating: self).encode(to: encoder)`), et `PostService.swift:479-480` encode `sanitizedEffects` par Codable. Les deux consommateurs de la provenance lisent précisément ces champs :
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/AudioForegroundChip.swift:185-188` : `AudioChipDisplay.resolve(soundId: audioObject.soundId, title: audioObject.name, authorUsername: audioObject.soundAuthorUsername)`
- `apps/ios/Meeshy/Features/Main/Views/StoryViewerView.swift:1783-1787` : `if let bg, bg.soundId != nil { … resolve(soundId: bg.soundId, title: bg.name, authorUsername: bg.soundAuthorUsername) }`

**Défaut** : une story publiée avec un son de bibliothèque revient du fil sans `soundId`, la chip retombe en `.waveform` (♫〰) et annonce « son original » pour un son emprunté — la violation exacte de B3.4 « `♫〰` si et seulement si son ORIGINAL ».

---

### 2. BLOQUANT — `drawingData` (dessin legacy) est perdu à l'encodage, alors que le commit B7 affirme le contraire ; la porte de publication laisse passer un canvas qui partira VIDE

Le message de `d5d7e2dfe` affirme : « le dessin voyage en objet kind:drawing … **une story qui n'est QUE du dessin survit** ». La branche ajoutée ne couvre que `drawingStrokes` — `CanvasV3Migration.swift:225-234` :

```swift
if let strokes = effects.drawingStrokes, !strokes.isEmpty,
   let wire = wireArray(strokes) {
```

`drawingData: Data?` n'a aucune branche. L'ancien `encode(to:)` l'émettait (`try c.encodeIfPresent(drawingData, forKey: .drawingData)`, désormais relégué à `RuntimeSnapshot`, `StoryModels.swift:1856`). Or ce champ est vivant : écrit par le composer (`StoryComposerViewModel.swift:178` `effects.drawingData = drawingData`), rendu par `StorySlideRenderer.swift:168` (`else if let data = slide.effects.drawingData`), et il ouvre à lui seul la porte de publication — `packages/MeeshySDK/Sources/MeeshyUI/Story/StoryComposerView+Publication.swift:245` :

```swift
|| slide.effects.drawingData != nil
```

**Défaut** : une slide dont le seul contenu est un `drawingData` passe la porte de publication et part sur le fil en `{"v":3,"scenes":[{"id":"s1","objects":[]}]}` — canvas vide publié, en silence.

---

### 3. BLOQUANT — Les variantes TTS (`backgroundAudioVariants`) sont perdues à la publication ET à l'autosave (ligne d'inventaire §E)

`CanvasV3` n'a aucun logement pour ce champ (`CanvasV3.swift:226-296`, `BackgroundSoundV3 { source, volume, bounds, transcriptions }`), et `CanvasV3(migrating:)` ne l'émet nulle part. Il était encodé avant B7 (`StoryModels.swift:1871`, aujourd'hui dans `RuntimeSnapshot` seulement). Consommateurs vivants :
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StoryAudioTranscript.swift:32` `for variant in effects?.backgroundAudioVariants ?? []` et `:56` `guard let variants = effects?.backgroundAudioVariants, !variants.isEmpty else { return nil }`
- `apps/ios/Meeshy/Features/Main/Views/StoryContentPresence.swift:49` `if effects.backgroundAudioVariants?.isEmpty == false { return true }`

La spec §E liste « **variantes TTS** » dans l'inventaire P2 dont chaque ligne doit rester verte, et qualifie une ligne perdue de « défaut bloquant, pas une note ».

**Défaut** : la piste TTS par langue d'une story ne survit plus à sa publication ni à un enregistrement de brouillon.

---

### 4. BLOQUANT — La migration one-shot des brouillons ÉCRASE la ligne v1 par un v3 lossy : perte locale irréversible, contre la loi B3 « jamais de perte »

`packages/MeeshySDK/Sources/MeeshySDK/Store/StoryDraftStore.swift:771-795` :

```swift
guard !isAlreadyV3(effectsJSONStr),
      let migratedData = JSONEncoder().encodeOrLog(CanvasV3(migrating: effects), …)
…
try db.execute(
    sql: "UPDATE story_draft_slide SET effects_json = ? WHERE draft_id = ? AND id = ?",
```

Le plan (Task B3, Step 3) écrit : « échec de conversion ⇒ ligne laissée telle quelle (**tolérance, jamais de perte**) ». La tolérance implémentée ne couvre que l'échec ; une conversion RÉUSSIE écrase la seule copie du blob v1 par un document qui a perdu (constats 1–3 + 5) `soundId`/`soundAuthorUsername`, `waveformSamples`, `backgroundAudioVariants`, `drawingData`, `voiceAttachmentId`, `mutedVolumeMemento`, `aspectRatio`, `intrinsicDuration`, `isDuckingDisabled`, `placement`/`fadeIn`/`fadeOut`/`name` des médias, le pivot média, et le `canvasAspectRatio`.

**Défaut** : le premier `load()` d'un brouillon v1 détruit définitivement des champs auteur-locaux que le brouillon existait justement pour conserver — sans qu'aucun test ne compare l'avant/après du contenu au-delà de `textObjects[0].text`.

---

### 5. MAJEUR — Fidélité média perdue : `aspectRatio` remis à 1.0, pivot média non porté ; cascade sur `canvasAspectRatio`

`CanvasV3Migration.swift:496-513` :

```swift
return StoryMediaObject(
    id: object.id,
    postMediaId: …,
    mediaType: object.payload.string("mediaType") ?? "image",
    aspectRatio: 1.0,
```

`aspectRatio` est documenté « figé à la composition (REQUIRED, fallback 1.0 on legacy decode) » (`StoryModels.swift:678`) et il est la SOURCE du ratio de canvas — `StoryComposerViewModel+Elements.swift:86-89` :

```swift
static func canvasAspectRatio(forBackgroundOf effects: StoryEffects) -> Double? {
    guard let bg = effects.resolvedBackgroundMedia else { return nil }
    return clampedCanvasRatio(bg.aspectRatio)
}
```

Par ailleurs le commit B7 corrige le pivot du STICKER (`:203`) et du LIEU (`:241`) — « sans lui, la pastille revenait au centre » — mais laisse `StoryMediaObject.anchor` (pivot rotation/scale, `StoryModels.swift:681`) sans émission ni restitution : même défaut, non corrigé, sur la troisième famille.

**Défaut** : après un aller-retour v3, tout média revient en ratio carré et pivot centre ; un brouillon 16:9 rouvert recalcule son canvas à 1.0.

---

### 6. MAJEUR — Le `canvasAspectRatio` est absorbé sur le chemin BROUILLON, pas seulement à la publication : un composer 16:9 rouvre en portrait

`StoryEffectsCanvasAspectCodableTests` a été INVERSÉ par B7 :

```diff
-    @Test func encodeDecode_landscapeRatio_roundTrips() throws {
+    @Test func encode_landscapeRatio_isAbsorbedByTheAnchorRemap() throws {
-        #expect(decoded.canvasAspectRatio != nil)
+        #expect(decoded.canvasAspectRatio == nil)
+        #expect(decoded.canvasAspect == .portrait)
```

L'absorption est légitime pour le FIL (spec §C2/U20 : « `canvasAspectRatio` DISPARAÎT : le porteur garde son ratio intrinsèque, la scène letterboxe »). Elle ne l'est pas pour la persistance locale : `StoryDraftStore` emprunte le même `encode(to:)`, et le champ est activement écrit par le composer en trois points (`StoryComposerViewModel+Elements.swift:557`, `:656`, `:764`).

**Défaut** : l'unique encodeur sert deux contrats (fil sortant / brouillon local) et applique au second une règle écrite pour le premier ; combiné au constat 5, un réel 16:9 en cours de composition perd sa forme au premier autosave.

---

### 7. MAJEUR — O16 n'est pas tenu : le player monte un hôte qui ouvre des `AVPlayer` PRIVÉS, et la garde de source ne regarde que l'enveloppe

`MeeshyScenePlayer.swift:82-86` :

```swift
var host: StoryReaderRepresentable {
    StoryReaderRepresentable(story: storyItem,
                             preferredLanguages: languages,
                             mute: config.isMuted,
                             isPaused: !isPlaying)
}
```

L'hôte instancie des players privés :
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryBackgroundLayer.swift:803` `self.avPlayer = AVPlayer(playerItem: item)`
- `packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/Layers/StoryMediaLayer.swift:605` `let player = AVPlayer(playerItem: item)`

`SharedAVPlayerManager` n'apparaît nulle part sous `MeeshyUI/Story/` — sauf dans un COMMENTAIRE du player (`MeeshyScenePlayer.swift:65`). La garde censée l'attester ne lit que le répertoire du player (`ScenePlayerModeTests.swift:178-183`, `strippedSources()` → `Sources/MeeshyUI/Story/ScenePlayer`) :

```swift
func test_noPrivateAVPlayer_inTheScenePlayer() throws {
    let offenders = try Self.strippedLines().filter { $0.contains("AVPlayer(") }
```

Elle est vacuement verte : le fichier gardé ne mentionne jamais `AVPlayer`. `carrierMediaIdentity(in:sceneIndex:)` (`:67-76`) n'a AUCUN appelant de production (seuls `ScenePlayerModeTests.swift:106` et `:111`).

**Défaut** : la loi O16 du contrat lot B (« jamais d'AVPlayer privé, qui perdrait continuité, télémétrie WatchSample et arbitrage PlaybackCoordinator ») est déclarée par un commentaire et une clé exposée, pas réalisée — et la garde vérifie l'enveloppe, pas le signal.

---

### 8. MAJEUR — `ScenePlayerConfig.startsPaused` et `.loops` ne sont consultés par aucun chemin de rendu : l'invariant « né en pause » n'est pas contraint par le player

`ScenePlayerMode.swift:20-25` :

```swift
public init(mode: ScenePlayerMode) {
    self.startsPaused = true
    self.isMuted = mode == .card
    self.loops = mode == .card
    self.showsChrome = mode == .reader
}
```

Seul `isMuted` est câblé (`MeeshyScenePlayer.swift:85`). `startsPaused`, `loops` et `showsChrome` ne sont lus nulle part dans `MeeshyScenePlayer.body`/`host` ; la pause dépend entièrement du `Binding<Bool>` fourni par l'appelant (`isPaused: !isPlaying`, `:86`). Les 5 tests de règle (`ScenePlayerModeTests.swift:16-47`) n'assertent que le constructeur de config.

**Défaut** : un appelant qui passe `isPlaying: .constant(true)` obtient un canvas qui NAÎT en lecture, sans qu'aucune garde ne le relève — l'invariant du dépôt est testé sur une structure inerte, pas sur le composant.

---

### 9. MAJEUR — B5 laisse en place un résolveur CONTRADICTOIRE dans le même fichier, et les 3 appelants de production l'utilisent toujours

`packages/MeeshySDK/Sources/MeeshyUI/Story/Controls/AudioChipDisplay.swift:27-39` (existant, inchangé) :

```swift
public static func resolve(soundId: String?, title: String?, authorUsername: String?) -> AudioChipDisplay {
    guard soundId != nil else { return .waveform }
    …
    case (nil, nil):   return .waveform
```

`AudioChipDisplay.swift:47-58` (ajouté par B5) :

```swift
case .library:
    return .credit(title: libraryTitle, username: libraryUsername, duration: libraryDuration)
```

Sur la MÊME question — son emprunté sans métadonnées — `resolve` rend la note+onde et `backgroundAnnouncement` rend la forme crédit. Le plan Task B5 exige un « résolveur unique `AudioChipDisplay.resolve`, **promu** trois formats » (spec B3.4). Aucun appelant de production n'utilise le nouveau : `AudioForegroundChip.swift:185`, `StoryViewerView.swift:1785`, `StoryViewerView.swift:1796` appellent tous `resolve`.

**Défaut** : le lot ajoute un second résolveur au lieu de promouvoir l'unique, laissant le comportement fautif (note+onde à cache froid) en production, littéralement dix lignes au-dessus du correctif.

---

### 10. MAJEUR — La résilience de décodage n'existe pas sur le chemin v3 : un objet malformé fait tomber tout le post

Chemin v1 (`StoryModels.swift:1788-1794`) :

```swift
// Lossy per-element decode: one malformed object (another user's story)
// is skipped rather than dropping the whole collection …
textObjects = c.decodeLossyArrayIfPresent([StoryTextObject].self, forKey: .textObjects) ?? []
```

Chemin v3 (`StoryModels.swift:1745-1751`) :

```swift
if try c.decodeIfPresent(Int.self, forKey: .v) == 3 {
    let document = try CanvasV3(from: decoder)
```

`CanvasV3` est STRICT : `SceneV3.objects` est un tableau non tolérant, `ObjectV3` exige `id/kind/anchor/plane/z/transform/payload`, `ObjectAnchor.init(from:)` (`CanvasV3.swift:146`) jette sur un `t` inconnu. Le throw n'est rattrapé qu'en un point (`PostModels.swift:290-293`, `do { … } catch { storyEffects = nil }`) ; `FeedModels.swift:296` et `FeedModels.swift:714` décodent sans garde :

```swift
storyEffects = try c.decodeIfPresent(StoryEffects.self, forKey: .storyEffects)
```

La spec §C3 rév. 7 promet pourtant : « v3 au SCHÉMA invalide … servi TEL QUEL — le rendu client est best-effort (**résilience de décodage en place iOS**) ». La suite qui gardait cette tolérance a été rebasculée sur la seule forme v1 (`StoryDecodingResilienceTests.swift:30`, `encode(effects.runtimeSnapshot)`) sans jumelle v3.

**Défaut** : sous le drapeau d'écriture non encore armé (fenêtre B7-émet-avant-O15, nommée par la spec F5), un objet v3 hors schéma vide la story entière — au mieux — ou fait tomber le décodage du `FeedPost`/`RepostContent` porteur.

---

### 11. MAJEUR — Les ancres `.band` ne survivent à AUCUN aller-retour ; avec B7 la fixture gelée `reel-16x9-bands` se perd en la rouvrant

`CanvasV3Migration.swift:65-71` :

```swift
private func anchorPosition(_ anchor: ObjectAnchor) -> (x: Double, y: Double) {
    switch anchor {
    case .free(let x, let y): return (x, y)
    case .band(.top): return (0.5, CanvasBandAnchorY.top)
    case .band(.bottom): return (0.5, CanvasBandAnchorY.bottom)
```

et le retour ne connaît que `.free` (`:163`, `:183`, `:209`, `:236`, `:255` — toutes les familles émettent `anchor: .free(x:…, y:…)`). Les constantes provisoires sont bien nommées (`CanvasBandAnchorY.top/bottom = 0.08/0.92`, `:11-14`, exigence du plan respectée), mais la conversion est destructrice et à sens unique. Le test de round-trip ne l'attrape pas : `CanvasV3MigrationTests.swift:60-64` n'utilise que `v1-legacy-full.v3.json`, qui ne contient aucune ancre `.band` (vérifié : toutes ses ancres sont `{"t":"free"…}`).

**Défaut** : depuis B7, décoder puis réencoder un réel à bandes (fixture gelée `reel-16x9-bands.json`, dont B1 asserte les `.band(.top)`/`.band(.bottom)`) le convertit silencieusement en positions libres — l'édition d'un tel contenu détruit sa mise en page.

---

### 12. MAJEUR — Divergence de miroir non couverte par le golden : le kind `drawing` n'existe PAS dans le convertisseur gateway, et il décale les compteurs des objets suivants

`CanvasV3Migration.swift:225-234` produit un `ObjectV3(id: "drawing", kind: .drawing, …)` et incrémente `slot`. `services/gateway/src/services/posts/storyEffectsV3.ts` n'a AUCUNE branche `drawing` (vérifié : `grep -n "drawing"` → 0 occurrence). La table §C2 ne comporte pas non plus de ligne pour `drawingStrokes`.

Deux conséquences vérifiables :
1. le même blob v1 converti par le serveur (archive, O17 règle 2) perd son dessin, converti par le client il le garde — deux formes v3 différentes pour un même contenu, contre §A « la sortie du convertisseur v1→v3 est **octet-pour-octet le même JSON** que ce que publie un client neuf » ;
2. l'objet `drawing` consomme un rang de `slot` (`:227-228`) alors que le compteur `z++` du gateway ne le consomme pas — les ids de repli (`sticker-N`, `storyEffectsV3.ts:30` `` `${kind}-${fallbackZ}` ``) et les `z` de repli des objets suivants divergent dès qu'un blob v1 porte à la fois `drawingStrokes` et des objets sans `zIndex`.

---

### 13. MAJEUR — Divergence de miroir sur le sticker : `anchorPoint` FABRIQUÉ côté Swift, `baseSize` conditionnel

`CanvasV3Migration.swift:193-206` :

```swift
if sticker.baseSize != 140 { payload["baseSize"] = .number(sticker.baseSize) }
let hasLivingFields = sticker.baseSize != 140 || sticker.fadeIn != nil
    || sticker.fadeOut != nil || sticker.startTime != nil || sticker.duration != nil
if sticker.anchor == centerPivot {
    if hasLivingFields { payload["anchorPoint"] = .string("center") }
} else {
    payload["anchor"] = .object([…])
}
```

Le gateway, lui (`storyEffectsV3.ts:120-130`), recopie la clé v1 telle quelle :

```ts
...(typeof st.baseSize === 'number' ? { baseSize: st.baseSize } : {}),
...(str(st.anchorPoint) ? { anchorPoint: st.anchorPoint } : {}),
```

`StorySticker` n'a pas de champ `anchorPoint` (ses `CodingKeys` sont `id, emoji, x, y, scale, rotation, zIndex, baseSize, anchor, startTime, duration, fadeIn, fadeOut` — `StoryModels.swift:1135-1139`) : la valeur `"center"` est SYNTHÉTISÉE par une heuristique dont le commentaire admet la nature (`:197-199` « le runtime ne mémorise pas la présence de la clé v1 »). Contre-exemples immédiats, hors golden :
- sticker v1 `{baseSize: 300}` sans `anchorPoint` → gateway `{emoji, baseSize:300}` / Swift `{emoji, baseSize:300, anchorPoint:"center"}` ;
- sticker v1 `{baseSize: 140, anchorPoint:"center"}` → gateway `{emoji, baseSize:140, anchorPoint:"center"}` / Swift `{emoji}` ;
- sticker v1 `{anchorPoint:"topLeft"}` → gateway conserve `"topLeft"` / Swift ne peut pas le représenter.

Même classe pour le lieu : Swift ajoute `payload["anchor"]` (`:240-242`) que le gateway n'émet jamais (`storyEffectsV3.ts:140` `o.payload = { place: L.place ?? null }`).

**Défaut** : le pont n'est pas le miroir strict exigé — il reproduit le golden par construction et diverge sur tous les autres stickers/lieux.

---

### 14. MAJEUR — Divergence de miroir sur `mediaObjects` : le `muted` dérivé du volume disparaît

`storyEffectsV3.ts:102-116` :

```ts
const volume = typeof m.volume === 'number' ? m.volume : undefined;
const muted =
  typeof m.isMuted === 'boolean' ? m.isMuted
  : typeof m.muted === 'boolean' ? m.muted
  : volume !== undefined ? volume <= 0 : undefined;
```

`CanvasV3Migration.swift:174-181` :

```swift
var payload: [String: CanvasJSONValue] = [
    "postMediaId": …,
    "volume": .number(exactDouble(media.volume)),
    "muted": .bool(media.isMuted),
    "loop": .bool(media.loop),
    "isBackground": .bool(media.isBackground),
]
```

`StoryMediaObject` n'a AUCUNE propriété `isMuted` déclarée (ses `CodingKeys`, `StoryModels.swift:729-737`, listent `volume`, `mutedVolumeMemento`, pas `isMuted`) — `media.isMuted` est une propriété dérivée. Un média v1 `{"volume": 0}` sans clé `isMuted` : gateway ⇒ `muted: true` ; le runtime Swift le relit ensuite en `volume: muted ? 0 : volume` (`:507`). Les clés `loop`/`isBackground`/`volume` sont par ailleurs toujours émises côté Swift et conditionnelles côté gateway.

**Défaut** : deux formes v3 divergentes pour un même média v1, et la règle F10 (« `volume` est un champ VIVANT ») est mise en œuvre par deux logiques distinctes.

---

### 15. MINEUR — `timing.end` n'est jamais émis par le pont, alors que le convertisseur TS le mappe

`CanvasV3Migration.swift:73-77` :

```swift
private func timingV3(start: Double?, keyframes: [StoryKeyframe]?) -> TimingV3? {
    let frames = keyframes.map { $0.map(KeyframeV3.init(migrating:)) }
    guard start != nil || frames != nil else { return nil }
    return TimingV3(start: start, end: nil, rate: nil, keyframes: frames)
}
```

`storyEffectsV3.ts:23-24` :

```ts
if (typeof o.startTime === 'number') timing.start = o.startTime;
if (typeof o.endTime === 'number') timing.end = o.endTime;
```

Le champ `end` existe au contrat gelé (`CanvasV3.swift:185`, `canvas-v3.ts:23`). Le miroir est incomplet : un blob v1 portant `endTime` conserve sa borne côté serveur, pas côté client.

---

### 16. MINEUR — Divergence du `z` de repli : compteur d'insertion côté serveur, défaut de décodage côté client

`storyEffectsV3.ts:34` : `z: typeof o.zIndex === 'number' ? o.zIndex : fallbackZ` (compteur croissant). Côté Swift (`CanvasV3Migration.swift:164`, `:185`, `:210`, `:239`), `z: text.zIndex` / `media.zIndex` / `sticker.zIndex` / `location.zIndex` — non-optionnels avec défaut 0 au décodage (`StoryModels.swift:1173` `zIndex = try c.decodeIfPresent(Int.self, forKey: .zIndex) ?? 0`). Un blob v1 dont aucun objet ne porte de `zIndex` donne `z = 0,1,2,3…` au serveur et `z = 0,0,0,0` au client : ordre d'empilement différent selon le convertisseur. Seul l'objet `audio` reprend le repli-compteur côté Swift (`:257` `z: audio.zIndex ?? fallback`), parce que c'est le cas du golden.

---

### 17. MINEUR — Le kind `.reserved` est ré-encodé alors que le Zod gelé le REFUSE

`CanvasV3.swift:97` (`default: self = .reserved(wireValue)`) et `:110` (`case .reserved(let raw): return raw`) le ré-émettent tel quel. Le schéma gelé de lot A le refuse à l'écriture — `packages/shared/types/canvas-v3.ts:30-36` :

```ts
if ((RESERVED_KINDS as readonly string[]).includes(k)) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `KIND_RESERVED:${k}` });
} else if (!(ACTIVE_KINDS as readonly string[]).includes(k)) {
  ctx.addIssue({ code: z.ZodIssueCode.custom, message: `KIND_UNKNOWN:${k}` });
}
```

Combiné à la règle B7 (encode inconditionnel), un document contenant un kind réservé, une fois édité, part en `400 CANVAS_INVALID` sous `CANVAS_V3_WRITE_STRICT`. Le SDK ne borne pas non plus les plafonds du Zod (`scenes` max 10, `objects` max 60, `keyframes` max 60, `clipTransitions` max 30, `transform.scale` strictement positif, `timelineDuration` strictement positif, `locale` ≥ 2 caractères).

---

### 18. MINEUR — Le prédicat v3 diverge : `== 3` côté Swift, `v >= 3` côté gateway

`StoryModels.swift:1746` : `if try c.decodeIfPresent(Int.self, forKey: .v) == 3`. `storyEffectsV3.ts:346-347` :

```ts
const mark = (blob as { v?: unknown }).v;
const isV3Native = typeof mark === 'number' && mark >= 3;
```

Un document `v: 4` (champ additif v3.x prévu par §C1) serait servi tel quel à un client `caps ≥ 3` et retomberait côté iOS sur la branche legacy — donc sur un `StoryEffects` VIDE, le défaut exact que B7 était censé fermer. `CanvasV3.v` n'est par ailleurs jamais validé au décodage (`CanvasV3.swift:6`, `public let v: Int`).

---

### 19. MINEUR — `CanvasV3(migrating:)` produit toujours une scène, même sans aucun objet (O3 « jamais de cadre vide »)

`CanvasV3Migration.swift:287-293` construit inconditionnellement `SceneV3(id: "s1", objects: remapped, …)` puis `self.init(v: 3, scenes: [scene], sound: sound)` (`:318`). O3 : « `scenes: nil` tant qu'aucun objet visuel — **jamais de cadre vide** ». Le Zod l'accepte (`scenes: z.array(SceneV3Schema).min(1)` avec `objects` possiblement vide), donc rien ne l'attrape côté serveur. Défaut mirroré : `convertV1ToV3` fait de même (`storyEffectsV3.ts:173`).

---

### 20. MINEUR — Deux sérialiseurs contradictoires cohabitent : `toJSON()` reste, et reste testé sur sa forme v1

`StoryModels.swift:1984` `public func toJSON() -> [String: Any]` émet toujours les familles v1 (`dict["voiceAttachmentId"]` `:2004`, `dict["backgroundAudioVariants"]` `:2051`, `dict["textObjects"]` `:2056`) avec le commentaire « Automation de volume : sans cette sérialisation, les points posés par l'auteur seraient perdus à la publication » (`:2025-2026`). Aucun appelant de production (seuls `StoryModelsTests.swift:194`, `StoryVolumeKeyframeModelTests.swift:48`, `StoryTrackMuteToggleTests.swift:118`), mais trois suites vertes continuent d'asserter cette forme comme si elle gouvernait la publication, en contradiction directe avec la règle B7.

---

### 21. MINEUR — Commentaire de test devenu faux dans le même lot

`packages/MeeshySDK/Tests/MeeshyUITests/StoryDraftStoreTests.swift` (ajouté par `dbb658088`) :

```swift
/// Insère une ligne de slide brute, en contournant `store.save()` — celui-ci
/// n'émet aujourd'hui que du legacy, or ces suites ont besoin de seeder
/// aussi bien du legacy que du v3 déjà migré.
```

`d5d7e2dfe` (3 commits plus tard) rend `store.save()` émetteur de v3 (`StoryModels.swift:1830`). L'énoncé est faux à l'état final de la branche.

---

### 22. MINEUR — Ligne de spec §C2 sans implémentation dans AUCUN des deux miroirs

Table §C2 : « `locationObjects` → `kind:place, plane:fg` | **precision conservée** ». Ni `StoryLocationObject` (`StoryModels.swift:1217-1232`, `CodingKeys: id, place, x, y, scale, rotation, zIndex, anchor`) ni `SharedPlace` (`SharedPlace.swift:16-27`, `latitude, longitude, name, address, category, id`) ne portent de `precision`, et ni `storyEffectsV3.ts:138-142` ni `CanvasV3Migration.swift:236-249` ne l'émettent. Ligne de contrat morte, mirrorée des deux côtés.

---

### 23. MINEUR — `thumbHash` de slide disparaît du FIL (seul le brouillon a été rattrapé)

B7 déplace le `thumbHash` en méta du store (`StoryDraftStore.swift:421-436`) pour sauver la vignette de la carte de brouillon, mais `encode(to:)` cesse aussi de l'envoyer au SERVEUR (il était encodé, désormais dans `RuntimeSnapshot` seulement, `StoryModels.swift:1873`). `CanvasV3` n'a pas de logement pour lui.

**Défaut** : le placeholder ThumbHash d'une story publiée (`CachedAsyncImage`, `thumbHash:` sur quatre surfaces) n'est plus alimenté par la publication — le correctif n'a couvert qu'un des deux consommateurs.

---

## DÉCOMPTE

**23 constats, dont 4 BLOQUANTS** (n°1, 2, 3, 4), **10 MAJEURS** (n°5, 6, 7, 8, 9, 10, 11, 12, 13, 14) et **9 MINEURS** (n°15 à 23).

La racine commune des 4 bloquants et de 6 majeurs est unique : **la règle B7 « encode toujours v3 » a été appliquée avant que `CanvasV3` ait un logement pour tout ce que `StoryEffects` portait.** Le commit nomme trois pertes « fermées plutôt qu'entérinées » (dessin, pivot de lieu, empreinte) et deux « absorptions assumées » (ratio, stylage racine) — mais l'inventaire réel des champs perdus est plus large d'au moins dix entrées, dont trois lignes de la planche P2 que la spec §E déclare bloquantes.

---

## AXES BLANCHIS (vérifiés, rien trouvé)

- **Prisme / C6** — PROPRE. Aucune occurrence de `translations.first` ni d'équivalent dans le code ajouté (`grep` sur les 6 fichiers sources du lot). Le pont porte la map complète (`CanvasV3Migration.swift:353` `translations: object.payload.stringMap("translations")`) ; le player passe la chaîne du lecteur à l'hôte (`MeeshyScenePlayer.swift:83`) et le repli est l'ORIGINAL, jamais une traduction arbitraire (`ScenePlayerModeTests.swift:94-100`, prisme `["de"]` ⇒ `"Hello"`). Le cas critique du dépôt (règle 3, 2026-08-10) est testé et vert : prisme `["fr","en"]`, `locale: "en"`, traduction `fr` ⇒ `"Bonjour"`.
- **Karaoké / C7** — PROPRE. `StoryVoiceTranscription` est exactement `{language, content}` (`StoryModels.swift:174-182`) : `BackgroundSoundV3.Transcription` le porte sans perte, dans l'ordre, aller et retour (`CanvasV3Migration.swift:297-300` et `:443-445`), et les transcriptions seules suffisent à créer le `sound` (`:303`). Miroir exact de `storyEffectsV3.ts:181-198`.
- **Remap letterbox U20** — PROPRE. Formule identique au caractère près (`CanvasV3Migration.swift:49-63` vs `storyEffectsV3.ts:42-56`), même exclusion (`plane == .bg || kind == .media`, `:279-285` vs `:164-171`), même valeur de `SCENE_ASPECT = 9/16`, et le golden partagé l'atteste sur trois objets (`0.2 → 0.40507397198627443`, `0.7 → 0.563284018675817`, `0.85 → 0.6107470326826798`).
- **Champs vivants du texte (U21, famille texte)** — PROPRE. `textPayload` (`CanvasV3Migration.swift:321-359`) couvre l'intégralité des `CodingKeys` de `StoryTextObject` (32 clés vérifiées une à une), y compris `backgroundStyle`, `referenceUserId`, `isLocked` et `translations`.
- **Familles racine G3 (`stickers: [String]`, `filter`/`filterIntensity`)** — PROPRE. Ordre, cible du filtre et ids de repli identiques au gateway ; `sticker-3` et le filtre porté par le fond sont assertés par le golden.
- **`slideDuration` / `musicTrackId` ignorés** — PROPRE. Ni l'un ni l'autre n'apparaît dans `CanvasV3(migrating:)`, conformément à §C2.
- **Constantes `.band` provisoires nommées** — PROPRE. `enum CanvasBandAnchorY { static let top = 0.08 ; static let bottom = 0.92 }` (`CanvasV3Migration.swift:11-14`), documentées comme provisoires — exigence du plan Task B2 Step 3 respectée (le défaut est le sens unique, constat 11, pas le nommage).
- **Migration one-shot : deux points de lecture partagent UN décodeur** — PROPRE. `decodeSlideEffects` est appelé par `load()` (`StoryDraftStore.swift:759`) ET par `firstSlideEffects` (`:1026` `return blobs.compactMap(decodeSlideEffects).first`) ; le test du second site existe et est spécifique (`test_load_migratesV1Blob_secondReadSiteStillResolvesTitle`). La ligne déjà v3 n'est jamais réécrite (`isAlreadyV3`, testé par `test_load_alreadyV3Blob_leavesRowUntouched`). Le `db.write` de migration est bien HORS du `db.read` (`:735-745` puis `:786-794`) — pas d'imbrication GRDB.
- **Règle B7 « encode toujours v3 », côté chemins d'écriture** — PROPRE quant à la couverture. `encode(to:)` (`StoryModels.swift:1830`) est inconditionnel, ne consulte jamais `canvasV3`, et les trois écrivains réels y passent : `PostService.createStory` (`:479-480`), `PostService.update` (`:523`), autosave `StoryDraftStore`. Une composition FRAÎCHE encode bien `"v":3` (test `freshComposition_encodesV3_neverLegacyFamilies`), une mutation réencode l'édition (test `mutatedRuntime_reEncodesTheEdit_notTheServedDocument`). Aucun écrivain legacy résiduel sur le réseau (`toJSON()` n'a aucun appelant de production — constat 20 est une contradiction de test, pas un chemin d'écriture vivant).
- **Pureté SDK des composants neufs** — PROPRE. `MeeshyScenePlayer`, `ScenePlayerConfig`, `ScenePlayerMode` et `BackgroundAudioAnnouncement` ne prennent que des paramètres opaques (accent en hex, langues en `[String]`, métadonnées audio en paramètres) ; aucun `ThemeManager`, aucun `CacheCoordinator`, aucun `.shared` (`grep` vérifié sur les trois fichiers). `backgroundAnnouncement` est une fonction pure sans requête.
- **Garde anti-profondeur-de-type B4** — PRÉSENTE et non vacue sur son axe propre : le détecteur de fabrique générique porte un contrôle POSITIF (`test_guardDetectsAGenericViewFactory`) et un NÉGATIF (`test_guardAcceptsAPlainBody`), et les commentaires sont bien strippés avant filtrage (`strippingLineComments`). Elle est contraignante pour toute édition future du répertoire `ScenePlayer/`. (Sa limite est le périmètre, pas la méthode — constat 7.)
- **Cohérence P0 (axe 7)** — PROPRE. Les 6 commits maintiennent la planche dans le même commit que leur gate. Chaîne vérifiée : 10→11→12→13→14→15→16 sur 51 ; pourcentages 19,6/21,6/23,5/25,5/27,5/29,4/31,4 % exacts (n/51) ; degrés du camembert 70,6→77,6→84,7→91,8→98,8→105,9→112,9 exacts (n/51×360) ; le second secteur décroît symétriquement (35→34→33→32→31→30→29) et la somme des trois seaux reste 51 (317,6°/360×51 = 45 pour les deux premiers, 6 pour le troisième). Les comptes de tests annoncés correspondent aux fichiers : B1 8/8 (8 `@Test` dans `CanvasV3DecodingTests`), B2 4/4, B4 21/21 (14 règle + 7 garde, comptés un à un), B5 4/4, B7 5/5.
- **Fixtures gelées** — PROPRE. Aucune fixture de `packages/shared/fixtures/canvas-v3/` n'a été modifiée par les 6 commits (`git show --stat` sur chacun) : le gel A3 est respecté.
- **Périmètre de fichiers** — PROPRE. Aucun commit ne touche `apps/ios/project.yml` ni `project.pbxproj` (interdiction du plan, lot C ferme).
