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

private func anchorPosition(_ anchor: ObjectAnchor) -> (x: Double, y: Double) {
    switch anchor {
    case .free(let x, let y): return (x, y)
    case .band(.top): return (0.5, CanvasBandAnchorY.top)
    case .band(.bottom): return (0.5, CanvasBandAnchorY.bottom)
    }
}

private func timingV3(start: Double?, keyframes: [StoryKeyframe]?) -> TimingV3? {
    let frames = keyframes.map { $0.map(KeyframeV3.init(migrating:)) }
    guard start != nil || frames != nil else { return nil }
    return TimingV3(start: start, end: nil, rate: nil, keyframes: frames)
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
            slot += 1
            objects.append(ObjectV3(id: text.id, kind: .text,
                                    anchor: .free(x: text.x, y: text.y), plane: .fg,
                                    z: text.zIndex,
                                    transform: TransformV3(scale: text.scale, rotation: text.rotation, opacity: 1),
                                    timing: timingV3(start: text.startTime, keyframes: text.keyframes),
                                    locale: nonEmpty(text.sourceLanguage),
                                    payload: Self.textPayload(text)))
        }

        for media in effects.mediaObjects ?? [] {
            slot += 1
            var payload: [String: CanvasJSONValue] = [
                "postMediaId": media.postMediaId.isEmpty ? .null : .string(media.postMediaId),
                "volume": .number(exactDouble(media.volume)),
                "muted": .bool(media.isMuted),
                "loop": .bool(media.loop),
                "isBackground": .bool(media.isBackground),
            ]
            if let mediaURL = nonEmpty(media.mediaURL) { payload["mediaURL"] = .string(mediaURL) }
            if !media.mediaType.isEmpty { payload["mediaType"] = .string(media.mediaType) }
            if let duration = media.duration { payload["duration"] = .number(duration) }
            objects.append(ObjectV3(id: media.id, kind: .media,
                                    anchor: .free(x: media.x, y: media.y), plane: .content,
                                    z: media.zIndex,
                                    transform: TransformV3(scale: media.scale, rotation: media.rotation, opacity: 1),
                                    timing: timingV3(start: media.startTime, keyframes: media.keyframes),
                                    locale: nonEmpty(media.sourceLanguage),
                                    payload: payload))
        }

        for sticker in effects.stickerObjects ?? [] {
            slot += 1
            var payload: [String: CanvasJSONValue] = ["emoji": .string(sticker.emoji)]
            if sticker.baseSize != 140 { payload["baseSize"] = .number(sticker.baseSize) }
            // Golden partagé : un sticker PORTEUR (champ vivant, U21) déclare
            // son pivot (`anchorPoint`) ; un sticker nu reste `{emoji}` (G3
            // racine) — le runtime ne mémorise pas la présence de la clé v1.
            let hasLivingFields = sticker.baseSize != 140 || sticker.fadeIn != nil
                || sticker.fadeOut != nil || sticker.startTime != nil || sticker.duration != nil
            if sticker.anchor == centerPivot {
                if hasLivingFields { payload["anchorPoint"] = .string("center") }
            } else {
                payload["anchor"] = .object(["x": .number(Double(sticker.anchor.x)),
                                             "y": .number(Double(sticker.anchor.y))])
            }
            if let fadeIn = sticker.fadeIn { payload["fadeIn"] = .number(fadeIn) }
            if let fadeOut = sticker.fadeOut { payload["fadeOut"] = .number(fadeOut) }
            objects.append(ObjectV3(id: sticker.id, kind: .sticker,
                                    anchor: .free(x: sticker.x, y: sticker.y), plane: .fg,
                                    z: sticker.zIndex,
                                    transform: TransformV3(scale: sticker.scale, rotation: sticker.rotation, opacity: 1),
                                    timing: timingV3(start: sticker.startTime, keyframes: nil),
                                    payload: payload))
        }

        for emoji in effects.stickers ?? [] where !emoji.isEmpty {
            let fallback = slot
            slot += 1
            objects.append(ObjectV3(id: "sticker-\(fallback)", kind: .sticker,
                                    anchor: .free(x: 0.5, y: 0.5), plane: .fg,
                                    z: fallback, transform: TransformV3(),
                                    payload: ["emoji": .string(emoji)]))
        }

        if let strokes = effects.drawingStrokes, !strokes.isEmpty,
           let wire = wireArray(strokes) {
            let fallback = slot
            slot += 1
            objects.append(ObjectV3(id: "drawing", kind: .drawing,
                                    anchor: .free(x: 0.5, y: 0.5), plane: .fg,
                                    z: fallback, transform: TransformV3(),
                                    payload: ["strokes": .array(wire)]))
        }

        for location in effects.locationObjects {
            slot += 1
            var payload: [String: CanvasJSONValue] = [
                "place": wireObject(location.place).map(CanvasJSONValue.object) ?? .null,
            ]
            if location.anchor != centerPivot {
                payload["anchor"] = .object(["x": .number(Double(location.anchor.x)),
                                             "y": .number(Double(location.anchor.y))])
            }
            objects.append(ObjectV3(id: location.id, kind: .place,
                                    anchor: .free(x: location.x, y: location.y), plane: .fg,
                                    z: location.zIndex,
                                    transform: TransformV3(scale: location.scale, rotation: location.rotation, opacity: 1),
                                    payload: payload))
        }

        for audio in effects.audioPlayerObjects ?? [] {
            let fallback = slot
            slot += 1
            objects.append(ObjectV3(id: audio.id, kind: .audio,
                                    anchor: .free(x: Double(audio.x), y: Double(audio.y)), plane: .content,
                                    z: audio.zIndex ?? fallback,
                                    transform: TransformV3(),
                                    timing: timingV3(start: audio.startTime.map(exactDouble), keyframes: audio.keyframes),
                                    locale: nonEmpty(audio.sourceLanguage),
                                    payload: [
                                        "postMediaId": audio.postMediaId.isEmpty ? .null : .string(audio.postMediaId),
                                        "mediaURL": audio.mediaURL.map(CanvasJSONValue.string) ?? .null,
                                        "placement": .string(audio.placement),
                                    ]))
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
            timelineDuration: effects.timelineDuration)

        let transcriptions = (effects.voiceTranscriptions ?? [])
            .filter { !$0.language.isEmpty }
            .map { BackgroundSoundV3.Transcription(language: $0.language, content: $0.content) }
        let soundId = nonEmpty(effects.backgroundAudioId)
        let ownVoice = nonEmpty(effects.voiceAttachmentId)
        let sound: BackgroundSoundV3?
        if soundId != nil || ownVoice != nil || !transcriptions.isEmpty {
            sound = BackgroundSoundV3(
                source: soundId.map { .library(soundId: $0) } ?? .original,
                volume: soundId != nil || ownVoice != nil
                    ? effects.backgroundAudioVolume.map(exactDouble) ?? 1
                    : 1,
                bounds: effects.backgroundAudioStart != nil || effects.backgroundAudioEnd != nil
                    ? BackgroundSoundV3.Bounds(start: effects.backgroundAudioStart ?? 0,
                                               end: effects.backgroundAudioEnd ?? 0)
                    : nil,
                transcriptions: transcriptions.isEmpty ? nil : transcriptions)
        } else {
            sound = nil
        }

        self.init(v: 3, scenes: [scene], sound: sound)
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
        guard document.scenes.indices.contains(sceneIndex) else { return }
        let scene = document.scenes[sceneIndex]

        var texts: [StoryTextObject] = []
        var medias: [StoryMediaObject] = []
        var stickerFamily: [StorySticker] = []
        var locations: [StoryLocationObject] = []
        var audios: [StoryAudioPlayerObject] = []

        for object in scene.objects {
            let position = anchorPosition(object.anchor)
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
            case .mention, .reserved:
                continue
            }
        }

        textObjects = texts
        locationObjects = locations
        mediaObjects = medias.isEmpty ? nil : medias
        stickerObjects = stickerFamily.isEmpty ? nil : stickerFamily
        audioPlayerObjects = audios.isEmpty ? nil : audios

        let filterCarrier = scene.objects.first {
            $0.kind == .media && $0.plane == .content && $0.payload.string("filter") != nil
        } ?? scene.objects.first {
            $0.kind == .media && $0.plane == .bg && $0.payload.string("filter") != nil
        }
        filter = filterCarrier?.payload.string("filter")
        filterIntensity = filterCarrier?.payload.double("filterIntensity")

        timelineDuration = scene.timelineDuration
        openingWire = scene.opening
        opening = Self.transitionEffect(scene.opening)
        closingWire = scene.closing
        closing = Self.transitionEffect(scene.closing)
        clipTransitions = scene.clipTransitions.map {
            $0.compactMap { decodeWire(StoryClipTransition.self, from: $0) }
        }

        if let sound = document.sound {
            if case .library(let soundId) = sound.source { backgroundAudioId = soundId }
            backgroundAudioVolume = Float(sound.volume)
            backgroundAudioStart = sound.bounds?.start
            backgroundAudioEnd = sound.bounds?.end
            voiceTranscriptions = sound.transcriptions.map {
                $0.map { StoryVoiceTranscription(language: $0.language, content: $0.content) }
            }
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
        return StoryMediaObject(
            id: object.id,
            postMediaId: object.payload.string("postMediaId") ?? "",
            mediaURL: object.payload.string("mediaURL"),
            mediaType: object.payload.string("mediaType") ?? "image",
            aspectRatio: 1.0,
            x: position.x, y: position.y,
            scale: object.transform.scale, rotation: object.transform.rotation,
            volume: muted ? 0 : volume,
            isBackground: object.payload.bool("isBackground") ?? false,
            loop: object.payload.bool("loop") ?? false,
            zIndex: object.z,
            startTime: object.timing?.start,
            duration: object.payload.double("duration"),
            sourceLanguage: object.locale,
            keyframes: object.timing?.keyframes.map { $0.map(StoryKeyframe.init(rendering:)) })
    }

    private static func stickerObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StorySticker? {
        guard let emoji = object.payload.string("emoji") else { return nil }
        return StorySticker(
            id: object.id,
            emoji: emoji,
            x: position.x, y: position.y,
            scale: object.transform.scale, rotation: object.transform.rotation,
            zIndex: object.z,
            baseSize: object.payload.double("baseSize") ?? 140,
            anchor: pivotPoint(object.payload),
            startTime: object.timing?.start,
            fadeIn: object.payload.double("fadeIn"),
            fadeOut: object.payload.double("fadeOut"))
    }

    private static func locationObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryLocationObject? {
        guard let place = decodeWire(SharedPlace.self, from: object.payload.object("place")) else { return nil }
        return StoryLocationObject(
            id: object.id,
            place: place,
            x: position.x, y: position.y,
            scale: object.transform.scale, rotation: object.transform.rotation,
            zIndex: object.z,
            anchor: pivotPoint(object.payload))
    }

    private static func audioObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(
            id: object.id,
            postMediaId: object.payload.string("postMediaId") ?? "",
            placement: object.payload.string("placement") ?? "overlay",
            x: CGFloat(position.x), y: CGFloat(position.y),
            startTime: object.timing?.start.map { Float($0) },
            sourceLanguage: object.locale,
            keyframes: object.timing?.keyframes.map { $0.map(StoryKeyframe.init(rendering:)) },
            mediaURL: object.payload.string("mediaURL"))
        audio.zIndex = object.z
        return audio
    }
}
