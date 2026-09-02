import Foundation
import CoreGraphics

// MARK: - Pont bidirectionnel StoryEffects ⇄ CanvasV3 (Task B2)
// Miroir strict de services/gateway/src/services/posts/storyEffectsV3.ts —
// le juge partagé est packages/shared/fixtures/canvas-v3/v1-legacy-full.v3.json.

/// Positions y PROVISOIRES des ancres `.band` au rendu, le temps que le moteur
/// runtime apprenne les bandes : une bande n'a pas de position libre, on la
/// projette près du bord haut/bas du canvas 9:16.
enum CanvasBandAnchorY {
    static let top: Double = 0.08
    static let bottom: Double = 0.92
}

private let sceneAspect = 9.0 / 16.0
private let centerPivot = CGPoint(x: 0.5, y: 0.5)

/// `Double(Float(0.6))` vaudrait 0.6000000238… — la représentation décimale la
/// plus courte restitue la valeur que le JSON d'origine portait.
private func exactDouble(_ value: Float) -> Double {
    Double("\(value)") ?? Double(value)
}

private func nonEmpty(_ value: String?) -> String? {
    value.flatMap { $0.isEmpty ? nil : $0 }
}

private func wireObject<T: Encodable>(_ value: T) -> [String: CanvasJSONValue]? {
    guard let data = try? JSONEncoder().encode(value) else { return nil }
    return try? JSONDecoder().decode([String: CanvasJSONValue].self, from: data)
}

private func wireArray<T: Encodable>(_ value: [T]) -> [CanvasJSONValue]? {
    guard let data = try? JSONEncoder().encode(value) else { return nil }
    return try? JSONDecoder().decode([CanvasJSONValue].self, from: data)
}

private func decodeWireArray<T: Decodable>(_ type: T.Type, from array: [CanvasJSONValue]?) -> [T]? {
    guard let array, let data = try? JSONEncoder().encode(array) else { return nil }
    return try? JSONDecoder().decode([T].self, from: data)
}

private func decodeWire<T: Decodable>(_ type: T.Type, from object: [String: CanvasJSONValue]?) -> T? {
    guard let object, let data = try? JSONEncoder().encode(object) else { return nil }
    return try? JSONDecoder().decode(type, from: data)
}

private func remapFreeAnchor(_ anchor: ObjectAnchor, carrierAspect: Double) -> ObjectAnchor {
    guard case .free(let x, let y) = anchor else { return anchor }
    guard carrierAspect.isFinite, carrierAspect > 0 else { return anchor }
    if carrierAspect > sceneAspect {
        let h = sceneAspect / carrierAspect
        let top = (1 - h) / 2
        return .free(x: x, y: top + y * h)
    }
    if carrierAspect < sceneAspect {
        let w = carrierAspect / sceneAspect
        let left = (1 - w) / 2
        return .free(x: left + x * w, y: y)
    }
    return anchor
}

/// L'INVERSE exact de `remapFreeAnchor`. Les deux sens sont affines et se
/// déduisent du seul `carrierAspect` : `y' = top + y·h` s'inverse en
/// `y = (y' − top) / h`. C'est ce qui rend l'aller-retour v1→v3→v1 FIDÈLE dès
/// lors que la scène a logé son porteur (révision de S8).
private func unmapFreeAnchor(_ anchor: ObjectAnchor, carrierAspect: Double) -> ObjectAnchor {
    guard case .free(let x, let y) = anchor else { return anchor }
    guard carrierAspect.isFinite, carrierAspect > 0 else { return anchor }
    if carrierAspect > sceneAspect {
        let h = sceneAspect / carrierAspect
        let top = (1 - h) / 2
        return .free(x: x, y: (y - top) / h)
    }
    if carrierAspect < sceneAspect {
        let w = carrierAspect / sceneAspect
        let left = (1 - w) / 2
        return .free(x: (x - left) / w, y: y)
    }
    return anchor
}

private func anchorPosition(_ anchor: ObjectAnchor) -> (x: Double, y: Double) {
    switch anchor {
    case .free(let x, let y): return (x, y)
    case .band(.top): return (0.5, CanvasBandAnchorY.top)
    case .band(.bottom): return (0.5, CanvasBandAnchorY.bottom)
    }
}

private func timingV3(start: Double?, end: Double?, keyframes: [StoryKeyframe]?) -> TimingV3? {
    let frames = keyframes.map { $0.map(KeyframeV3.init(migrating:)) }
    guard start != nil || end != nil || frames != nil else { return nil }
    return TimingV3(start: start, end: end, rate: nil, keyframes: frames)
}

private func pivotWire(_ pivot: CGPoint) -> CanvasJSONValue {
    .object(["x": .number(Double(pivot.x)), "y": .number(Double(pivot.y))])
}

private func wireAnchor(_ memo: [String: ObjectAnchor.Edge]?,
                        _ id: String,
                        x: Double,
                        y: Double) -> ObjectAnchor {
    memo?[id].map(ObjectAnchor.band) ?? .free(x: x, y: y)
}

