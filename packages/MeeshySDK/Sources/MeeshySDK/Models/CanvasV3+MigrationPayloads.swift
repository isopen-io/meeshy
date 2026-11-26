import Foundation
import CoreGraphics

// Charges utiles v3 des objets migrés depuis StoryEffects.

extension CanvasV3 {
    static func mediaPayload(_ media: StoryMediaObject) -> [String: CanvasJSONValue] {
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
        // Le filtre PROPRE d'un média posé. Celui du fond est le filtre
        // de slide, posé plus loin sur le même objet.
        if !media.isBackground, let filter = nonEmpty(media.filter) { payload["filter"] = .string(filter) }
        if let adjustments = media.adjustments?.canvasPayload { payload["adjustments"] = adjustments } // #9175
        if let look = media.look?.canvasPayload { payload["look"] = look } // #13840 — auteur seulement
        if let duration = media.duration { payload["duration"] = .number(duration) }
        // **La clé sort quand la MESURE existe, pas quand la valeur diffère de 1**
        // — le test `!= 1` interrogerait la PROJECTION
        // (`measured ?? 1.0`) : il omettrait donc la clé pour un non-mesuré — ce
        // qui est juste — mais AUSSI pour un carré RÉELLEMENT mesuré, effaçant
        // à l'aller la seule distinction que cette clé existe pour créer. Le pont
        // d'en face lit la PRÉSENCE de la clé, comme le décodeur JSON : lui
        // taire un carré mesuré, c'est le lui rendre inconnu.
        if let measured = media.measuredAspectRatio { payload["aspectRatio"] = .number(measured) }
        if media.anchor != centerPivot { payload["anchor"] = pivotWire(media.anchor) }
        if let intrinsic = media.intrinsicDuration { payload["intrinsicDuration"] = .number(intrinsic) }
        if let memento = media.mutedVolumeMemento {
            payload["mutedVolumeMemento"] = .number(exactDouble(memento))
        }
        if let sourceStart = media.sourceStart { payload["sourceStart"] = .number(sourceStart) }
        if let sourceEnd = media.sourceEnd { payload["sourceEnd"] = .number(sourceEnd) }
        // **Le recadrage voyage en QUATRE fractions plates**, du même
        // style que ses voisines temporelles — et OMISES quand le cadre est
        // entier : « les décode-défauts sont omis, leur absence les restitue ».
        // Un objet imbriqué aurait demandé au payload une forme que le contrat
        // ne garantit pas ; quatre nombres passent partout.
        if let crop = media.crop, !crop.isFull {
            payload["cropX"] = .number(crop.x)
            payload["cropY"] = .number(crop.y)
            payload["cropW"] = .number(crop.width)
            payload["cropH"] = .number(crop.height)
        }
        if let ducking = media.isDuckingDisabled { payload["isDuckingDisabled"] = .bool(ducking) }
        if media.placement != "media" { payload["placement"] = .string(media.placement) }
        if let fadeIn = media.fadeIn { payload["fadeIn"] = .number(fadeIn) }
        if let fadeOut = media.fadeOut { payload["fadeOut"] = .number(fadeOut) }
        if let name = nonEmpty(media.name) { payload["name"] = .string(name) }
        if let thumbHash = nonEmpty(media.thumbHash) { payload["thumbHash"] = .string(thumbHash) }
        return payload
    }

    static func stickerPayload(_ sticker: StorySticker,
                                       anchorPoint: String?) -> [String: CanvasJSONValue] {
        // `wireEmoji`, jamais `emoji` : un sticker image parti sans repli
        // disparaît chez un lecteur qui ne rend que l'emoji.
        var payload: [String: CanvasJSONValue] = ["emoji": .string(sticker.wireEmoji)]
        // **Le GABARIT voyage, pas seulement son repli.**
        //
        // `wireEmoji` ci-dessus rend, pour un sticker à gabarit, l'emoji de
        // REPLI du catalogue. Un fil qui ne porterait que le repli d'une
        // décoration qu'il ne porte pas ferait revenir une pastille de lieu
        // publiée « 📍 », un cadre de cœurs « 💕 » : le composer dessine, le
        // lecteur rendrait un glyphe.
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
        // **Le mouvement voyage avec la décoration** — une propriété de
        // la charge, jamais un kind ; web et Android l'ignorent.
        if let animation = sticker.animation { payload["animation"] = .string(animation.rawValue) }
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

    static func audioPayload(_ audio: StoryAudioPlayerObject) -> [String: CanvasJSONValue] {
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
        if let createdAt = nonEmpty(audio.soundCreatedAt) { payload["soundCreatedAt"] = .string(createdAt) }
        if let name = nonEmpty(audio.name) { payload["name"] = .string(name) }
        if audio.volume != 1 { payload["volume"] = .number(exactDouble(audio.volume)) }
        if let memento = audio.mutedVolumeMemento {
            payload["mutedVolumeMemento"] = .number(exactDouble(memento))
        }
        if let sourceStart = audio.sourceStart { payload["sourceStart"] = .number(sourceStart) }
        if let sourceEnd = audio.sourceEnd { payload["sourceEnd"] = .number(sourceEnd) }
        // **La forme d'onde d'une note vocale** — ~80 échantillons figés à la
        // composition (`StoryModels.swift`), que la pastille audio peint
        // barre par barre. Sans eux, elle ne dessine RIEN : chaque lecteur voyait une bande VIDE sous une note
        // vocale posée sur la scène. Quatre-vingts nombres pour ne pas servir un
        // trou — le calcul n'a pas besoin d'être long.
        //
        // Omis quand le tableau est vide : une piste EMPRUNTÉE n'en porte pas
        // (`StoryAudioIdentity.showsWaveform` ne peint que l'enregistrement), et
        // son objet se réencode alors octet pour octet.
        if !audio.waveformSamples.isEmpty {
            payload["waveformSamples"] = .array(audio.waveformSamples.map { .number(exactDouble($0)) })
        }
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

    static func textPayload(_ text: StoryTextObject) -> [String: CanvasJSONValue] {
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
            ("textEffect", text.textEffect),
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
