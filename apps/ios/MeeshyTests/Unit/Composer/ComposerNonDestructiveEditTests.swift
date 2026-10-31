import XCTest
import CoreImage
import UIKit
import MeeshySDK
@testable import MeeshyUI
@testable import Meeshy

/// #13840 — **tant qu'on n'a pas publié, rien n'est aplati.**
///
/// > « tant qu'on n'a pas envoyé notre scène ou image/vidéo en édition, on peut
/// > toujours bouger les textes, filtres, cadres etc. » — porteur, 2026-10-30.
///
/// « Modifier » un média de la scène ouvre l'édition EN PLACE : le look de la
/// retouche (filtres, effets et cadres de l'appel) devient un RÉGLAGE de l'objet,
/// que le canvas peint par le peintre de l'app, que l'annulation couvre et que
/// la réouverture relit. Aucun fichier neuf, aucun objet neuf.
@MainActor
final class ComposerNonDestructiveEditTests: XCTestCase {

    override func setUp() {
        super.setUp()
        ComposerLookPainterAdapter.install()
    }

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    private func composerFile(_ nom: String) -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Composer/\(nom)")
    }

    // MARK: - « Modifier » ouvre l'édition en place, jamais la retouche qui cuit

    func test_editSceneItem_media_ouvreLEditionEnPlace_jamaisLaRetouche() throws {
        let code = try source("MeeshyComposerHost+SceneColumns.swift")
        XCTAssertFalse(code.contains("requestSceneMediaRetouch"),
                       "« Modifier » d'un média ne doit plus remplacer l'objet par un fichier cuit")
        XCTAssertTrue(code.contains("case.media,.sticker,.place:sceneSelectionRelay.modifySceneItem(id)"))
        let selection = try source("MeeshyComposerHost+Selection.swift")
        XCTAssertTrue(selection.contains("case.mediaSheet:host.beginInlineEdit(id,purpose:.modify)"),
                      "la feuille Modifier d'un média est l'édition en place, non destructive (#13839, L5)")
    }

    func test_menuDuFond_modifier_ouvreLEditionEnPlace() throws {
        let code = try source("MeeshyComposerHost+BackgroundMenu.swift")
        XCTAssertTrue(code.contains("case.edit:openObjectEditor(id)"))
        XCTAssertFalse(code.contains("ComposerSceneMediaRetouchCover"),
                       "le compositeur de story ne monte plus la retouche qui cuit")
    }

    func test_leCompositeurDeStory_neRemplacePlusUnMediaParUnFichierCuit() {
        for fichier in ["ComposerSceneMediaRetouch.swift", "MeeshyComposerHost+MediaRetouch.swift", "ComposerMediaSwap.swift"] {
            XCTAssertFalse(FileManager.default.fileExists(atPath: composerFile(fichier).path),
                           "\(fichier) : le chemin qui aplatissait un média de la scène est retiré")
        }
    }

    // MARK: - Le look de la retouche est une section de l'édition en place

    func test_sections_image_videoEtFond_offrentLeLookDeLaRetouche() {
        XCTAssertEqual(ComposerInlineEditing.sections(for: .image, hasTrimmableSource: false).prefix(2),
                       [.media(.crop), .media(.look)])
        XCTAssertEqual(ComposerInlineEditing.sections(for: .video, hasTrimmableSource: true).first, .media(.look),
                       "les filtres, effets et cadres de l'appel se peignent aussi sur une vidéo")
        XCTAssertEqual(ComposerInlineEditing.sections(for: .background(isVideo: false), hasTrimmableSource: false).first,
                       .media(.look))
    }

    func test_choosing_unCadrePuisUnFiltre_seCombinent_etGardentLeCadrage() {
        let depart = StoryMediaLook(framing: StoryMediaFraming(centerX: 0.3, centerY: 0.5, scale: 2))
        let cadre = ComposerMediaLookPanel.choosing(.frame(.montage(.classic(.polaroid))), in: depart)
        let filtre = ComposerMediaLookPanel.choosing(.filter(.warm), in: cadre)

        XCTAssertEqual(filtre.frameId, "classic:polaroid")
        XCTAssertEqual(filtre.filterPreset, VideoFilterPreset.warm.rawValue)
        XCTAssertEqual(filtre.framing, depart.framing, "le cadrage n'est pas perdu en changeant de filtre")
    }

    // MARK: - La traduction look ↔ réglage

    func test_mapping_allerRetour_rendLeMemeLook() {
        let regard = ComposerPhotoLook(filter: .cool, frame: .montage(.classic(.film)), effect: .angel)
        let cadrage = ComposerFraming(center: CGPoint(x: 0.25, y: 0.75), scale: 1.5)
        let reglage = ComposerMediaLookMapping.storyLook(regard, framing: cadrage)

        XCTAssertEqual(ComposerMediaLookMapping.photoLook(reglage), regard)
        XCTAssertEqual(ComposerMediaLookMapping.framing(reglage), cadrage)
    }

    func test_mapping_lookIntact_estNeutre() {
        XCTAssertTrue(ComposerMediaLookMapping.storyLook(ComposerPhotoLook()).isNeutral)
    }

    func test_mapping_identifiantsInconnus_seLisentAucun() {
        let regard = ComposerMediaLookMapping.photoLook(
            StoryMediaLook(filterPreset: "futur", frameId: "frame:inconnu.x.1", faceEffect: "dragon"))
        XCTAssertTrue(regard.isUntouched)
    }

    // MARK: - Le peintre branché sur le canvas

    private func gris(_ taille: CGSize = CGSize(width: 64, height: 48)) -> CIImage {
        CIImage(color: CIColor(red: 0.5, green: 0.5, blue: 0.5)).cropped(to: CGRect(origin: .zero, size: taille))
    }

    private func pixel(_ image: CIImage) throws -> [UInt8] {
        var octets = [UInt8](repeating: 0, count: 4)
        let contexte = CIContext()
        contexte.render(image, toBitmap: &octets, rowBytes: 4,
                        bounds: CGRect(x: image.extent.midX, y: image.extent.midY, width: 1, height: 1),
                        format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        return octets
    }

    func test_paint_unFiltreDeLAppel_changeLesPixels_etGardeLEtendue() throws {
        let source = gris()
        let peinte = ComposerLookPainterAdapter.shared.paint(source, look: StoryMediaLook(filterPreset: "warm"), still: true)
        XCTAssertEqual(peinte.extent, source.extent, "un look ne change pas les proportions du média")
        XCTAssertNotEqual(try pixel(peinte), try pixel(source))
    }

    func test_paint_unCadre_seposeDansLEtendueDuMedia() {
        let source = gris().transformed(by: CGAffineTransform(translationX: 10, y: 20))
        let peinte = ComposerLookPainterAdapter.shared.paint(
            source, look: StoryMediaLook(frameId: "classic:polaroid"), still: true)
        XCTAssertEqual(peinte.extent, source.extent)
    }

    // MARK: - Le critère de fin de #13840

    /// Texte et sticker posés, filtre et cadre changés sur l'image, retour : le
    /// texte se déplace, un son s'ajoute, et rouvrir l'édition retrouve filtre et
    /// cadre — sur le MÊME objet, avec le MÊME fichier.
    func test_criterefin_texteStickerFiltreCadre_restentReglables() throws {
        let vm = StoryComposerViewModel()
        let image = try XCTUnwrap(vm.addMediaObject(kind: .image))
        let fichier = vm.currentEffects.mediaObjects?.first?.mediaURL
        let texte = try XCTUnwrap(vm.addText())
        _ = vm.addSticker(emoji: "🎈")
        vm.seedHistory()

        let cadre = ComposerMediaLookPanel.choosing(.frame(.montage(.classic(.polaroid))),
                                                    in: vm.currentEffects.mediaLook(id: image.id))
        StoryMediaLookEditing.apply(ComposerMediaLookPanel.choosing(.filter(.vivid), in: cadre), toMedia: image.id, in: vm)
        vm.pushHistorySnapshot()

        vm.moveElement(id: texte.id, to: CGPoint(x: 0.2, y: 0.8))
        XCTAssertEqual(vm.currentEffects.textObjects.first { $0.id == texte.id }?.x, 0.2,
                       "le texte reste un calque : il se déplace après la retouche")
        let sons = vm.currentEffects.audioPlayerObjects?.count ?? 0
        vm.attachPastedAudio(url: URL(fileURLWithPath: "/tmp/son.m4a"))
        XCTAssertEqual(vm.currentEffects.audioPlayerObjects?.count, sons + 1, "un son se pose sur l'image retouchée")
        XCTAssertEqual(vm.currentEffects.stickerObjects?.count, 1)

        let relu = vm.currentEffects.mediaLook(id: image.id)
        XCTAssertEqual(relu.frameId, "classic:polaroid", "rouvrir l'édition retrouve le cadre")
        XCTAssertEqual(relu.filterPreset, VideoFilterPreset.vivid.rawValue, "… et le filtre")
        XCTAssertEqual(vm.currentEffects.mediaObjects?.map(\.id), [image.id], "aucun objet neuf")
        XCTAssertEqual(vm.currentEffects.mediaObjects?.first?.mediaURL, fichier, "aucun fichier neuf")
    }

    // MARK: - La publication cuit, et rien ne part au fil

    func test_publication_unMediaAvecLook_seCuit_meme_preMonte() {
        var media = StoryMediaObject(id: "m", postMediaId: "pre-monte", kind: .image, aspectRatio: 1)
        XCTAssertFalse(StoryPublicationLookBake.needsUpload(media), "un média pré-monté sans look ne repart pas")
        media.look = StoryMediaLook(frameId: "classic:polaroid")
        XCTAssertTrue(StoryPublicationLookBake.needsUpload(media),
                      "un look non cuit publierait un média sans son cadre : il repart cuit")
        XCTAssertTrue(StoryPublicationLookBake.needsUpload(StoryMediaObject(id: "n", kind: .image, aspectRatio: 1)))
    }

    func test_publication_imageAvecLook_rendUneImageCuite_auxMemesProportions() async throws {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 30), format: format).image { ctx in
            UIColor.gray.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 40, height: 30))
        }
        let rendue = await StoryPublicationLookBake.bakedImage(image, look: StoryMediaLook(filterPreset: "warm"))
        let cuite = try XCTUnwrap(rendue)
        XCTAssertEqual(cuite.size, image.size)
        XCTAssertFalse(cuite === image)
    }

    // MARK: - Le canal DOCUMENT (post, réel, plusieurs scènes) cuit aussi

    private func fichierGris() throws -> URL {
        let format = UIGraphicsImageRendererFormat.default()
        format.scale = 1
        let image = UIGraphicsImageRenderer(size: CGSize(width: 40, height: 30), format: format).image { ctx in
            UIColor.gray.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 40, height: 30))
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("gris-\(UUID().uuidString).png")
        try XCTUnwrap(image.pngData()).write(to: url)
        return url
    }

    private func brouillon(_ url: URL, effets: StoryEffects?) -> ComposerDocumentDraft {
        ComposerDocumentDraft(
            format: .post, text: "texte", emoji: nil, visibility: .public, visibilityUserIds: nil,
            mentions: nil, repostOfId: nil, audioUrl: nil,
            localMedia: [ComposerDocumentMedia(url: url, mimeType: "image/png", durationMs: nil)],
            location: nil, discoverabilityPrecision: nil, originalLanguage: "fr", storyEffects: effets,
            mediaCaptions: [url: "légende"], mediaAlts: [url: "un mur gris"], mediaObjectIds: [url: "m"],
            forcePlainPost: false, mobileTranscription: nil, allowSoundExtraction: nil)
    }

    private func effets(look: StoryMediaLook?, url: URL) -> StoryEffects {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 4.0 / 3.0)
        media.mediaURL = url.absoluteString
        media.look = look
        var effets = StoryEffects()
        effets.mediaObjects = [media]
        return effets
    }

    func test_documentBake_sansLook_rendLeBrouillonTelQuel() async throws {
        let url = try fichierGris()
        let draft = brouillon(url, effets: effets(look: nil, url: url))

        let cuit = await ComposerDocumentLookBake.baked(draft)

        XCTAssertEqual(cuit, draft, "sans look, rien n'est réécrit ni retéléversé")
    }

    func test_documentBake_imageAvecLook_partCuite_lesCartesSuivent_etAucunLookNePart() async throws {
        let url = try fichierGris()
        let draft = brouillon(url, effets: effets(look: StoryMediaLook(filterPreset: "warm"), url: url))

        let cuit = await ComposerDocumentLookBake.baked(draft)

        let piece = try XCTUnwrap(cuit.localMedia.first)
        XCTAssertNotEqual(piece.url, url, "un post publie l'image CUITE, jamais l'original sans son filtre")
        XCTAssertEqual(cuit.mediaCaptions[piece.url], "légende")
        XCTAssertEqual(cuit.mediaAlts[piece.url], "un mur gris")
        XCTAssertEqual(cuit.mediaObjectIds[piece.url], "m", "le canvas adopte encore le média téléversé")
        let fil = String(decoding: try JSONEncoder().encode(try XCTUnwrap(cuit.storyEffects)), as: UTF8.self)
        XCTAssertFalse(fil.contains("\"look\""), "le look cuit ne se peint pas une seconde fois chez le lecteur")
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path), "le brouillon garde son original")
        XCTAssertNotNil(draft.storyEffects?.mediaObjects?.first?.look, "… et son réglage")
    }

    func test_documentBake_sceneSuivante_sonLookEstCuitAussi() async throws {
        let url = try fichierGris()
        var scene = effets(look: StoryMediaLook(filterPreset: "warm"), url: url)
        var courante = StoryEffects()
        courante.canvasV3 = CanvasV3(scenes: [CanvasV3(migrating: courante).scenes.first,
                                              CanvasV3(migrating: scene).scenes.first].compactMap { $0 })
        scene = courante

        let cuit = await ComposerDocumentLookBake.baked(brouillon(url, effets: scene))

        XCTAssertNotEqual(cuit.localMedia.first?.url, url, "le média d'une scène suivante part cuit")
    }

    func test_publierUnDocument_cuitLeLookAvantDeRemettre() throws {
        let code = try source("MeeshyComposerHost+Socle.swift")
        XCTAssertTrue(code.contains("awaitonPublishDocument(awaitComposerDocumentLookBake.baked(draft))"),
                      "post, réel et document à plusieurs scènes passent par la cuisson, comme la story")
    }
}