private extension [String: CanvasJSONValue] {
    func string(_ key: String) -> String? {
        if case .string(let value)? = self[key] { return value }
        return nil
    }

    func double(_ key: String) -> Double? {
        if case .number(let value)? = self[key] { return value }
        return nil
    }

    func bool(_ key: String) -> Bool? {
        if case .bool(let value)? = self[key] { return value }
        return nil
    }

    func array(_ key: String) -> [CanvasJSONValue]? {
        if case .array(let value)? = self[key] { return value }
        return nil
    }

    func object(_ key: String) -> [String: CanvasJSONValue]? {
        if case .object(let value)? = self[key] { return value }
        return nil
    }

    func stringMap(_ key: String) -> [String: String]? {
        guard let object = object(key) else { return nil }
        let pairs = object.compactMap { entry -> (String, String)? in
            if case .string(let value) = entry.value { return (entry.key, value) }
            return nil
        }
        return pairs.isEmpty ? nil : [String: String](uniqueKeysWithValues: pairs)
    }
}

private extension KeyframeV3 {
    init(migrating keyframe: StoryKeyframe) {
        self.init(time: exactDouble(keyframe.time),
                  x: keyframe.x.map(Double.init),
                  y: keyframe.y.map(Double.init),
                  scale: keyframe.scale.map(Double.init),
                  opacity: keyframe.opacity.map(Double.init),
                  volume: keyframe.volume.map(exactDouble),
                  easing: keyframe.easing?.rawValue)
    }
}

private extension StoryKeyframe {
    init(rendering keyframe: KeyframeV3) {
        self.init(time: Float(keyframe.time),
                  x: keyframe.x.map { CGFloat($0) },
                  y: keyframe.y.map { CGFloat($0) },
                  scale: keyframe.scale.map { CGFloat($0) },
                  opacity: keyframe.opacity.map { CGFloat($0) },
                  volume: keyframe.volume.map { Float($0) },
                  easing: keyframe.easing.flatMap(StoryEasing.init(rawValue:)))
    }
}

private extension StoryEffects {
    /// Miroir du `z++` du convertisseur gateway : le rang d'un objet dont le
    /// blob v1 ne déclarait AUCUN `zIndex` est son rang d'insertion, jamais le
    /// 0 que le décodeur a posé.
    func wireZ(_ id: String, _ declared: Int?, _ fallback: Int) -> Int {
        guard let declared, wireMissingZIndex?.contains(id) != true else { return fallback }
        return declared
    }
}

// MARK: - Publication / migration : v1 runtime → v3

