import Foundation
import CoreGraphics

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
        var unpaintableObjects: [ObjectV3] = []
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
                // **Un fond RÉFÉRENCÉ (mediaId/postMediaId) entre dans le
                // runtime v1 comme un média de fond** — sans ce
                // ramage, un canvas qui adresse un enregistrement réel du
                // post par cette forme (`payload.mediaId`, servie par la
                // passerelle, jamais écrite par le composer) n'aurait aucun
                // représentant v1, et le LECTEUR (`StoryReaderRepresentable`,
                // via `resolvedBackgroundMedia`) n'aurait rien à peindre.
                // `CanvasV3RenderRules.mediaObject` normalise déjà les deux orthographes
                // (`ObjectV3.mediaReference`) sur `postMediaId` — le seul
                // champ que le résolveur du lecteur lit.
                if object.mediaReference != nil {
                    var fond = CanvasV3RenderRules.mediaObject(object, at: position)
                    fond.isBackground = true
                    fond.filter = nil
                    medias.append(fond)
                    // **Le collision guard** : ce MÊME
                    // objet porte à la fois la référence et le cadrage — le
                    // mémoriser permet au réencodage de replacer les deux sur
                    // lui plutôt que de fabriquer un second objet.
                    if object.payload.string("background") != nil || object.payload.object("transform") != nil {
                        wireBackgroundTransformCarrierId = object.id
                    }
                }
            case .media:
                let media = CanvasV3RenderRules.mediaObject(object, at: position)
                medias.append(media)
                // **Second passage** : après un premier
                // réencodage, l'objet élu ci-dessus revient en `plane:
                // content` et porte lui-même `transform`/`background`
                // dans son payload — le décoder ici referme la boucle sans
                // perdre le cadrage à chaque aller-retour supplémentaire.
                if media.isBackground {
                    if background == nil, let hex = object.payload.string("background") { background = hex }
                    if backgroundTransform == nil,
                       let transform = decodeWire(StoryBackgroundTransform.self,
                                                  from: object.payload.object("transform")) {
                        backgroundTransform = transform
                    }
                    if object.payload.string("background") != nil || object.payload.object("transform") != nil {
                        wireBackgroundTransformCarrierId = object.id
                    }
                }
            case .text:
                if let text = CanvasV3RenderRules.textObject(object, at: position) { texts.append(text) }
            case .sticker:
                if let sticker = CanvasV3RenderRules.stickerObject(object, at: position) { stickerFamily.append(sticker) }
            case .place:
                if let location = CanvasV3RenderRules.locationObject(object, at: position) { locations.append(location) }
            case .audio:
                audios.append(CanvasV3RenderRules.audioObject(object, at: position))
            case .drawing:
                drawingStrokes = decodeWireArray(StoryDrawingStroke.self,
                                                 from: object.payload.array("strokes"))
                drawingData = object.payload.string("data").flatMap { Data(base64Encoded: $0) }
            case .mention:
                // Kind CONNU que la scène ne peint pas : une mention est une
                // métadonnée, pas un objet. Ne JAMAIS le compter comme une
                // rupture — la sentinelle rougirait sur toute story qui cite
                // quelqu'un. Mémorisé quand même : sans `unpaintableObjects`, cette
                // métadonnée ne survivrait à AUCUN aller-retour par le cache du fil —
                // `migratedScene` n'aurait rien à réémettre.
                unpaintableObjects.append(object)
                continue
            case .reserved(let raw):
                // **Un kind d'un document plus récent que ce build.**
                // Le décodeur l'a gardé ; la conversion ne sait pas le loger.
                // Sans ce mémo, le lecteur peindrait la scène AMPUTÉE comme si
                // c'était la composition de l'auteur.
                unpaintable.append(raw)
                // **L'objet lui-même est mémorisé** : `wireUnpaintableKinds` ne nomme
                // que le KIND, pas assez pour que `migratedScene` le réémette — un tel
                // objet (poll, gif3d, …) disparaîtrait ENTIÈREMENT à chaque
                // aller-retour par le cache du fil.
                unpaintableObjects.append(object)
                continue
            }
        }

        textObjects = texts
        locationObjects = locations
        mediaObjects = medias.isEmpty ? nil : medias
        stickerObjects = stickerFamily.isEmpty ? nil : stickerFamily
        audioPlayerObjects = audios.isEmpty ? nil : audios
        wireUnpaintableKinds = unpaintable.isEmpty ? nil : Array(Set(unpaintable)).sorted()
        wireUnpaintableObjects = unpaintableObjects.isEmpty ? nil : unpaintableObjects
        wireBandEdge = bandEdges.isEmpty ? nil : bandEdges
        wireTimingEnd = timingEnds.isEmpty ? nil : timingEnds
        wireAnchorPoint = anchorPoints.isEmpty ? nil : anchorPoints

        // Le filtre de slide se relit sur le FOND seul ; le filtre d'un
        // média posé est rendu à cet objet par `mediaObject(_:at:)`.
        let filterCarrier = scene.objects.first {
            $0.kind == .media && $0.payload.bool("isBackground") == true && $0.payload.string("filter") != nil
        } ?? scene.objects.first {
            $0.kind == .media && $0.plane == .bg && $0.payload.string("filter") != nil
        }
        filter = filterCarrier?.payload.string("filter")
        filterIntensity = filterCarrier?.payload.double("filterIntensity")

        timelineDuration = scene.timelineDuration
        thumbHash = scene.thumbHash
        openingWire = scene.opening
        opening = CanvasV3RenderRules.transitionEffect(scene.opening)
        closingWire = scene.closing
        closing = CanvasV3RenderRules.transitionEffect(scene.closing)
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
}
