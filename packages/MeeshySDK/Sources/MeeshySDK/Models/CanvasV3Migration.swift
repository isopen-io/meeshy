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

// MARK: - Publication / migration : v1 runtime → v3

public extension CanvasV3 {

    /// **Le plafond du contrat** (`canvas-v3.ts`, `scenes.min(1).max(10)`).
    ///
    /// Il est tenu ICI, avant le fil : une onzième scène ferait refuser le
    /// canvas EN BLOC par la passerelle — donc la publication entière serait
    /// perdue, pas seulement sa scène en trop.
    static let maxScenes = 10

    /// Une slide, une scène — ou `nil` quand elle ne porte rien (règle O3).
    ///
    /// Extrait de `init(migrating:)` pour qu'une publication
    /// puisse en produire PLUSIEURS. L'identité de la scène est un paramètre,
    /// et le son en est sorti — il appartient au DOCUMENT, pas à une
    /// scène, et le laisser ici en aurait fabriqué un par slide.
    static func migratedScene(_ effects: StoryEffects, id: String) -> SceneV3? {
        var objects: [ObjectV3] = []
        var slot = 0

        // **Le porteur du FOND existe dès que le fond a quelque chose à dire.**
        // Son existence conditionnée à la seule COULEUR perdrait
        // `backgroundTransform` — qui ne voyage QUE dans sa charge.
        //
        // Or le champ le plus utile de ce transform, `videoFitMode` (le cadrage
        // que le double-tap fond choisit : centré-letterbox ou plein cadre), ne
        // vaut que sur un fond MÉDIA, c'est-à-dire précisément là où une couleur
        // n'a aucune raison d'exister. La condition de perte et la condition
        // d'utilité du geste seraient la même : sur la surface document
        // (composer v3), `effects.background` reste nil — le `didSet` de
        // `backgroundColor` ne tire pas à l'initialisation et la chaîne de sync
        // de l'atelier n'y tourne pas —, donc le cadrage choisi n'atteindrait
        // JAMAIS le fil. Le lecteur retomberait sur l'auto, qui est `aspectFill` :
        // « l'image remplit toujours le canvas quoi qu'il arrive ».
        //
        // > **Un porteur dont l'existence dépend d'un seul de ses champs perd
        // > tous les autres en silence.** Rien ne rougit : l'objet n'est pas
        // > amputé, il n'est pas là.
        //
        // La clé `background` est donc conditionnelle — un fond média sans
        // couleur émet un porteur qui ne porte QUE son cadrage, et la relecture
        // (`background = payload.string("background")`) rend `nil`, ce qu'elle
        // rend en l'absence de porteur.
        let backgroundHex = nonEmpty(effects.background)
        let backgroundTransform = effects.backgroundTransform.flatMap { $0.isIdentity ? nil : $0 }
        // **Un objet référencé peut avoir porté LUI-MÊME le cadrage** —
        // `payload.mediaId`/`postMediaId` ET `payload.transform.videoFitMode`
        // sur le MÊME objet, forme servie par la passerelle.
        // `wireBackgroundTransformCarrierId` mémorise son id ;
        // tant que ce même id existe encore parmi `mediaObjects`, le cadrage
        // lui est replacé PLUS BAS (boucle `.media`) plutôt qu'ici — le
        // scinder en deux objets le dédoublerait (id neuf) ou l'effacerait
        // (id `"bg"`, déjà pris par le porteur réservé ci-dessous), les deux
        // défauts que ce détour évite. L'id n'existant plus (l'auteur a
        // supprimé l'objet référencé) retombe sur le porteur synthétique
        // habituel.
        let backgroundCarrierId = effects.wireBackgroundTransformCarrierId
        let backgroundCarrierStillPresent = backgroundCarrierId != nil
            && (effects.mediaObjects ?? []).contains { $0.id == backgroundCarrierId }
        // `"bg"` reste l'id RÉSERVÉ du porteur synthétique couleur/transform,
        // en garde de sécurité : aucun objet `mediaObjects` ne doit porter cet
        // id littéral quand ce porteur est émis, sans quoi la scène aurait
        // deux objets homonymes `"bg"`.
        let backgroundCarrierIdIsTaken = (effects.mediaObjects ?? []).contains { $0.id == "bg" }
        if !backgroundCarrierStillPresent, !backgroundCarrierIdIsTaken,
           backgroundHex != nil || backgroundTransform != nil {
            let fallback = slot
            slot += 1
            var payload: [String: CanvasJSONValue] = [:]
            if let backgroundHex { payload["background"] = .string(backgroundHex) }
            payload["transform"] = backgroundTransform
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
            var payload = Self.mediaPayload(media)
            // Le cadrage revient sur l'objet qui le portait déjà — voir le
            // commentaire de `backgroundCarrierStillPresent` plus haut.
            if backgroundCarrierStillPresent, media.id == backgroundCarrierId {
                if let backgroundHex { payload["background"] = .string(backgroundHex) }
                if let backgroundTransform {
                    payload["transform"] = wireObject(backgroundTransform).map(CanvasJSONValue.object) ?? .null
                }
            }
            objects.append(ObjectV3(id: media.id, kind: .media,
                                    anchor: wireAnchor(effects.wireBandEdge, media.id, x: media.x, y: media.y),
                                    plane: .content,
                                    z: effects.wireZ(media.id, media.zIndex, fallback),
                                    transform: TransformV3(scale: media.scale, rotation: media.rotation, opacity: 1),
                                    timing: timingV3(start: media.startTime,
                                                     end: effects.wireTimingEnd?[media.id],
                                                     keyframes: media.keyframes),
                                    locale: nonEmpty(media.sourceLanguage),
                                    payload: payload))
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
            // **Le gabarit qui DÉCORE la pastille** doit voyager.
            // Omis quand `nil` — toute pastille publiée sans gabarit se réencode
            // alors octet pour octet, et son repli reste celui que
            // `StoryLocationLayer` applique déjà.
            //
            // Ce champ est le FRÈRE de `templateId` sur un sticker, avec une
            // relation différente : un sticker EST son gabarit, un lieu en est
            // DÉCORÉ (`StickerTemplate.swift`, la ligne de partage). Deux noms
            // délibérés — ne pas les unifier.
            if let styleId = nonEmpty(location.styleId) { payload["styleId"] = .string(styleId) }
            // **La FENÊTRE TEMPORELLE voyage**, sur l'ENVELOPPE comme sur la charge :
            // `styleId`, trois lignes plus haut, voyage dans la CHARGE ; la question
            // « qu'est-ce qui part À CÔTÉ de ce que je viens de corriger ? » vaut aussi
            // pour l'enveloppe, dont le `start` ne doit pas être écrit en dur à `nil`
            // dans `timingV3`.
            //
            // Les trois autres clés suivent le sticker à la lettre — c'est la
            // MÊME famille temporelle (`TimelineClipKind.place`). Omises quand
            // `nil`, donc toute pastille posée sans fenêtre se réencode octet
            // pour octet, et sa barre reste le FANTÔME que la timeline rend
            // pour une fenêtre absente (le type qui le dessine vit dans `MeeshyUI` —
            // le nommer ici ferait fuir le plan dans la cible core, et une garde
            // le refuse à juste titre).
            if let duration = location.duration { payload["duration"] = .number(duration) }
            if let fadeIn = location.fadeIn { payload["fadeIn"] = .number(fadeIn) }
            if let fadeOut = location.fadeOut { payload["fadeOut"] = .number(fadeOut) }
            objects.append(ObjectV3(id: location.id, kind: .place,
                                    anchor: wireAnchor(effects.wireBandEdge, location.id,
                                                       x: location.x, y: location.y),
                                    plane: .fg,
                                    z: effects.wireZ(location.id, location.zIndex, fallback),
                                    transform: TransformV3(scale: location.scale, rotation: location.rotation, opacity: 1),
                                    timing: timingV3(start: location.startTime,
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
                                    // **La puce de son se PINCE et se TOURNE** —
                                    // `updateScale` / `updateRotation`
                                    // (`StoryCanvasUIView+Manipulation.swift`) les
                                    // écrivent pour les CINQ familles, audio compris.
                                    // Un `TransformV3()` par défaut jetterait les deux :
                                    // chaque lecteur verrait la puce à l'échelle 1,
                                    // sans angle. Le témoin d'exhaustivité couvre la seule famille
                                    // que personne n'avait regardée.
                                    // `TransformV3` ne sait pas dire « absent » :
                                    // le défaut du décodeur EST la valeur neutre
                                    // des deux côtés, donc `nil` s'émet en 1 / 0 et
                                    // se relit en `nil`. Une puce jamais pincée se
                                    // réencode ainsi octet pour octet, et un auteur
                                    // qui pose exactement 1,0 obtient `nil` — les
                                    // deux rendent le même pixel.
                                    transform: TransformV3(scale: audio.scale ?? 1,
                                                           rotation: audio.rotation ?? 0,
                                                           opacity: 1),
                                    timing: timingV3(start: audio.startTime.map(exactDouble),
                                                     end: effects.wireTimingEnd?[audio.id],
                                                     keyframes: audio.keyframes),
                                    locale: nonEmpty(audio.sourceLanguage),
                                    payload: Self.audioPayload(audio)))
        }

        // **Le filtre de SLIDE est celui du FOND.** La clé
        // `payload.filter` est partagée avec le filtre PROPRE d'un média posé
        // (`StoryMediaObject.filter`) : l'élire sur « le premier média content »
        // écraserait le réglage d'un objet placé devant le fond. Il va donc au
        // fond, et ne se replie que sur un média qui n'a pas le sien. Même
        // règle que le convertisseur gateway (`storyEffectsV3.ts`).
        if let filter = nonEmpty(effects.filter) {
            let targetIndex = objects.firstIndex { $0.kind == .media && $0.payload.bool("isBackground") == true }
                ?? objects.firstIndex { $0.kind == .media && $0.plane == .bg }
                ?? objects.firstIndex {
                    $0.kind == .media && $0.plane == .content && $0.payload.string("filter") == nil
                }
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

        // **Ce que le runtime v1 ne sait pas exprimer est réémis VERBATIM** :
        // un kind réservé ou une mention n'entre
        // dans aucune famille ci-dessus (`init(rendering:)` les saute), donc
        // rien ne les régénère depuis `effects` — ils ne survivent que par
        // cette restitution par IDENTITÉ. Déjà en coordonnées WIRE (jamais
        // dé-remappés à la lecture), ils rejoignent la scène APRÈS le remap
        // ci-dessus, pas avant, pour ne jamais subir une seconde transformation
        // affine. Un id déjà couvert par le runtime (l'auteur l'a remplacé)
        // cède la place — la restitution ne s'applique qu'à ce qu'aucune
        // famille éditable ne revendique.
        let knownIds = Set(objects.map(\.id))
        let preserved = (effects.wireUnpaintableObjects ?? []).filter { !knownIds.contains($0.id) }
        let finalObjects = remapped + preserved

        let scene = SceneV3(
            id: id,
            objects: finalObjects,
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

        // O3 — un cadre n'existe que s'il PORTE quelque chose : objet, empreinte
        // (thumbHash calculé en aval du persist par la file hors-ligne), durée
        // ou transition. Un canvas réellement vide n'émet toujours aucune scène.
        let sceneCarriesSomething = !finalObjects.isEmpty
            || scene.thumbHash != nil
            || scene.timelineDuration != nil
            || scene.opening != nil
            || scene.closing != nil
            || scene.clipTransitions?.isEmpty == false
        return sceneCarriesSomething ? scene : nil
    }

    /// **Le son de fond appartient au DOCUMENT**, jamais à une scène — c'est ce
    /// que dit `CanvasV3.sound`, à la racine. Une publication de dix slides a
    /// une seule bande-son.
    static func migratedSound(_ effects: StoryEffects) -> BackgroundSoundV3? {
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
        return sound
    }

    /// La forme historique : une slide, un canvas. Conservée telle quelle —
    /// c'est ce que la story publie, et ce que `StoryEffects.encode` appelait
    /// jusqu'ici.
    init(migrating effects: StoryEffects) {
        self.init(migrating: [effects])
    }

    /// **Une publication à plusieurs slides part avec TOUTES ses scènes**
    ///
    /// Le fil, le détail et le plein écran savent montrer plusieurs scènes :
    /// émettre `scenes: [scene]` — la seule slide courante — laisserait la
    /// mosaïque, le carrousel et le défilement vertical sans RIEN à peindre.
    /// C'est la forme la plus coûteuse du défaut « une vue sans consommateur » —
    /// quatre surfaces livrées, testées, correctes, et aucun site où rougir.
    ///
    /// Une slide qui ne porte rien n'émet pas de scène (O3, par slide) ; les
    /// suivantes ne se décalent pas pour autant.
    init(migrating slides: [StoryEffects], layout: MosaicLayoutMode? = nil) {
        let scenes = slides.prefix(CanvasV3.maxScenes).enumerated().compactMap { index, effects in
            CanvasV3.migratedScene(effects, id: "s\(index + 1)")
        }
        self.init(v: 3,
                  scenes: scenes,
                  // La PREMIÈRE bande-son trouvée gouverne la publication.
                  sound: slides.lazy.compactMap(CanvasV3.migratedSound).first,
                  layout: layout)
    }

    /// **Le runtime réécrit la PREMIÈRE scène ; le document mémorisé porte les
    /// autres** — la voie par laquelle une publication multi-scènes survit à
    /// l'encodage sans qu'aucun porteur du dépôt ne change de forme.
    ///
    /// `StoryEffects.encode` part du runtime courant, jamais du `canvasV3`
    /// mémorisé, et cette règle est juste : une composition neuve doit émettre
    /// l'état RÉEL du canvas, pas un document servi par le serveur. Elle ne
    /// dit pas tout : le runtime ne décrit qu'UNE slide, donc tout ce qui vit
    /// au-delà disparaîtrait.
    ///
    /// > **Rouvrir un post servi à trois scènes, changer son texte et
    /// > renvoyer en émettrait UNE** sans le document mémorisé.
    ///
    /// La disposition (`layout`) vient elle aussi du document : le runtime v1
    /// ne l'exprime pas, et la jeter à chaque aller-retour ramènerait tout le
    /// monde au défaut sans qu'aucun témoin ne tombe.
    ///
    /// **La scène 0 n'est pas fusionnée avec le document mémorisé.** Un merge
    /// par identité ne porterait plus qu'UN cas : un fond `plane: .bg` à
    /// référence média — et `StoryEffects.init(rendering:)` fait déjà entrer ce
    /// fond dans `mediaObjects`, d'où `migratedScene` ci-dessus le réémet
    /// lui-même, à identité égale. Le merge ne s'activerait donc que sur son cas
    /// PATHOLOGIQUE : un fond que l'auteur vient de retirer par
    /// `deleteElement` — auquel cas il RESSUSCITERAIT ce que l'auteur venait de
    /// supprimer à l'autosave suivant. Ne pas le fusionner ne perd rien que
    /// `init(rendering:)` ne couvre déjà.
    init(migrating effects: StoryEffects, keeping document: CanvasV3?) {
        let migree = CanvasV3.migratedScene(effects, id: "s1")
        let suivantes = Array((document?.scenes ?? []).dropFirst())
        let scenes = ([migree].compactMap { $0 } + suivantes).prefix(CanvasV3.maxScenes)
        self.init(v: 3,
                  scenes: Array(scenes),
                  sound: CanvasV3.migratedSound(effects) ?? document?.sound,
                  layout: document?.layout)
    }
}