public extension CanvasV3 {
    init(migrating effects: StoryEffects) {
        var objects: [ObjectV3] = []
        var slot = 0

        if let background = nonEmpty(effects.background) {
            let fallback = slot
            slot += 1
            var payload: [String: CanvasJSONValue] = ["background": .string(background)]
            payload["transform"] = effects.backgroundTransform
                .flatMap(wireObject)
                .map(CanvasJSONValue.object) ?? .null
            objects.append(ObjectV3(id: "bg", kind: .media,
                                    anchor: .free(x: 0.5, y: 0.5), plane: .bg,
                                    z: fallback, transform: TransformV3(),
                                    payload: payload))
        }

        for text in effects.textObjects {
            let fallback = slot
            slot += 1
            objects.append(ObjectV3(id: text.id, kind: .text,
                                    anchor: wireAnchor(effects.wireBandEdge, text.id, x: text.x, y: text.y),
                                    plane: .fg,
                                    z: effects.wireZ(text.id, text.zIndex, fallback),
                                    transform: TransformV3(scale: text.scale, rotation: text.rotation, opacity: 1),
                                    timing: timingV3(start: text.startTime,
                                                     end: effects.wireTimingEnd?[text.id],
                                                     keyframes: text.keyframes),
                                    locale: nonEmpty(text.sourceLanguage),
                                    payload: Self.textPayload(text)))
        }

        for media in effects.mediaObjects ?? [] {
            let fallback = slot
            slot += 1
            objects.append(ObjectV3(id: media.id, kind: .media,
                                    anchor: wireAnchor(effects.wireBandEdge, media.id, x: media.x, y: media.y),
                                    plane: .content,
                                    z: effects.wireZ(media.id, media.zIndex, fallback),
                                    transform: TransformV3(scale: media.scale, rotation: media.rotation, opacity: 1),
                                    timing: timingV3(start: media.startTime,
                                                     end: effects.wireTimingEnd?[media.id],
                                                     keyframes: media.keyframes),
                                    locale: nonEmpty(media.sourceLanguage),
                                    payload: Self.mediaPayload(media)))
        }

        for sticker in effects.stickerObjects ?? [] {
            let fallback = slot
            slot += 1
            objects.append(ObjectV3(id: sticker.id, kind: .sticker,
                                    anchor: wireAnchor(effects.wireBandEdge, sticker.id, x: sticker.x, y: sticker.y),
                                    plane: .fg,
                                    z: effects.wireZ(sticker.id, sticker.zIndex, fallback),
                                    transform: TransformV3(scale: sticker.scale, rotation: sticker.rotation, opacity: 1),
                                    timing: timingV3(start: sticker.startTime,
                                                     end: effects.wireTimingEnd?[sticker.id],
                                                     keyframes: nil),
                                    locale: nonEmpty(sticker.sourceLanguage),
                                    payload: Self.stickerPayload(sticker,
                                                                 anchorPoint: effects.wireAnchorPoint?[sticker.id])))
        }

        for emoji in effects.stickers ?? [] where !emoji.isEmpty {
            let fallback = slot
            slot += 1
            objects.append(ObjectV3(id: "sticker-\(fallback)", kind: .sticker,
                                    anchor: .free(x: 0.5, y: 0.5), plane: .fg,
                                    z: fallback, transform: TransformV3(),
                                    payload: ["emoji": .string(emoji)]))
        }

        let strokes = effects.drawingStrokes ?? []
        let strokeWire = strokes.isEmpty ? nil : wireArray(strokes)
        let drawingData = effects.drawingData.flatMap { $0.isEmpty ? nil : $0.base64EncodedString() }
        if strokeWire != nil || drawingData != nil {
            let fallback = slot
            slot += 1
            var payload: [String: CanvasJSONValue] = [:]
            if let strokeWire { payload["strokes"] = .array(strokeWire) }
            if let drawingData { payload["data"] = .string(drawingData) }
            objects.append(ObjectV3(id: "drawing", kind: .drawing,
                                    anchor: .free(x: 0.5, y: 0.5), plane: .fg,
                                    z: fallback, transform: TransformV3(),
                                    payload: payload))
        }

        for location in effects.locationObjects {
            let fallback = slot
            slot += 1
            var payload: [String: CanvasJSONValue] = [
                "place": wireObject(location.place).map(CanvasJSONValue.object) ?? .null,
            ]
            if location.anchor != centerPivot { payload["anchor"] = pivotWire(location.anchor) }
            objects.append(ObjectV3(id: location.id, kind: .place,
                                    anchor: wireAnchor(effects.wireBandEdge, location.id,
                                                       x: location.x, y: location.y),
                                    plane: .fg,
                                    z: effects.wireZ(location.id, location.zIndex, fallback),
                                    transform: TransformV3(scale: location.scale, rotation: location.rotation, opacity: 1),
                                    timing: timingV3(start: nil,
                                                     end: effects.wireTimingEnd?[location.id],
                                                     keyframes: nil),
                                    locale: nonEmpty(location.sourceLanguage),
                                    payload: payload))
        }

        for audio in effects.audioPlayerObjects ?? [] {
            let fallback = slot
            slot += 1
            objects.append(ObjectV3(id: audio.id, kind: .audio,
                                    anchor: wireAnchor(effects.wireBandEdge, audio.id,
                                                       x: Double(audio.x), y: Double(audio.y)),
                                    plane: .content,
                                    z: effects.wireZ(audio.id, audio.zIndex, fallback),
                                    transform: TransformV3(),
                                    timing: timingV3(start: audio.startTime.map(exactDouble),
                                                     end: effects.wireTimingEnd?[audio.id],
                                                     keyframes: audio.keyframes),
                                    locale: nonEmpty(audio.sourceLanguage),
                                    payload: Self.audioPayload(audio)))
        }

        if let filter = nonEmpty(effects.filter) {
            let targetIndex = objects.firstIndex { $0.kind == .media && $0.plane == .content }
                ?? objects.firstIndex { $0.kind == .media && $0.plane == .bg }
            if let targetIndex {
                var payload = objects[targetIndex].payload
                payload["filter"] = .string(filter)
                if let intensity = effects.filterIntensity { payload["filterIntensity"] = .number(intensity) }
                objects[targetIndex] = objects[targetIndex].replacingPayload(payload)
            }
        }

        let remapped: [ObjectV3]
        if let carrierAspect = effects.canvasAspectRatio {
            remapped = objects.map { object in
                object.plane == .bg || object.kind == .media
                    ? object
                    : object.replacingAnchor(remapFreeAnchor(object.anchor, carrierAspect: carrierAspect))
            }
        } else {
            remapped = objects
        }

        let scene = SceneV3(
            id: "s1",
            objects: remapped,
            opening: effects.openingWire ?? effects.opening.map { ["type": .string($0.rawValue)] },
            closing: effects.closingWire ?? effects.closing.map { ["type": .string($0.rawValue)] },
            clipTransitions: effects.clipTransitions.map { $0.compactMap(wireObject) },
            timelineDuration: effects.timelineDuration,
            thumbHash: nonEmpty(effects.thumbHash),
            // Le ratio du porteur SURVIT (révision de S8). Le remap ci-dessus
            // est affine, donc inversible — à condition de savoir ce que valait
            // le porteur. Le jeter faisait de l'édition d'un ancien contenu une
            // perte sèche.
            carrierAspect: effects.canvasAspectRatio)

        let transcriptions = (effects.voiceTranscriptions ?? [])
            .filter { !$0.language.isEmpty }
            .map { BackgroundSoundV3.Transcription(language: $0.language, content: $0.content) }
        let variants = (effects.backgroundAudioVariants ?? [])
            .filter { !$0.postMediaId.isEmpty && !$0.language.isEmpty }
            .map { BackgroundSoundV3.Variant(postMediaId: $0.postMediaId,
                                             language: $0.language,
                                             isAutoGenerated: $0.isAutoGenerated) }
        let soundId = nonEmpty(effects.backgroundAudioId)
        let ownVoice = nonEmpty(effects.voiceAttachmentId)
        // `bounds` ne s'émet QUE comme un intervalle complet et valide (miroir
        // du convertisseur gateway durci, `storyEffectsV3.ts:234-250`, F7e).
        // Une seule borne présente (trim de début seul, ou de fin seul), ou un
        // intervalle inversé, dégrade en « pas de trim » (bounds nil = clip
        // entier) — jamais en `{start, end: 0}` refusé par
        // `BOUNDS_END_BEFORE_START` (`canvas-v3.ts:76-79`).
        let bounds: BackgroundSoundV3.Bounds?
        if let start = effects.backgroundAudioStart, let end = effects.backgroundAudioEnd, end >= start {
            bounds = BackgroundSoundV3.Bounds(start: start, end: end)
        } else {
            bounds = nil
        }

        let sound: BackgroundSoundV3?
        if soundId != nil || ownVoice != nil || !transcriptions.isEmpty {
            sound = BackgroundSoundV3(
                source: soundId.map { .library(soundId: $0) } ?? .original,
                volume: soundId != nil || ownVoice != nil
                    ? effects.backgroundAudioVolume.map(exactDouble) ?? 1
                    : 1,
                bounds: bounds,
                variants: variants.isEmpty ? nil : variants,
                transcriptions: transcriptions.isEmpty ? nil : transcriptions)
        } else {
            sound = nil
        }

        // O3 — un cadre n'existe que s'il PORTE quelque chose : objet, empreinte
        // (thumbHash calculé en aval du persist par la file hors-ligne), durée
        // ou transition. Un canvas réellement vide n'émet toujours aucune scène.
        let sceneCarriesSomething = !remapped.isEmpty
            || scene.thumbHash != nil
            || scene.timelineDuration != nil
            || scene.opening != nil
            || scene.closing != nil
            || scene.clipTransitions?.isEmpty == false
        self.init(v: 3, scenes: sceneCarriesSomething ? [scene] : [], sound: sound)
    }

