import XCTest
import CoreGraphics
import MeeshySDK
@testable import Meeshy

/// Hauteur du média d'une carte de POST — carte non immersive : le texte est
/// affiché, puis le média.
///
/// Le défaut corrigé le 2026-08-10 : `mediaPreview` imposait
/// `.frame(height: 220)` par-dessus une cellule qui calculait déjà sa hauteur
/// depuis le ratio source. Les deux se contredisaient et un clip vertical
/// s'affichait en timbre-poste letterboxé au centre de la carte.
final class FeedPostCardLayoutTests: XCTestCase {

    private let cardWidth: CGFloat = 400

    func test_postCardMediaHeight_portrait_isCappedAtMaxTallRatio() {
        // 9:16 → ratio h/w = 1.78, au-dessus du plafond 1.4.
        // C'est LE cas cassé : le clip vertical letterboxait.
        let h = postCardMediaHeight(mediaWidth: 1080, mediaHeight: 1920, cardWidth: cardWidth)
        XCTAssertEqual(h, 560) // 400 × 1.4
    }

    func test_postCardMediaHeight_landscape_isFlooredAtMinRatio() {
        // 16:9 → ratio h/w = 0.5625, sous le plancher 0.75.
        let h = postCardMediaHeight(mediaWidth: 1920, mediaHeight: 1080, cardWidth: cardWidth)
        XCTAssertEqual(h, 300) // 400 × 0.75
    }

    func test_postCardMediaHeight_squareIsInsideBounds_usesSourceRatio() {
        let h = postCardMediaHeight(mediaWidth: 1000, mediaHeight: 1000, cardWidth: cardWidth)
        XCTAssertEqual(h, 400) // 400 × 1.0
    }

    func test_postCardMediaHeight_fourFive_usesSourceRatio() {
        // 4:5 → 1.25, dans les bornes : ni rogné ni étiré.
        let h = postCardMediaHeight(mediaWidth: 1080, mediaHeight: 1350, cardWidth: cardWidth)
        XCTAssertEqual(h, 500) // 400 × 1.25
    }

    func test_postCardMediaHeight_unknownDimensions_fallsBackToMinRatio() {
        XCTAssertEqual(postCardMediaHeight(mediaWidth: nil, mediaHeight: nil, cardWidth: cardWidth), 300)
    }

    func test_postCardMediaHeight_zeroDimensions_fallsBackToMinRatio() {
        XCTAssertEqual(postCardMediaHeight(mediaWidth: 0, mediaHeight: 0, cardWidth: cardWidth), 300)
    }
}

/// **Ce que l'égalité de la carte voit de ce qui se TRADUIT** (#6560).
///
/// Recette staging du 2026-09-14 : une traduction de LÉGENDE de média reçue par
/// la socket atteignait le store du fil, et le plein écran de scène, monté par
/// la carte, ne la montrait pas — `FeedPostCard.==` comptait les traductions du
/// POST et rien des médias, donc `.equatable()` gardait la carte telle quelle.
final class FeedPostCardTranslatableSignatureTests: XCTestCase {

    private func post(captionTranslations: [String: String]? = nil,
                      caption: String? = "Caption test",
                      postTranslations: [String: PostTranslation]? = nil) -> FeedPost {
        FeedPost(
            id: "p1", author: "alice", authorId: "a1",
            content: "Contenu du post",
            media: [FeedMedia(id: "m1", type: .image, caption: caption,
                              captionLanguage: "en", captionTranslations: captionTranslations)],
            translations: postTranslations
        )
    }

    func test_uneTraductionDeLegendeArrivee_changeLaSignature() {
        XCTAssertNotEqual(
            FeedPostCard.translatableSignature(of: post(captionTranslations: ["fr": "Légende"])),
            FeedPostCard.translatableSignature(of: post(captionTranslations: ["fr": "Légende", "zh": "标题"]))
        )
    }

    func test_uneLegendeModifiee_changeLaSignature() {
        XCTAssertNotEqual(
            FeedPostCard.translatableSignature(of: post(caption: "Avant")),
            FeedPostCard.translatableSignature(of: post(caption: "Après"))
        )
    }

    func test_uneTraductionDuPostArrivee_changeToujoursLaSignature() {
        XCTAssertNotEqual(
            FeedPostCard.translatableSignature(of: post()),
            FeedPostCard.translatableSignature(of: post(postTranslations: ["en": PostTranslation(text: "Post content")]))
        )
    }

    func test_deuxPostsIdentiques_ontLaMemeSignature() {
        XCTAssertEqual(
            FeedPostCard.translatableSignature(of: post(captionTranslations: ["fr": "Légende"])),
            FeedPostCard.translatableSignature(of: post(captionTranslations: ["fr": "Légende"]))
        )
    }

    /// L'égalité de la carte passe par la signature — sinon la règle testée
    /// ci-dessus ne gouvernerait aucun rendu.
    func test_legaliteDeLaCarte_compareLaSignature() throws {
        let fichier = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/FeedPostCard.swift")
        let code = try String(contentsOf: fichier, encoding: .utf8)
        let debut = try XCTUnwrap(code.range(of: "extension FeedPostCard: Equatable"), "L'égalité de la carte a disparu.")
        let egalite = String(code[debut.lowerBound...].prefix(2400))
        XCTAssertTrue(egalite.contains("Self.translatableSignature(of: lhs.post) == Self.translatableSignature(of: rhs.post)"),
                      "L'égalité de la carte ignore ce qui se traduit : une légende traduite en direct ne redessine rien.")
    }
}
