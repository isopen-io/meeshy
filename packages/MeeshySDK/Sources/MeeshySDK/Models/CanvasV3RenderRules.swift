import Foundation
import CoreGraphics

// Règles pures v3 → v1 : une charge ObjectV3 devient un objet runtime.
// Corps recopiés de `StoryEffects` (CanvasV3Migration.swift), sans changement.
enum CanvasV3RenderRules {
    static func transitionEffect(_ wire: [String: CanvasJSONValue]?) -> StoryTransitionEffect? {
        wire?.string("type").flatMap(StoryTransitionEffect.init(rawValue:))
    }

    static func pivotPoint(_ payload: [String: CanvasJSONValue]) -> CGPoint {
        if payload.string("anchorPoint") == "center" { return centerPivot }
        guard let anchor = payload.object("anchor"),
              let x = anchor.double("x"), let y = anchor.double("y") else { return centerPivot }
        return CGPoint(x: x, y: y)
    }

    static func textObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryTextObject? {
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
            textEffect: object.payload.string("textEffect"),
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

    static func mediaObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryMediaObject {
        let muted = object.payload.bool("muted") ?? false
        let volume = object.payload.double("volume").map { Float($0) } ?? 1
        // Les quatre fractions ne se lisent qu'ENSEMBLE : trois sur quatre
        // décriraient un rectangle que personne n'a posé. Leur absence rend le
        // cadre entier, qui est le défaut.
        let crop: MediaCropRect? = {
            guard let x = object.payload.double("cropX"),
                  let y = object.payload.double("cropY"),
                  let w = object.payload.double("cropW"),
                  let h = object.payload.double("cropH") else { return nil }
            return MediaCropRule.clamped(MediaCropRect(x: x, y: y, width: w, height: h))
        }()
        var media = StoryMediaObject(
            id: object.id,
            // Site unique des deux orthographes (#6894) : `postMediaId`
            // (composer) et `mediaId` (passerelle) résolvent au MÊME champ v1.
            postMediaId: object.mediaReference ?? "",
            mediaURL: object.payload.string("mediaURL"),
            mediaType: object.payload.string("mediaType") ?? "image",
            placement: object.payload.string("placement") ?? "media",
            // **Aucun `?? 1.0` ici** (#5182, suivi de #5100) : le paramètre est
            // `Double?` SANS défaut, et l'absence de la clé DOIT traverser.
            // Le repli fabriquait une mesure que la charge ne portait pas —
            // `measuredAspectRatio` cessait donc d'être `nil`, et
            // `StoryItem.toRenderableSlide` sautait l'hydratation read-time
            // depuis `FeedMedia.width/height`, sa source de dimensionnement
            // PRIMAIRE. Un 1080×1920 s'affichait squishé en carré chez le
            // lecteur, sur le chemin que prend TOUT document v3.
            aspectRatio: object.payload.double("aspectRatio"),
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
        if !media.isBackground { media.filter = object.payload.string("filter") }
        media.adjustments = ImageAdjustments(canvasPayload: object.payload["adjustments"]) // #9175
        media.sourceStart = object.payload.double("sourceStart")
        media.sourceEnd = object.payload.double("sourceEnd")
        media.crop = crop
        return media
    }

    static func stickerObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StorySticker? {
        let postMediaId = object.payload.string("postMediaId") ?? ""
        let templateId = object.payload.string("templateId") ?? ""
        guard let emoji = stickerEmoji(object.payload.string("emoji"),
                                       hasImage: !postMediaId.isEmpty,
                                       templateId: templateId) else { return nil }
        return StorySticker(
            id: object.id,
            emoji: emoji,
            postMediaId: postMediaId,
            provider: object.payload.string("provider"),
            templateId: templateId,
            slots: object.payload.stringMap("slots") ?? [:],
            animation: object.payload.string("animation").flatMap(StickerAnimation.init(rawValue:)),
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
    ///
    /// Un sticker GABARIT sans repli reçoit celui que son gabarit déclare — ou
    /// le repli générique si ce binaire ne le connaît pas (#4819, #4741) — `nil` ⇒ l'objet est REJETÉ, et
    /// une décoration jetée pour un repli manquant serait perdue au lieu d'être
    /// dégradée.
    static func stickerEmoji(_ wire: String?, hasImage: Bool, templateId: String) -> String? {
        if let repli = nonEmpty(wire) { return repli }
        if !templateId.isEmpty {
            return StickerTemplateCatalog.fallbackEmoji(forTemplateID: templateId)
                ?? StorySticker.imageFallbackEmoji
        }
        return hasImage ? StorySticker.imageFallbackEmoji : wire
    }

    static func locationObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryLocationObject? {
        guard let place = decodeWire(SharedPlace.self, from: object.payload.object("place")) else { return nil }
        return StoryLocationObject(
            id: object.id,
            place: place,
            x: position.x, y: position.y,
            scale: object.transform.scale, rotation: object.transform.rotation,
            zIndex: object.z,
            anchor: pivotPoint(object.payload),
            sourceLanguage: object.locale,
            styleId: nonEmpty(object.payload.string("styleId")),
            startTime: object.timing?.start,
            duration: object.payload.double("duration"),
            fadeIn: object.payload.double("fadeIn"),
            fadeOut: object.payload.double("fadeOut"))
    }

    static func audioObject(_ object: ObjectV3, at position: (x: Double, y: Double)) -> StoryAudioPlayerObject {
        var audio = StoryAudioPlayerObject(
            id: object.id,
            postMediaId: object.payload.string("postMediaId") ?? "",
            placement: object.payload.string("placement") ?? "overlay",
            x: CGFloat(position.x), y: CGFloat(position.y),
            volume: object.payload.double("volume").map { Float($0) } ?? 1,
            waveformSamples: object.payload.array("waveformSamples")?
                .compactMap { if case .number(let v) = $0 { return Float(v) } else { return nil } } ?? [],
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
            soundAuthorUsername: object.payload.string("soundAuthorUsername"),
            soundCreatedAt: object.payload.string("soundCreatedAt"))
        audio.zIndex = object.z
        audio.scale = object.transform.scale == 1 ? nil : object.transform.scale
        audio.rotation = object.transform.rotation == 0 ? nil : object.transform.rotation
        audio.mutedVolumeMemento = object.payload.double("mutedVolumeMemento").map { Float($0) }
        audio.sourceStart = object.payload.double("sourceStart")
        audio.sourceEnd = object.payload.double("sourceEnd")
        return audio
    }
}