    private static func mediaPayload(_ media: StoryMediaObject) -> [String: CanvasJSONValue] {
        var payload: [String: CanvasJSONValue] = [
            "postMediaId": media.postMediaId.isEmpty ? .null : .string(media.postMediaId),
        ]
        if let mediaURL = nonEmpty(media.mediaURL) { payload["mediaURL"] = .string(mediaURL) }
        if !media.mediaType.isEmpty { payload["mediaType"] = .string(media.mediaType) }
        // `muted` accompagne TOUJOURS un volume émis (miroir du dérivé
        // `volume <= 0` du convertisseur gateway) ; les décode-défauts sont
        // omis, leur absence les restitue.
        if media.volume != 1 {
            payload["volume"] = .number(exactDouble(media.volume))
            payload["muted"] = .bool(media.isMuted)
        }
        if media.loop { payload["loop"] = .bool(true) }
        if media.isBackground { payload["isBackground"] = .bool(true) }
        if let duration = media.duration { payload["duration"] = .number(duration) }
        if media.aspectRatio != 1 { payload["aspectRatio"] = .number(media.aspectRatio) }
        if media.anchor != centerPivot { payload["anchor"] = pivotWire(media.anchor) }
        if let intrinsic = media.intrinsicDuration { payload["intrinsicDuration"] = .number(intrinsic) }
        if let memento = media.mutedVolumeMemento {
            payload["mutedVolumeMemento"] = .number(exactDouble(memento))
        }
        if let sourceStart = media.sourceStart { payload["sourceStart"] = .number(sourceStart) }
        if let sourceEnd = media.sourceEnd { payload["sourceEnd"] = .number(sourceEnd) }
        if let ducking = media.isDuckingDisabled { payload["isDuckingDisabled"] = .bool(ducking) }
        if media.placement != "media" { payload["placement"] = .string(media.placement) }
        if let fadeIn = media.fadeIn { payload["fadeIn"] = .number(fadeIn) }
        if let fadeOut = media.fadeOut { payload["fadeOut"] = .number(fadeOut) }
        if let name = nonEmpty(media.name) { payload["name"] = .string(name) }
        if let thumbHash = nonEmpty(media.thumbHash) { payload["thumbHash"] = .string(thumbHash) }
        return payload
    }

