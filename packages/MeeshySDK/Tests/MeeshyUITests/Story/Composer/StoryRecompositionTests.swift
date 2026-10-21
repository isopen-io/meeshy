import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **« Composer » recrée une story à l'identique** (#9994).
///
/// Deux questions, deux moitiés de ce fichier. La RÈGLE (`StoryRecomposition`) :
/// la scène reprise garde-t-elle chaque couche — textes posés, stickers, effets,
/// tous les médias, sons — et rompt-elle avec les médias du post d'origine ? La
/// GRAINE (`StoryComposerSeed.scene`) : l'atelier s'ouvre-t-il sur cette scène,
/// avec chaque actif sous l'identité que la slide lui donne ?
@MainActor
final class StoryRecompositionTests: XCTestCase {

    // MARK: - Fixtures

    private func image(id: String, postMediaId: String = "", url: String? = nil) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: postMediaId, mediaURL: url, mediaType: "image", aspectRatio: 1.5,
                         x: 0.3, y: 0.4, scale: 0.8, rotation: 12, zIndex: 2)
    }

    private func video(id: String, url: String) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "pm-\(id)", mediaURL: url, mediaType: "video", aspectRatio: 0.5625,
                         duration: 4.5)
    }

    private func story(effects: StoryEffects? = nil,
                       media: [FeedMedia] = [],
                       content: String? = nil,
                       translations: [StoryTranslation]? = nil) -> StoryItem {
        StoryItem(id: "story-1", content: content, media: media, storyEffects: effects, translations: translations)
    }

    private func richStory() -> StoryItem {
        story(effects: StoryEffects(
            filter: "vivid",
            stickerObjects: [StorySticker(id: "st-emoji", emoji: "🔥"),
                             StorySticker(id: "st-image", emoji: "⭐️", postMediaId: "pm-sticker")],
            textObjects: [StoryTextObject(id: "tx-1", text: "Bonjour", x: 0.2, y: 0.7),
                          StoryTextObject(id: "credit", text: "Reposté de @ana", isLocked: true)],
            mediaObjects: [image(id: "m-1", postMediaId: "pm-a", url: "https://cdn.example/a.jpg"),
                           video(id: "v-1", url: "https://cdn.example/v.mp4")],
            audioPlayerObjects: [
                StoryAudioPlayerObject(id: "au-1", postMediaId: "pm-au",
                                       backgroundAudioVariants: [StoryAudioVariant(postMediaId: "pm-tts", language: "en")],
                                       mediaURL: "https://cdn.example/voice.m4a"),
                StoryAudioPlayerObject(id: "lib-1", mediaURL: "https://cdn.example/library.m4a", soundId: "sound-9")
            ],
            backgroundAudioVariants: [StoryAudioVariant(postMediaId: "pm-bg-tts", language: "es")]
        ),
        media: [FeedMedia(id: "pm-sticker", type: .image, url: "https://cdn.example/sticker.png")],
        content: "Coucher de soleil")
    }

    private func makeImage() -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 40, height: 40)).image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 40, height: 40))
        }
    }

    private func makeFile(_ name: String) throws -> URL {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryRecomposition-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let url = root.appendingPathComponent(name)
        try Data(repeating: 0x42, count: 1024).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return url
    }

    // MARK: - La RÈGLE — toutes les couches suivent

    func test_uneStoryAPlusieursObjets_garde_textes_stickers_effets_et_placement() throws {
        let scene = try XCTUnwrap(StoryRecomposition(story: richStory(), preferredLanguages: []))
        let effects = scene.slide.effects

        XCTAssertEqual(effects.textObjects.map(\.id), ["tx-1"])
        XCTAssertEqual(effects.textObjects.first?.x, 0.2)
        XCTAssertEqual(effects.stickerObjects?.map(\.id), ["st-emoji", "st-image"])
        XCTAssertEqual(effects.filter, "vivid")
        XCTAssertEqual(effects.mediaObjects?.map(\.id), ["m-1", "v-1"])
        XCTAssertEqual(effects.mediaObjects?.first?.rotation, 12)
        XCTAssertEqual(effects.mediaObjects?.last?.duration, 4.5,
                       "la timeline suit : la durée rognée par l'auteur d'origine est gardée")
        XCTAssertEqual(scene.description, "Coucher de soleil")
    }

    /// **Une publication NEUVE ne peut pas porter les médias d'un autre post** :
    /// le serveur ne rattache que les médias libres de l'auteur, et une scène
    /// empruntée se viderait à l'expiration de l'original.
    func test_chaqueMediaEstDetache_etListeAvecSonAdresse() throws {
        let scene = try XCTUnwrap(StoryRecomposition(story: richStory(), preferredLanguages: []))
        let effects = scene.slide.effects

        XCTAssertEqual(effects.mediaObjects?.map(\.postMediaId), ["", ""])
        XCTAssertEqual(effects.audioPlayerObjects?.map(\.postMediaId), ["", ""])
        XCTAssertEqual(effects.stickerObjects?.map(\.postMediaId), ["", ""])
        XCTAssertEqual(scene.assets.map(\.objectId), ["m-1", "v-1", "au-1", "st-image"])
        XCTAssertEqual(scene.assets.map(\.kind), [.image, .video, .audio, .stickerImage])
        XCTAssertEqual(scene.assets.last?.remoteURL, "https://cdn.example/sticker.png")
    }

    /// Le son EMPRUNTÉ à la bibliothèque n'a rien à téléverser — il reste servi
    /// par son adresse, comme dans toute composition.
    func test_unSonDeBibliotheque_resteEmprunte_sansActifARapatrier() throws {
        let scene = try XCTUnwrap(StoryRecomposition(story: richStory(), preferredLanguages: []))

        XCTAssertFalse(scene.assets.contains { $0.objectId == "lib-1" })
        let library = try XCTUnwrap(scene.slide.effects.audioPlayerObjects?.first { $0.id == "lib-1" })
        XCTAssertEqual(library.soundId, "sound-9")
        XCTAssertEqual(library.mediaURL, "https://cdn.example/library.m4a")
    }

    /// Ce qui appartient à la publication d'ORIGINE et ne se téléverse pas de
    /// nouveau part avec elle : pistes TTS, snapshot du fil, crédit verrouillé.
    func test_ceQuiAppartientALOriginal_neSuitPas() throws {
        let scene = try XCTUnwrap(StoryRecomposition(story: richStory(), preferredLanguages: []))
        let effects = scene.slide.effects

        XCTAssertNil(effects.backgroundAudioVariants)
        XCTAssertTrue(effects.audioPlayerObjects?.allSatisfy { $0.backgroundAudioVariants == nil } ?? false)
        XCTAssertNil(effects.canvasV3)
        XCTAssertFalse(effects.textObjects.contains { $0.isLocked == true },
                       "recomposer n'est pas republier : aucun badge n'est imposé")
    }

    func test_laSlideReprise_aUneIdentiteNeuve() throws {
        let scene = try XCTUnwrap(StoryRecomposition(story: richStory(), preferredLanguages: []))
        XCTAssertNotEqual(scene.slide.id, "story-1")
        XCTAssertNil(scene.slide.mediaURL)
    }

    func test_laDescription_descendLePrisme() throws {
        let traduite = story(effects: StoryEffects(textObjects: [StoryTextObject(text: "x")]),
                             content: "Sunset",
                             translations: [StoryTranslation(language: "fr", content: "Coucher de soleil")])
        XCTAssertEqual(StoryRecomposition(story: traduite, preferredLanguages: ["fr"])?.description,
                       "Coucher de soleil")
        XCTAssertEqual(StoryRecomposition(story: traduite, preferredLanguages: ["de"])?.description, "Sunset")
    }

    /// La forme LEGACY — un média seul, sans objet de scène — devient le FOND.
    func test_uneStoryLegacy_sonImageDevientLeFond_sousLIdDeSlide() throws {
        let legacy = story(media: [FeedMedia(id: "pm-1", type: .image, url: "https://cdn.example/bg.jpg")])
        let scene = try XCTUnwrap(StoryRecomposition(story: legacy, preferredLanguages: []))

        XCTAssertEqual(scene.assets, [StoryRecomposition.Asset(objectId: scene.slide.id,
                                                               kind: .backgroundImage,
                                                               remoteURL: "https://cdn.example/bg.jpg")])
    }

    // MARK: - La RÈGLE — ce qu'elle refuse

    func test_uneStoryVide_nOffreRien() {
        XCTAssertNil(StoryRecomposition(story: story(), preferredLanguages: []))
    }

    /// Un média sans adresse ne se rapatrie pas : la scène se refuse plutôt que
    /// de s'ouvrir amputée.
    func test_unMediaSansAdresse_refuseLaScene() {
        let orphan = story(effects: StoryEffects(mediaObjects: [image(id: "m-1", postMediaId: "pm-absent")]))
        XCTAssertNil(StoryRecomposition(story: orphan, preferredLanguages: []))
    }

    // MARK: - La GRAINE de scène

    func test_laGraine_poseLaSceneEntiere_avecSesActifs() throws {
        let recomposition = try XCTUnwrap(StoryRecomposition(story: richStory(), preferredLanguages: []))
        let bitmap = makeImage()
        let seed = try XCTUnwrap(StoryComposerSeed.scene(
            recomposition,
            images: ["m-1": bitmap, "st-image": bitmap],
            files: ["v-1": try makeFile("v.mp4"), "au-1": try makeFile("voice.m4a")]
        ))
        guard case .scene(let posed)? = seed.payload else { return XCTFail("graine de scène attendue") }
        addTeardownBlock {
            for url in Array(posed.videoURLs.values) + Array(posed.audioURLs.values) {
                try? FileManager.default.removeItem(at: url)
            }
        }

        let sut = StoryComposerViewModel(seeding: seed)

        XCTAssertEqual(sut.slides.count, 1)
        XCTAssertEqual(sut.currentSlide.effects.textObjects.map(\.id), ["tx-1"])
        XCTAssertEqual(sut.currentSlide.effects.mediaObjects?.map(\.id), ["m-1", "v-1"])
        XCTAssertTrue(sut.loadedImages["m-1"] === bitmap)
        XCTAssertEqual(sut.loadedVideoURLs["v-1"]?.lastPathComponent, "v-1.mp4",
                       "la vidéo est COPIÉE sous l'identité que la slide lui donne")
        XCTAssertNotNil(sut.loadedAudioURLs["au-1"])
        XCTAssertEqual(sut.currentSlide.content, "Coucher de soleil")
        XCTAssertTrue(sut.isSeededSession)
        XCTAssertNil(sut.repostOfId, "recomposer n'est pas republier")
    }

    func test_laGraine_refuseUneSceneAmputee() throws {
        let recomposition = try XCTUnwrap(StoryRecomposition(story: richStory(), preferredLanguages: []))
        let bitmap = makeImage()

        XCTAssertNil(StoryComposerSeed.scene(recomposition,
                                             images: ["m-1": bitmap],
                                             files: ["au-1": try makeFile("voice.m4a")]),
                     "sans sa vidéo, la scène n'est plus celle de la story")
    }

    /// L'image d'un sticker absente ne refuse rien : son emoji le peint, comme
    /// chez tout lecteur à qui l'image manque.
    func test_laGraine_seContenteDeLEmojiDUnStickerSansImage() throws {
        let recomposition = try XCTUnwrap(StoryRecomposition(story: richStory(), preferredLanguages: []))
        let seed = StoryComposerSeed.scene(
            recomposition,
            images: ["m-1": makeImage()],
            files: ["v-1": try makeFile("v.mp4"), "au-1": try makeFile("voice.m4a")]
        )
        if case .scene(let posed)? = seed?.payload {
            addTeardownBlock {
                for url in Array(posed.videoURLs.values) + Array(posed.audioURLs.values) {
                    try? FileManager.default.removeItem(at: url)
                }
            }
        }
        XCTAssertNotNil(seed)
    }

    /// Un sticker ANIMÉ garde ses octets : sans eux, la publication téléverse la
    /// seule image fixe et le sticker repart figé.
    func test_laGraine_gardeLesOctetsAnimesDUnSticker_etPasCeuxDUnAutreObjet() throws {
        let recomposition = try XCTUnwrap(StoryRecomposition(story: richStory(), preferredLanguages: []))
        let gif = Data("GIF89a-anime".utf8)
        let seed = try XCTUnwrap(StoryComposerSeed.scene(
            recomposition,
            images: ["m-1": makeImage(), "st-image": makeImage()],
            files: ["v-1": try makeFile("v.mp4"), "au-1": try makeFile("voice.m4a")],
            stickerAnimations: ["st-image": gif, "m-1": gif]
        ))
        guard case .scene(let posed)? = seed.payload else { return XCTFail("graine de scène attendue") }
        addTeardownBlock {
            for url in Array(posed.videoURLs.values) + Array(posed.audioURLs.values) {
                try? FileManager.default.removeItem(at: url)
            }
        }

        let sut = StoryComposerViewModel(seeding: seed)

        XCTAssertEqual(sut.loadedStickerAnimations["st-image"], gif)
        XCTAssertNil(sut.loadedStickerAnimations["m-1"],
                     "seul un sticker de la scène porte des octets animés")
    }

    func test_laGraineLegacy_poseLeFondDansSlideImages() throws {
        let legacy = story(media: [FeedMedia(id: "pm-1", type: .image, url: "https://cdn.example/bg.jpg")],
                           content: "Plage")
        let recomposition = try XCTUnwrap(StoryRecomposition(story: legacy, preferredLanguages: []))
        let bitmap = makeImage()

        let sut = StoryComposerViewModel(seeding: try XCTUnwrap(
            StoryComposerSeed.scene(recomposition, images: [recomposition.slide.id: bitmap], files: [:])
        ))

        XCTAssertTrue(sut.imageForCurrentSlide() === bitmap,
                      "`runStoryUpload` n'envoie un fond que depuis `slideImages[slide.id]`")
        XCTAssertTrue(sut.hasBackgroundImage)
    }

    // MARK: - Le FOND d'une story d'autrui est figé (#9994)

    /// Une story d'AUTRUI avec un fond coloré, un média de fond et un premier plan.
    private func backgroundScene(locks: Bool) throws -> StoryComposerViewModel {
        var bg = image(id: "bg", postMediaId: "pm-bg", url: "https://cdn.example/bg.jpg")
        bg.isBackground = true
        let source = story(effects: StoryEffects(
            background: "#112233",
            filter: "vivid",
            textObjects: [StoryTextObject(id: "tx-1", text: "Bonjour")],
            mediaObjects: [bg, image(id: "fg", postMediaId: "pm-fg", url: "https://cdn.example/fg.jpg")]
        ))
        let recomposition = try XCTUnwrap(StoryRecomposition(story: source, preferredLanguages: []))
        let seed = try XCTUnwrap(StoryComposerSeed.scene(
            recomposition,
            images: ["bg": makeImage(), "fg": makeImage()],
            files: [:],
            locksBackground: locks
        ))
        return StoryComposerViewModel(seeding: seed)
    }

    func test_fondFige_laPaletteNeLeRecolorePas() throws {
        let sut = try backgroundScene(locks: true)

        sut.applyBackground(hex: "#FFFFFF")
        sut.clearBackground()

        XCTAssertEqual(sut.currentSlide.effects.background, "#112233")
    }

    func test_fondFige_aucuneEcritureEnBlocNeLeModifie() throws {
        let sut = try backgroundScene(locks: true)
        var touched = sut.currentSlide
        touched.effects.filter = "mono"
        touched.effects.backgroundTransform = StoryBackgroundTransform(scale: 3)
        touched.effects.mediaObjects?[0].x = 0.9

        sut.currentSlide = touched

        XCTAssertEqual(sut.currentSlide.effects.filter, "vivid")
        XCTAssertNil(sut.currentSlide.effects.backgroundTransform?.scale)
        XCTAssertEqual(sut.currentSlide.effects.resolvedBackgroundMedia?.x, 0.3)
    }

    func test_fondFige_ilNeSeSupprimeNiNeSeRetrograde() throws {
        let sut = try backgroundScene(locks: true)

        sut.deleteElement(id: "bg")
        sut.toggleBackground(id: "bg")
        sut.toggleBackground(id: "fg")

        XCTAssertEqual(sut.currentSlide.effects.resolvedBackgroundMedia?.id, "bg")
        XCTAssertEqual(sut.currentSlide.effects.mediaObjects?.filter(\.isBackground).map(\.id), ["bg"])
    }

    func test_fondFige_lePremierPlanEtLesTextesRestentLibres() throws {
        let sut = try backgroundScene(locks: true)

        var moved = sut.currentSlide
        moved.effects.mediaObjects?[1].x = 0.8
        moved.effects.textObjects.append(StoryTextObject(id: "tx-2", text: "Salut"))
        sut.currentSlide = moved
        sut.deleteElement(id: "fg")

        XCTAssertNil(sut.currentSlide.effects.mediaObjects?.first { $0.id == "fg" })
        XCTAssertEqual(sut.currentSlide.effects.textObjects.map(\.id), ["tx-1", "tx-2"])
    }

    /// L'image de fond HÉRITÉE vit hors de la slide : le verrou la garde aussi.
    func test_fondFige_lImageHeriteeNeSeRemplaceNiNeSeRetire() throws {
        let legacy = story(media: [FeedMedia(id: "pm-1", type: .image, url: "https://cdn.example/bg.jpg")],
                           content: "Plage")
        let recomposition = try XCTUnwrap(StoryRecomposition(story: legacy, preferredLanguages: []))
        let original = makeImage()
        let sut = StoryComposerViewModel(seeding: try XCTUnwrap(StoryComposerSeed.scene(
            recomposition, images: [recomposition.slide.id: original], files: [:], locksBackground: true
        )))

        sut.setImage(makeImage(), for: recomposition.slide.id)
        XCTAssertTrue(sut.imageForCurrentSlide() === original)

        sut.detachSeededBackgroundImage()
        XCTAssertTrue(sut.imageForCurrentSlide() === original)
        XCTAssertTrue(sut.hasBackgroundImage)
    }

    /// Sa PROPRE story se recompose librement : le verrou n'est posé que sur
    /// celle d'autrui.
    func test_sansVerrou_leFondSeRecompose() throws {
        let sut = try backgroundScene(locks: false)

        sut.applyBackground(hex: "#FFFFFF")
        sut.toggleBackground(id: "bg")

        XCTAssertNil(sut.backgroundLock)
        XCTAssertEqual(sut.currentSlide.effects.background, "FFFFFF")
        XCTAssertNil(sut.currentSlide.effects.resolvedBackgroundMedia)
    }

    func test_fondFige_tombeAvecUneRemiseAZero() throws {
        let sut = try backgroundScene(locks: true)
        XCTAssertNotNil(sut.backgroundLock)
        XCTAssertEqual(sut.backgroundLock?.backgroundObjectId, "bg")

        sut.reset()

        XCTAssertNil(sut.backgroundLock)
    }
}
