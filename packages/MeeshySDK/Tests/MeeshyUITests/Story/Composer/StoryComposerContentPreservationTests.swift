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
}