    private static func stickerPayload(_ sticker: StorySticker,
                                       anchorPoint: String?) -> [String: CanvasJSONValue] {
        // `wireEmoji`, jamais `emoji` : un sticker image parti sans repli
        // disparaît chez un lecteur qui ne rend que l'emoji.
        var payload: [String: CanvasJSONValue] = ["emoji": .string(sticker.wireEmoji)]
        // **Le GABARIT voyage, pas seulement son repli** (#4741).
        //
        // `wireEmoji` ci-dessus rend, pour un sticker à gabarit, l'emoji de
        // REPLI du catalogue. Le fil portait donc soigneusement le repli d'une
        // décoration qu'il ne portait pas : une pastille de lieu publiée
        // revenait « 📍 », un cadre de cœurs « 💕 ». Le composer dessinait, le
        // lecteur rendait un glyphe.
        //
        // > Un repli conservé sans la chose dont il est le repli n'est plus un
        // > repli : c'est le contenu.
        //
        // Le repli RESTE émis — il sert le lecteur dont le build ne connaît pas
        // ce `templateId` (une décoration plus récente que lui), qui verra un
        // glyphe plutôt qu'un trou.
        if let templateId = nonEmpty(sticker.templateId) {
            payload["templateId"] = .string(templateId)
            if !sticker.slots.isEmpty {
                payload["slots"] = .object(sticker.slots.mapValues { CanvasJSONValue.string($0) })
            }
        }
        if let postMediaId = nonEmpty(sticker.postMediaId) {
            payload["postMediaId"] = .string(postMediaId)
        }
        if let provider = nonEmpty(sticker.provider) { payload["provider"] = .string(provider) }
        if sticker.baseSize != 140 { payload["baseSize"] = .number(sticker.baseSize) }
        // Le pivot NOMMÉ n'est jamais fabriqué : il est réémis quand le wire
        // le portait, sinon c'est le pivot LIBRE qui parle (clé `anchor`).
        if sticker.anchor == centerPivot {
            if let anchorPoint { payload["anchorPoint"] = .string(anchorPoint) }
        } else {
            payload["anchor"] = pivotWire(sticker.anchor)
        }
        if let fadeIn = sticker.fadeIn { payload["fadeIn"] = .number(fadeIn) }
        if let fadeOut = sticker.fadeOut { payload["fadeOut"] = .number(fadeOut) }
        if let duration = sticker.duration { payload["duration"] = .number(duration) }
        return payload
    }

    private static func audioPayload(_ audio: StoryAudioPlayerObject) -> [String: CanvasJSONValue] {
        var payload: [String: CanvasJSONValue] = [
            "postMediaId": audio.postMediaId.isEmpty ? .null : .string(audio.postMediaId),
            "mediaURL": audio.mediaURL.map(CanvasJSONValue.string) ?? .null,
            "placement": .string(audio.placement),
        ]
        // La PROVENANCE d'abord : sans `soundId`/`soundAuthorUsername`, une
        // piste empruntée revient du fil en son « original » et la chip ment.
        if let soundId = nonEmpty(audio.soundId) { payload["soundId"] = .string(soundId) }
        if let username = nonEmpty(audio.soundAuthorUsername) {
            payload["soundAuthorUsername"] = .string(username)
        }
        if let name = nonEmpty(audio.name) { payload["name"] = .string(name) }
        if audio.volume != 1 { payload["volume"] = .number(exactDouble(audio.volume)) }
        if let memento = audio.mutedVolumeMemento {
            payload["mutedVolumeMemento"] = .number(exactDouble(memento))
        }
        if let sourceStart = audio.sourceStart { payload["sourceStart"] = .number(sourceStart) }
        if let sourceEnd = audio.sourceEnd { payload["sourceEnd"] = .number(sourceEnd) }
        if let isBackground = audio.isBackground { payload["isBackground"] = .bool(isBackground) }
        if let loop = audio.loop { payload["loop"] = .bool(loop) }
        if let duration = audio.duration { payload["duration"] = .number(exactDouble(duration)) }
        if let fadeIn = audio.fadeIn { payload["fadeIn"] = .number(exactDouble(fadeIn)) }
        if let fadeOut = audio.fadeOut { payload["fadeOut"] = .number(exactDouble(fadeOut)) }
        if let variants = audio.backgroundAudioVariants, !variants.isEmpty,
           let wire = wireArray(variants) {
            payload["variants"] = .array(wire)
        }
        return payload
    }

    private static func textPayload(_ text: StoryTextObject) -> [String: CanvasJSONValue] {
        var payload: [String: CanvasJSONValue] = ["text": .string(text.text)]
        // Les décode-défauts (fontSize 64, fontFamily "system", pivot centre)
        // sont OMIS : leur absence les restitue à la relecture, exactement
        // comme dans le JSON v1 d'origine que le convertisseur gateway lit.
        if text.fontSize != 64 { payload["fontSize"] = .number(text.fontSize) }
        if text.fontFamily != "system" { payload["fontFamily"] = .string(text.fontFamily) }
        if text.anchor != centerPivot {
            payload["anchor"] = .object(["x": .number(Double(text.anchor.x)),
                                         "y": .number(Double(text.anchor.y))])
        }
        let strings: [(String, String?)] = [
            ("textStyle", text.textStyle), ("textColor", text.textColor),
            ("textAlign", text.textAlign), ("textBg", text.textBg),
            ("fontWeight", text.fontWeight), ("frameShape", text.frameShape),
            ("frameBorderColor", text.frameBorderColor), ("borderColor", text.borderColor),
            ("name", text.name), ("referenceUserId", text.referenceUserId),
        ]
        for (key, value) in strings {
            if let value { payload[key] = .string(value) }
        }
        let numbers: [(String, Double?)] = [
            ("framePaddingScale", text.framePaddingScale),
            ("frameBorderWidth", text.frameBorderWidth),
            ("borderWidth", text.borderWidth),
            ("duration", text.duration),
            ("fadeIn", text.fadeIn), ("fadeOut", text.fadeOut),
        ]
        for (key, value) in numbers {
            if let value { payload[key] = .number(value) }
        }
        if let isLocked = text.isLocked { payload["isLocked"] = .bool(isLocked) }
        if let translations = text.translations {
            payload["translations"] = .object(translations.mapValues(CanvasJSONValue.string))
        }
        if let style = text.backgroundStyle, let wire = wireObject(style) {
            payload["backgroundStyle"] = .object(wire)
        }
        return payload
    }
}

