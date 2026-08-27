import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **B1 (#3924) — changer de mode ne jette jamais le contenu.**
/// Le composer garde UN seul contenu ; la scène qui naît le reçoit sur sa
/// slide courante via les points d'entrée publics `applyContentText` (le texte)
/// et `applyContentMedia` (le média), d'où ils partiront à la publication (et où
/// B2 rendra le texte dans une section repliable).
@MainActor
final class StoryComposerContentPreservationTests: XCTestCase {

    func test_applyContentText_semeLeContenuSurLaSlideCourante() {
        let vm = StoryComposerViewModel()
        vm.applyContentText("Bonjour le monde")
        XCTAssertEqual(vm.currentSlide.content, "Bonjour le monde",
                       "Le contenu écrit au composer SUIT sur la slide de la scène.")
    }

    func test_applyContentText_videMetNil_pasDeContenuFantome() {
        let vm = StoryComposerViewModel()
        vm.applyContentText("x")
        vm.applyContentText("")
        XCTAssertNil(vm.currentSlide.content,
                     "Un contenu vidé devient nil — jamais une chaîne vide fantôme.")
    }

    // MARK: - Le média SUIT dans la scène (B1)

    /// Écrit un JPEG minuscule sur disque et rend son URL — un média LOCAL comme
    /// celui qu'une pièce jointe du document présente.
    private func makeTempImage() throws -> URL {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: 4, height: 4))
        let image = renderer.image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 4, height: 4))
        }
        let data = try XCTUnwrap(image.jpegData(compressionQuality: 0.9))
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("b1-\(UUID().uuidString).jpg")
        try data.write(to: url)
        return url
    }

    func test_applyContentMedia_poseLeMediaSurLaSlide_etLePremierEstLeFond() throws {
        let vm = StoryComposerViewModel()
        let url = try makeTempImage()
        vm.applyContentMedia([ComposerContentMedia(sourceURL: url, kind: .image)])

        let medias = vm.currentSlide.effects.mediaObjects ?? []
        XCTAssertEqual(medias.count, 1,
                       "Le média composé au document SUIT sur la slide de la scène.")
        XCTAssertEqual(medias.first?.isBackground, true,
                       "Le PREMIER média posé sur une slide vierge devient son fond.")
    }

    func test_applyContentMedia_estIdempotent_pasDeDoublonAuRetour() throws {
        let vm = StoryComposerViewModel()
        let url = try makeTempImage()
        let media = ComposerContentMedia(sourceURL: url, kind: .image)
        // Deux bascules successives (Post→Story→Post→Story) refirent la closure.
        vm.applyContentMedia([media])
        vm.applyContentMedia([media])
        XCTAssertEqual(vm.currentSlide.effects.mediaObjects?.count, 1,
                       "Un aller-retour de mode ne porte pas le même média deux fois.")
    }
    // MARK: - Une slide par média (modèle § 3 — en Post, une slide EST un média)

    /// En profil Post, chaque média posé devient SA propre slide (modèle § 3 :
    /// « une slide EST un média du post »). L'hôte crée donc la slide puis vise
    /// explicitement son id — sans ce paramètre, tout atterrissait sur la slide
    /// COURANTE et un post à trois photos n'aurait jamais eu qu'une slide.
    func test_applyContentMedia_poseSurLaSlideVISEE_pasLaCourante() throws {
        let vm = StoryComposerViewModel()
        let first = vm.currentSlide.id
        vm.addSlide()
        let second = vm.currentSlide.id
        XCTAssertNotEqual(first, second, "Le décor du test exige deux slides distinctes.")

        // On est sur la seconde, on vise la PREMIÈRE.
        let url = try makeTempImage()
        vm.applyContentMedia([ComposerContentMedia(sourceURL: url, kind: .image)],
                             intoSlideId: first)

        let onFirst = vm.slides.first(where: { $0.id == first })?.effects.mediaObjects ?? []
        let onSecond = vm.slides.first(where: { $0.id == second })?.effects.mediaObjects ?? []
        XCTAssertEqual(onFirst.count, 1, "Le média doit atterrir sur la slide VISÉE.")
        XCTAssertEqual(onFirst.first?.isBackground, true,
                       "Premier média d'une slide vierge ⇒ son fond (modèle § 4).")
        XCTAssertTrue(onSecond.isEmpty,
                      "La slide courante ne doit RIEN recevoir quand une autre est visée.")
    }

    /// Deux médias, deux slides : chacun est le FOND de la sienne. C'est ce qui
    /// distingue un carrousel de post (N slides d'un média) d'une scène composée
    /// (une slide, un fond et des premiers plans).
    func test_applyContentMedia_deuxSlides_chaqueMediaEstLeFondDeLaSienne() throws {
        let vm = StoryComposerViewModel()
        let first = vm.currentSlide.id
        vm.addSlide()
        let second = vm.currentSlide.id

        vm.applyContentMedia([ComposerContentMedia(sourceURL: try makeTempImage(), kind: .image)],
                             intoSlideId: first)
        vm.applyContentMedia([ComposerContentMedia(sourceURL: try makeTempImage(), kind: .image)],
                             intoSlideId: second)

        for id in [first, second] {
            let medias = vm.slides.first(where: { $0.id == id })?.effects.mediaObjects ?? []
            XCTAssertEqual(medias.count, 1, "Une slide de carrousel porte UN média.")
            XCTAssertEqual(medias.first?.isBackground, true,
                           "…et ce média en est le FOND, jamais un objet de premier plan.")
        }
    }

    /// Le paramètre est OPTIONNEL : sans lui, le comportement historique (la
    /// slide courante) est intact — les sites de bascule de mode ne changent pas.
    func test_applyContentMedia_sansCible_resteSurLaSlideCourante() throws {
        let vm = StoryComposerViewModel()
        vm.addSlide()
        let second = vm.currentSlide.id
        vm.applyContentMedia([ComposerContentMedia(sourceURL: try makeTempImage(), kind: .image)])
        XCTAssertEqual(vm.slides.first(where: { $0.id == second })?.effects.mediaObjects?.count, 1,
                       "Sans cible explicite, le média reste sur la slide courante.")
    }

    // MARK: - Un post à médias DIVERS (#4038)

    /// Écrit un fichier `.mov` minuscule et rend son URL. Le chemin vidéo ne
    /// DÉCODE rien — `copyForComposer` teste l'existence puis copie des octets,
    /// `insertForegroundVideo` ne lit jamais le fichier — si bien qu'un test
    /// unitaire peut l'exercer pour de vrai sans encoder quoi que ce soit.
    private func makeTempVideo() throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("b1-\(UUID().uuidString).mov")
        try Data([0x00, 0x00, 0x00, 0x18]).write(to: url)
        return url
    }

    /// **Le carrousel MIXTE — une image ET une vidéo (#4038).**
    ///
    /// La branche `.video` d'`applyContentMedia` passe par `copyForComposer` +
    /// `insertForegroundVideo`, un chemin ENTIÈREMENT distinct de celui de
    /// l'image (copie sous `{objectId}.{ext}`, vignette, durée, extension de la
    /// fenêtre de slide). Les cinq tests qui précèdent n'utilisent que `.image`
    /// : ils prouvent le carrousel, jamais sa MIXITÉ — qui est pourtant le cas
    /// nominal d'un post.
    func test_applyContentMedia_carrouselMIXTE_imageEtVideo_chacuneEstLeFondDeSaSlide() throws {
        let vm = StoryComposerViewModel()
        let premiere = vm.currentSlide.id
        vm.addSlide()
        let seconde = vm.currentSlide.id

        vm.applyContentMedia([ComposerContentMedia(sourceURL: try makeTempImage(), kind: .image)],
                             intoSlideId: premiere)
        vm.applyContentMedia([ComposerContentMedia(sourceURL: try makeTempVideo(),
                                                   kind: .video, durationMs: 4200)],
                             intoSlideId: seconde)

        let surImage = try XCTUnwrap(vm.slides.first(where: { $0.id == premiere })?
            .effects.mediaObjects)
        let surVideo = try XCTUnwrap(vm.slides.first(where: { $0.id == seconde })?
            .effects.mediaObjects)

        XCTAssertEqual(surImage.count, 1, "La slide de l'image porte UN média.")
        XCTAssertEqual(surVideo.count, 1, "La slide de la vidéo porte UN média.")
        XCTAssertEqual(surImage.first?.isBackground, true,
                       "L'image est le FOND de sa slide (règle de placement § 4).")
        XCTAssertEqual(surVideo.first?.isBackground, true,
                       "La vidéo l'est de la sienne — `insertForegroundVideo` porte "
                           + "« foreground » dans son NOM, mais c'est `addMediaObject` qui "
                           + "tranche, et sur une slide vierge il tranche FOND.")
        XCTAssertNotEqual(surImage.first?.mediaType, surVideo.first?.mediaType,
                          "Les deux slides ne portent pas le même type — c'est ce que "
                              + "« plusieurs médias DIVERS » veut dire.")
    }

    /// **Suivre la donnée jusqu'au PIXEL, pas jusqu'à son consommateur.** Un
    /// objet vidéo posé dont l'actif n'est pas enregistré sous l'id RETENU est
    /// sauté par `runStoryUpload` avec son log « layer will be invisible to
    /// viewers » : une couche déclarée que personne ne verrait jamais. Le
    /// modèle tient, la scène est vide.
    func test_applyContentMedia_video_enregistreSonActifSousLIdRETENU() throws {
        let vm = StoryComposerViewModel()
        vm.applyContentMedia([ComposerContentMedia(sourceURL: try makeTempVideo(),
                                                   kind: .video, durationMs: 4200)])

        let objet = try XCTUnwrap(vm.currentSlide.effects.mediaObjects?.first)
        let piste = try XCTUnwrap(vm.loadedVideoURLs[objet.id],
                                  "L'actif vidéo doit être enregistré sous l'id que "
                                      + "`addMediaObject` a RETENU — pas sous l'id provisoire.")
        XCTAssertTrue(FileManager.default.fileExists(atPath: piste.path),
                      "…et pointer un fichier qui EXISTE : la copie sous `{objectId}.{ext}` "
                          + "est ce qui relie le bitmap au `composerKey` du canvas.")
        XCTAssertNotNil(objet.mediaURL,
                        "L'objet porte son URL — sans elle, rien ne part à la publication.")
    }
}
