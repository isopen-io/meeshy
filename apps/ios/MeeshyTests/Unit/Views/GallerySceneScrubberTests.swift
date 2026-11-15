import XCTest
import CoreGraphics
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Une scène qui a une timeline s'ouvre avec son curseur, grandit depuis le
/// fil et passe au plein cadre sans saut** (#8598, demande porteur du
/// 2026-09-28).
///
/// Les LOIS s'éprouvent par leur verdict ; le CÂBLAGE par la source — un
/// verdict juste que personne ne monte ne met aucun curseur à l'écran.
@MainActor
final class GallerySceneScrubberTests: XCTestCase {

    // MARK: - Fabriques

    private func post(scenes: [SceneV3], sound: BackgroundSoundV3? = nil) -> FeedPost {
        var post = FeedPost(id: "p1", author: "alice", authorId: "a1",
                            content: "", timestamp: Date(timeIntervalSince1970: 1_000))
        var effets = StoryEffects()
        effets.canvasV3 = CanvasV3(scenes: scenes, sound: sound)
        post.storyEffects = effets
        return post
    }

    /// Une scène qui BOUGE (une ouverture l'anime) et dont l'auteur a figé la
    /// durée à 8 s.
    private func sceneQuiBouge(_ id: String = "s1") -> SceneV3 {
        SceneV3(id: id, objects: [], opening: ["kind": .string("fade")], timelineDuration: 8)
    }

    /// Une scène FIXE : un fond, rien qui joue.
    private func sceneFixe(_ id: String = "s2") -> SceneV3 {
        SceneV3(id: id, objects: [])
    }

    private func lot(_ post: FeedPost) -> PostGalleryLot {
        PostGalleryLot.compose(post: post, comments: [], preferredLanguages: [])
    }

    // MARK: - La timeline d'une scène

    func test_timeline_sceneQuiBouge_portaSaDuree() throws {
        let lot = lot(post(scenes: [sceneQuiBouge()]))
        let piece = try XCTUnwrap(lot.attachments.first)
        let scene = try XCTUnwrap(lot.scenes[piece.id])

        XCTAssertEqual(try XCTUnwrap(scene.timeline), 8, accuracy: 0.001)
        XCTAssertEqual(piece.duration, 8_000,
                       "la pièce synthétique porte la durée en millisecondes, comme une vidéo")
        XCTAssertEqual(piece.durationFormatted, "0:08")
    }

    func test_timeline_sceneFixe_naPasDeCurseur() throws {
        let lot = lot(post(scenes: [sceneFixe()]))
        let piece = try XCTUnwrap(lot.attachments.first)

        XCTAssertNil(lot.scenes[piece.id]?.timeline,
                     "une scène fixe a une durée (6 s) mais rien à parcourir : pas de curseur (loi 4)")
        XCTAssertNil(piece.duration)
    }

    /// **Le couloir de transport se réserve pour le LOT** : c'est la même
    /// règle que pour une vidéo, et c'est elle qui fait naître la bande.
    func test_leLotDUneSceneQuiBouge_reserveLeCouloirDeTransport() {
        let bouge = lot(post(scenes: [sceneQuiBouge(), sceneFixe()]))
        let fixe = lot(post(scenes: [sceneFixe("a"), sceneFixe("b")]))

        XCTAssertTrue(MediaGalleryStage.carriesDuration(bouge.attachments))
        XCTAssertFalse(MediaGalleryStage.carriesDuration(fixe.attachments))
    }

    func test_duration_neCalculeLaSlideQuePourUneSceneQuiBouge() {
        var calculs = 0
        let fixe = GallerySceneTimeline.duration(moves: false) { calculs += 1; return 6 }

        XCTAssertNil(fixe)
        XCTAssertEqual(calculs, 0, "une galerie de scènes fixes ne paie pas la projection en slide")
        XCTAssertNil(GallerySceneTimeline.duration(moves: true) { 0 })
        XCTAssertNil(GallerySceneTimeline.duration(moves: true) { .infinity })
        XCTAssertEqual(GallerySceneTimeline.duration(moves: true) { 12.5 }, 12.5)
        XCTAssertEqual(GallerySceneTimeline.attachmentDurationMs(12.5), 12_500)
        XCTAssertNil(GallerySceneTimeline.attachmentDurationMs(nil))
    }

    // MARK: - L'horloge partagée page ↔ couloir

    func test_horloge_publieLaPositionDeLaPageActive() {
        let horloge = GallerySceneClock()
        horloge.activate("s1")

        horloge.report(elapsed: 2, duration: 8, for: "s1")

        XCTAssertEqual(horloge.progress, 0.25, accuracy: 0.0001)
    }

    func test_horloge_nePubliePasLaPositionDUneVoisine() {
        let horloge = GallerySceneClock()
        horloge.activate("s1")
        horloge.report(elapsed: 2, duration: 8, for: "s1")

        horloge.report(elapsed: 6, duration: 8, for: "s2")

        XCTAssertEqual(horloge.progress, 0.25, accuracy: 0.0001,
                       "une page voisine ne pousse pas le curseur de la page ouverte")
    }

    func test_horloge_rendSaPositionAUneSceneRejointe() {
        let horloge = GallerySceneClock()
        horloge.activate("s1")
        horloge.report(elapsed: 6, duration: 8, for: "s2")
        horloge.report(elapsed: 2, duration: 8, for: "s1")

        horloge.activate("s2")
        XCTAssertEqual(horloge.progress, 0.75, accuracy: 0.0001)

        horloge.activate("s3")
        XCTAssertEqual(horloge.progress, 0, "une scène jamais jouée commence au début")
    }