private extension ObjectV3 {
    func replacingPayload(_ payload: [String: CanvasJSONValue]) -> ObjectV3 {
        ObjectV3(id: id, kind: kind, anchor: anchor, plane: plane, z: z,
                 transform: transform, timing: timing, locale: locale, payload: payload)
    }

    func replacingAnchor(_ anchor: ObjectAnchor) -> ObjectV3 {
        ObjectV3(id: id, kind: kind, anchor: anchor, plane: plane, z: z,
                 transform: transform, timing: timing, locale: locale, payload: payload)
    }
}

// MARK: - Rendu : v3 → v1 runtime (une scène → un StoryEffects)

public extension StoryEffects {
    init(rendering document: CanvasV3, sceneIndex: Int) {
        self.init()
        restoreSound(document.sound)
        guard document.scenes.indices.contains(sceneIndex) else { return }
        let scene = document.scenes[sceneIndex]

        var texts: [StoryTextObject] = []
        var medias: [StoryMediaObject] = []
        var stickerFamily: [StorySticker] = []
        var locations: [StoryLocationObject] = []
        var audios: [StoryAudioPlayerObject] = []
        var bandEdges: [String: ObjectAnchor.Edge] = [:]
        var unpaintable: [String] = []
        var timingEnds: [String: Double] = [:]
        var anchorPoints: [String: String] = [:]

        // Le porteur d'origine, si la scène l'a logé, DÉFAIT le letterboxing que
        // l'aller avait appliqué — mêmes exclusions qu'à l'aller (le plan `bg`
        // et le porteur média n'avaient pas été remappés, ils ne sont pas
        // déremappés). Sans lui (`nil`), rien ne bouge : un document v3 natif
        // n'a jamais été letterboxé.
        canvasAspectRatio = scene.carrierAspect

        for object in scene.objects {
            let sourceAnchor: ObjectAnchor = {
                guard let aspect = scene.carrierAspect,
                      object.plane != .bg, object.kind != .media else { return object.anchor }
                return unmapFreeAnchor(object.anchor, carrierAspect: aspect)
            }()
            let position = anchorPosition(sourceAnchor)
            if case .band(let edge) = object.anchor { bandEdges[object.id] = edge }
            if let end = object.timing?.end { timingEnds[object.id] = end }
            if object.kind == .sticker, let point = object.payload.string("anchorPoint") {
                anchorPoints[object.id] = point
            }
            switch object.kind {
            case .media where object.plane == .bg:
                background = object.payload.string("background")
                backgroundTransform = decodeWire(StoryBackgroundTransform.self,
                                                 from: object.payload.object("transform"))
            case .media:
                medias.append(Self.mediaObject(object, at: position))
            case .text:
                if let text = Self.textObject(object, at: position) { texts.append(text) }
            case .sticker:
                if let sticker = Self.stickerObject(object, at: position) { stickerFamily.append(sticker) }
            case .place:
                if let location = Self.locationObject(object, at: position) { locations.append(location) }
            case .audio:
                audios.append(Self.audioObject(object, at: position))
            case .drawing:
                drawingStrokes = decodeWireArray(StoryDrawingStroke.self,
                                                 from: object.payload.array("strokes"))
                drawingData = object.payload.string("data").flatMap { Data(base64Encoded: $0) }
            case .mention:
                // Kind CONNU que la scène ne peint pas : une mention est une
                // métadonnée, pas un objet. Ne JAMAIS le compter comme une
                // rupture — la sentinelle rougirait sur toute story qui cite
                // quelqu'un.
                continue
            case .reserved(let raw):
                // **Un kind d'un document plus récent que ce build** (#4088).
                // Le décodeur l'a gardé ; la conversion ne sait pas le loger.
                // Sans ce mémo, le lecteur peindrait la scène AMPUTÉE comme si
                // c'était la composition de l'auteur.
                unpaintable.append(raw)
                continue
            }
        }

        textObjects = texts
        locationObjects = locations
        mediaObjects = medias.isEmpty ? nil : medias
        stickerObjects = stickerFamily.isEmpty ? nil : stickerFamily
        audioPlayerObjects = audios.isEmpty ? nil : audios
        wireUnpaintableKinds = unpaintable.isEmpty ? nil : Array(Set(unpaintable)).sorted()
        wireBandEdge = bandEdges.isEmpty ? nil : bandEdges
        wireTimingEnd = timingEnds.isEmpty ? nil : timingEnds
        wireAnchorPoint = anchorPoints.isEmpty ? nil : anchorPoints

        let filterCarrier = scene.objects.first {
            $0.kind == .media && $0.plane == .content && $0.payload.string("filter") != nil
        } ?? scene.objects.first {
            $0.kind == .media && $0.plane == .bg && $0.payload.string("filter") != nil
        }
        filter = filterCarrier?.payload.string("filter")
        filterIntensity = filterCarrier?.payload.double("filterIntensity")

        timelineDuration = scene.timelineDuration
        thumbHash = scene.thumbHash
        openingWire = scene.opening
        opening = Self.transitionEffect(scene.opening)
        closingWire = scene.closing
        closing = Self.transitionEffect(scene.closing)
        clipTransitions = scene.clipTransitions.map {
            $0.compactMap { decodeWire(StoryClipTransition.self, from: $0) }
        }
    }

