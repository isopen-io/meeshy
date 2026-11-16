import XCTest

/// #18721 — tirer la bannière vers le bas l'étire, puis la transforme en sa
/// conversation, ouverte EN REGARD. Ce témoin garde le CÂBLAGE de l'overlay :
/// la loi de traction est éprouvée par `NotificationBannerPullTests` (SDK), le
/// regard par `PeekReadLawTests` et `ConversationViewModelPeekTests`.
final class RootNotificationToastOverlayPullTests: XCTestCase {

    private static let path = "Meeshy/Features/Main/Views/RootLayers/RootSharedLayers.swift"

    private func overlay() throws -> String {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.path))
        let start = try XCTUnwrap(source.range(of: "struct RootNotificationToastOverlay: View"))
        let end = try XCTUnwrap(source.range(of: "struct BannerMorph", range: start.upperBound..<source.endIndex))
        return String(source[start.lowerBound..<end.lowerBound])
    }

    private func body(of signature: String, in source: String) throws -> String {
        let start = try XCTUnwrap(source.range(of: signature), "signature introuvable : \(signature)")
        let rest = source[start.upperBound...]
        let next = rest.range(of: "\n    private func ")?.lowerBound ?? rest.endIndex
        return String(rest[..<next])
    }

    func test_release_downwardPull_isDecidedByThePullLaw() throws {
        let release = try body(of: "private func release(", in: try overlay())

        XCTAssertTrue(release.contains("NotificationBannerSwipe.outcome("), "le HAUT ferme toujours la bannière")
        XCTAssertTrue(release.contains("NotificationBannerPull.outcome("), "le BAS est tranché par la loi de traction")
        XCTAssertTrue(release.contains("springBack()"), "l'annulation revient en ressort")
        XCTAssertTrue(try body(of: "private func springBack(", in: try overlay()).contains("MeeshyMotion.bannerPull("),
                      "le ressort passe par le jeton de mouvement")
    }

    func test_drag_followsTheFingerThroughOneValue() throws {
        let source = try overlay()

        XCTAssertTrue(source.contains(".onChanged { pull = $0.translation.height }"))
        XCTAssertTrue(source.contains("NotificationBannerPullEffect(translation: pull"))
    }

    func test_drag_neverOpensThePreviewSheet() throws {
        let source = try overlay()
        let drag = try XCTUnwrap(source.range(of: "DragGesture("))
        let dragTail = source[drag.lowerBound...].prefix(400)

        XCTAssertFalse(dragTail.contains("onPreview"), "l'aperçu #8723 reste au seul appui long")
        XCTAssertTrue(source.contains("LongPressGesture("), "l'appui long ouvre toujours l'aperçu")
        XCTAssertFalse(try body(of: "private func release(", in: source).contains("onPreview"))
    }

    func test_openPulled_requestsAPeekWithoutConsuming() throws {
        let pulled = try body(of: "private func openPulled(", in: try overlay())

        XCTAssertTrue(pulled.contains("if suppressToastTap"), "le regard respecte la même garde que le toucher")
        XCTAssertTrue(pulled.contains("PeekOpeningRequests.request("), "la conversation s'ouvre en regard")
        XCTAssertTrue(pulled.contains("beginMorph("), "la bannière devient la conversation")
        let peekPath = try XCTUnwrap(pulled.components(separatedBy: "PeekOpeningRequests.request(").last)
        XCTAssertFalse(peekPath.contains("consume("), "regarder ne consomme pas la notification : rien n'a été lu")
    }

    func test_pull_hasAVoiceOverEquivalent() throws {
        XCTAssertTrue(try overlay().contains("notifications.banner.peekAction"))
    }

    func test_morph_growsAfterItsFirstFrame() throws {
        let source = try overlay()

        XCTAssertTrue(source.contains(".task(id: morph?.id)"), "la croissance part d'une image déjà peinte")
        XCTAssertFalse(try body(of: "private func beginMorph(", in: source).contains("progress = 1"),
                       "grandir dans le tour qui pose l'enveloppe n'a aucune image de départ")
    }

    /// Le bouton de la bannière émet son toucher à la levée, même après une
    /// traction : une traction courte ouvrait donc la conversation par le
    /// chemin du toucher, LUE (recette 1a). La traction verrouille le toucher.
    func test_aPull_swallowsTheReleaseTapOfTheBannerButton() throws {
        let source = try overlay()
        let tapped = try body(of: "private func openTapped(", in: source)

        XCTAssertTrue(source.contains("tapLatch = tapLatch.notingPull("), "chaque image de traction arme le verrou")
        XCTAssertTrue(tapped.contains("tapLatch.admitsTap("), "le toucher qui suit une traction ne passe pas")
    }

    /// L'enveloppe est la SEULE transition d'une ouverture par traction : la
    /// conversation se pose dessous sans glisser depuis la droite.
    func test_openPulled_placesTheConversationWithoutThePushAnimation() throws {
        let pulled = try body(of: "private func openPulled(", in: try overlay())
        let peekPath = try XCTUnwrap(pulled.components(separatedBy: "PeekOpeningRequests.request(").last)

        XCTAssertTrue(peekPath.contains("disablesAnimations = true"))
        XCTAssertTrue(peekPath.contains("withTransaction("))
    }

    /// Arrivée au plein écran, l'enveloppe s'efface en fondu au lieu de
    /// disparaître d'une image.
    func test_morph_fadesOut_beforeLeaving() throws {
        let run = try body(of: "private func runMorph(", in: try overlay())

        XCTAssertTrue(run.contains("morph?.opacity = 0"), "le fondu porte sur une valeur rendue")
        XCTAssertTrue(run.contains("MeeshyAnimation.bannerMorphFade"))
    }
}