    func test_horloge_leRelacherFixeLaBarreSansAttendreLeCanvas() {
        let horloge = GallerySceneClock()
        horloge.activate("s1")

        horloge.commit(0.6, for: "s1")
        XCTAssertEqual(horloge.progress, 0.6, accuracy: 0.0001)

        horloge.commit(4, for: "s1")
        XCTAssertEqual(horloge.progress, 1, "une fraction hors bornes est ramenée à la scène")
    }

    func test_horloge_unPontParScene_stable() {
        let horloge = GallerySceneClock()

        XCTAssertTrue(horloge.scrubber(for: "s1") === horloge.scrubber(for: "s1"),
                      "un canvas s'attache à son pont à la naissance : il doit rester le même")
        XCTAssertFalse(horloge.scrubber(for: "s1") === horloge.scrubber(for: "s2"))
    }

    // MARK: - Le plein cadre sans saut

    private let viewport = CGSize(width: 402, height: 874)

    private func corridors() -> MediaStageFraming.Corridors {
        MediaGalleryStage.corridors(safeTop: 62, safeBottom: 34,
                                    attachments: lot(post(scenes: [sceneQuiBouge(), sceneFixe()])).attachments)
    }

    /// **Le canvas ne change jamais de taille** : la référence est la même
    /// quel que soit l'état, et c'est la LOI en plein cadre.
    func test_reference_estLePleinCadre_independantDeLEtat() {
        let reference = GallerySceneStage.reference(viewport: viewport)
        let plein = GallerySceneStage.frame(viewport: viewport, presentation: .full(pausedOnEntry: false),
                                            corridors: corridors())

        XCTAssertEqual(reference.sceneSize, plein.sceneSize)
    }

    /// **L'échelle amène la référence EXACTEMENT au cadre de l'état** — cardé
    /// comme plein cadre. C'est ce qui garantit que la transformation ne
    /// change rien au rendu au repos, et seulement le chemin entre les deux.
    func test_scale_ameneLaReferenceAuCadreDeChaqueEtat() {
        let reference = GallerySceneStage.reference(viewport: viewport)
        for presentation in [StagePresentation.carded, .full(pausedOnEntry: false)] {
            let cadre = GallerySceneStage.frame(viewport: viewport, presentation: presentation,
                                                corridors: corridors())
            let echelle = GallerySceneStage.scale(of: cadre, reference: reference)

            XCTAssertEqual(reference.sceneSize.width * echelle, cadre.sceneSize.width, accuracy: 0.001)
            XCTAssertEqual(reference.sceneSize.height * echelle, cadre.sceneSize.height, accuracy: 0.001,
                           "la forme est la même des deux côtés : une échelle UNIFORME suffit")
        }
    }

    func test_scale_cadreDegenere_rendUn() {
        let reference = GallerySceneStage.reference(viewport: .zero)
        XCTAssertEqual(GallerySceneStage.scale(of: reference, reference: reference), 1)
    }

    // MARK: - La scène grandit depuis le fil

    func test_zoom_seulementQuandLaGalerieSOuvreSurLaScene() {
        XCTAssertEqual(SceneZoomTransition.destinationID(postId: "p1", hasScene: true, startMediaId: nil),
                       SceneZoomTransition.sourceID(postId: "p1"))
        XCTAssertNil(SceneZoomTransition.destinationID(postId: "p1", hasScene: true, startMediaId: "m1"),
                     "un média ouvert depuis le carrousel n'a pas de source enregistrée")
        XCTAssertNil(SceneZoomTransition.destinationID(postId: "p1", hasScene: false, startMediaId: nil))
    }

    func test_zoom_lIdentiteNeSeConfondPasAvecUnGroupeDeStories() {
        XCTAssertNotEqual(SceneZoomTransition.sourceID(postId: "g1"), "g1",
                          "le namespace est partagé avec le plateau de stories")
    }

    // MARK: - Le câblage

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(chemin))
    }

    func test_leCouloirMonteLeCurseurDUneSceneMinutee() throws {
        let code = try source("Meeshy/Features/Main/Views/ConversationMediaGalleryView+Transport.swift")

        XCTAssertTrue(code.contains("scene.timeline != nil"))
        XCTAssertTrue(code.contains("GallerySceneScrubBar(clock: sceneClock"))
    }

    func test_lePlayerDeLaPageRecoitLePontEtRapporteSaPosition() throws {
        let code = try source("Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift")

        XCTAssertTrue(code.contains("scrubber: item.timeline == nil ? nil : clock.scrubber(for: item.id)"))
        XCTAssertTrue(code.contains("clock.report(elapsed: seconds, duration: timeline, for: id)"))
    }

    func test_laPagePoseLaCarteALaReferenceEtLAmeneParUneEchelle() throws {
        let code = try source("Meeshy/Features/Main/Views/ConversationMediaGalleryView+ScenePage.swift")

        XCTAssertTrue(code.contains("SceneCard(layout: reference.layout"))
        XCTAssertTrue(code.contains(".scaleEffect(sceneScale)"))
        XCTAssertTrue(code.contains("hostScale: sceneScale"),
                      "le rayon se compense dans l'espace non mis à l'échelle")
    }

    func test_laCarteDuFilEstLaSourceEtLaGalerieLaDestination() throws {
        let carte = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        let couche = try source("Meeshy/Features/Main/Views/SocialMediaGalleryPresentation.swift")

        XCTAssertEqual(carte.components(separatedBy: ".sceneZoomSource(postId: post.id)").count - 1, 2,
                       "la scène seule ET la mosaïque sont des sources")
        XCTAssertTrue(carte.contains("zoomSourceID: SceneZoomTransition.destinationID("))
        XCTAssertTrue(couche.contains(".sceneZoomDestination(zoomSourceID, in: zoomNamespace)"))
    }
}