    /// Le son vit au DOCUMENT, pas dans la scène : depuis O3 une publication
    /// purement sonore n'émet AUCUN cadre — la restitution doit donc précéder
    /// la garde de scène, sans quoi elle est sautée et le son disparaît.
    private mutating func restoreSound(_ sound: BackgroundSoundV3?) {
        guard let sound else { return }
        if case .library(let soundId) = sound.source { backgroundAudioId = soundId }
        backgroundAudioVolume = Float(sound.volume)
        backgroundAudioStart = sound.bounds?.start
        backgroundAudioEnd = sound.bounds?.end
        voiceTranscriptions = sound.transcriptions.map {
            $0.map { StoryVoiceTranscription(language: $0.language, content: $0.content) }
        }
        backgroundAudioVariants = sound.variants.map {
            $0.map { StoryAudioVariant(postMediaId: $0.postMediaId,
                                       language: $0.language,
                                       isAutoGenerated: $0.isAutoGenerated) }
        }
    }

    private static func transitionEffect(_ wire: [String: CanvasJSONValue]?) -> StoryTransitionEffect? {
        wire?.string("type").flatMap(StoryTransitionEffect.init(rawValue:))
    }

    private static func pivotPoint(_ payload: [String: CanvasJSONValue]) -> CGPoint {
        if payload.string("anchorPoint") == "center" { return centerPivot }
        guard let anchor = payload.object("anchor"),
              let x = anchor.double("x"), let y = anchor.double("y") else { return centerPivot }
        return CGPoint(x: x, y: y)
    }

    private static func textObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryTextObject? {
        guard let text = object.payload.string("text") else { return nil }
        var result = StoryTextObject(
            id: object.id,
            text: text,
            x: position.x, y: position.y,
            scale: object.transform.scale, rotation: object.transform.rotation,
            zIndex: object.z,
            anchor: pivotPoint(object.payload),
            fontSize: object.payload.double("fontSize") ?? 64,
            fontFamily: object.payload.string("fontFamily") ?? "system",
            textStyle: object.payload.string("textStyle"),
            textColor: object.payload.string("textColor"),
            textAlign: object.payload.string("textAlign"),
            textBg: object.payload.string("textBg"),
            backgroundStyle: decodeWire(StoryTextBackgroundStyle.self,
                                        from: object.payload.object("backgroundStyle")),
            fontWeight: object.payload.string("fontWeight"),
            frameShape: object.payload.string("frameShape"),
            framePaddingScale: object.payload.double("framePaddingScale"),
            frameBorderWidth: object.payload.double("frameBorderWidth"),
            frameBorderColor: object.payload.string("frameBorderColor"),
            borderColor: object.payload.string("borderColor"),
            borderWidth: object.payload.double("borderWidth"),
            translations: object.payload.stringMap("translations"),
            sourceLanguage: object.locale,
            startTime: object.timing?.start,
            duration: object.payload.double("duration"),
            fadeIn: object.payload.double("fadeIn"),
            fadeOut: object.payload.double("fadeOut"),
            isLocked: object.payload.bool("isLocked"),
            keyframes: object.timing?.keyframes.map { $0.map(StoryKeyframe.init(rendering:)) },
            name: object.payload.string("name"))
        result.referenceUserId = object.payload.string("referenceUserId")
        return result
    }

    private static func mediaObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryMediaObject {
        let muted = object.payload.bool("muted") ?? false
        let volume = object.payload.double("volume").map { Float($0) } ?? 1
        var media = StoryMediaObject(
            id: object.id,
            postMediaId: object.payload.string("postMediaId") ?? "",
            mediaURL: object.payload.string("mediaURL"),
            mediaType: object.payload.string("mediaType") ?? "image",
            placement: object.payload.string("placement") ?? "media",
            aspectRatio: object.payload.double("aspectRatio") ?? 1.0,
            x: position.x, y: position.y,
            scale: object.transform.scale, rotation: object.transform.rotation,
            anchor: pivotPoint(object.payload),
            volume: muted ? 0 : volume,
            isBackground: object.payload.bool("isBackground") ?? false,
            loop: object.payload.bool("loop") ?? false,
            zIndex: object.z,
            intrinsicDuration: object.payload.double("intrinsicDuration"),
            startTime: object.timing?.start,
            duration: object.payload.double("duration"),
            fadeIn: object.payload.double("fadeIn"),
            fadeOut: object.payload.double("fadeOut"),
            sourceLanguage: object.locale,
            keyframes: object.timing?.keyframes.map { $0.map(StoryKeyframe.init(rendering:)) },
            thumbHash: object.payload.string("thumbHash"),
            name: object.payload.string("name"),
            isDuckingDisabled: object.payload.bool("isDuckingDisabled"))
        media.mutedVolumeMemento = object.payload.double("mutedVolumeMemento").map { Float($0) }
        media.sourceStart = object.payload.double("sourceStart")
        media.sourceEnd = object.payload.double("sourceEnd")
        return media
    }

    private static func stickerObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StorySticker? {
        let postMediaId = object.payload.string("postMediaId") ?? ""
        guard let emoji = stickerEmoji(object.payload.string("emoji"),
                                       hasImage: !postMediaId.isEmpty,
                                       hasTemplate: !(object.payload.string("templateId") ?? "").isEmpty)
        else { return nil }
        // Symétrique de `stickerPayload` : sans ces deux clés, une décoration
        // revenait `.emoji` et se rendait comme son repli.
        let templateId = object.payload.string("templateId") ?? ""
        var slots: [String: String] = [:]
        for (clef, valeur) in (object.payload.object("slots") ?? [:]) {
            if case .string(let texte) = valeur { slots[clef] = texte }
        }
        return StorySticker(
            id: object.id,
            emoji: emoji,
            postMediaId: postMediaId,
            provider: object.payload.string("provider"),
            templateId: templateId,
            slots: slots,
            sourceLanguage: object.locale,
            x: position.x, y: position.y,
            scale: object.transform.scale, rotation: object.transform.rotation,
            zIndex: object.z,
            baseSize: object.payload.double("baseSize") ?? 140,
            anchor: pivotPoint(object.payload),
            startTime: object.timing?.start,
            duration: object.payload.double("duration"),
            fadeIn: object.payload.double("fadeIn"),
            fadeOut: object.payload.double("fadeOut"))
    }

    /// Un sticker image reste rendable même si l'écrivain d'en face n'a posé
    /// aucun repli emoji ; sans image ni emoji, il n'y a rien à rendre.
    /// `nil` ⇒ l'objet est REJETÉ. Un gabarit doit donc y survivre même sans
    /// emoji : `wireEmoji` en émet un, mais un document écrit par un autre
    /// client pourrait n'en porter aucun — et une décoration jetée pour un
    /// repli manquant serait perdue au lieu d'être dégradée (#4741).
    private static func stickerEmoji(_ wire: String?, hasImage: Bool, hasTemplate: Bool) -> String? {
        if hasImage { return nonEmpty(wire) ?? StorySticker.imageFallbackEmoji }
        if hasTemplate { return wire ?? "" }
        return wire
    }

    private static func locationObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryLocationObject? {
        guard let place = decodeWire(SharedPlace.self, from: object.payload.object("place")) else { return nil }
        return StoryLocationObject(
            id: object.id,
            place: place,
            x: position.x, y: position.y,
            scale: object.transform.scale, rotation: object.transform.rotation,
            zIndex: object.z,
            anchor: pivotPoint(object.payload),
            sourceLanguage: object.locale)
    }

    private static func audioObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(
            id: object.id,
            postMediaId: object.payload.string("postMediaId") ?? "",
            placement: object.payload.string("placement") ?? "overlay",
            x: CGFloat(position.x), y: CGFloat(position.y),
            volume: object.payload.double("volume").map { Float($0) } ?? 1,
            isBackground: object.payload.bool("isBackground"),
            backgroundAudioVariants: decodeWireArray(StoryAudioVariant.self,
                                                     from: object.payload.array("variants")),
            startTime: object.timing?.start.map { Float($0) },
            duration: object.payload.double("duration").map { Float($0) },
            loop: object.payload.bool("loop"),
            fadeIn: object.payload.double("fadeIn").map { Float($0) },
            fadeOut: object.payload.double("fadeOut").map { Float($0) },
            sourceLanguage: object.locale,
            name: object.payload.string("name"),
            keyframes: object.timing?.keyframes.map { $0.map(StoryKeyframe.init(rendering:)) },
            mediaURL: object.payload.string("mediaURL"),
            soundId: object.payload.string("soundId"),
            soundAuthorUsername: object.payload.string("soundAuthorUsername"))
        audio.zIndex = object.z
        audio.mutedVolumeMemento = object.payload.double("mutedVolumeMemento").map { Float($0) }
        audio.sourceStart = object.payload.double("sourceStart")
        audio.sourceEnd = object.payload.double("sourceEnd")
        return audio
    }
}
