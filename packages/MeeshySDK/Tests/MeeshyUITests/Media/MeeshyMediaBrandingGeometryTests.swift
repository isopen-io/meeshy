import AVFoundation
import CoreGraphics
import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// Règles PURES du marquage des médias enregistrés — la géométrie du bake
/// vidéo et les timings de la signature sonore, testables sans encoder quoi
/// que ce soit.
final class MeeshyMediaBrandingGeometryTests: XCTestCase {

    // MARK: - Orientation vidéo

    func test_orientedSize_portraitRotation_swapsDimensions() {
        let natural = CGSize(width: 1920, height: 1080)
        let rotated = CGAffineTransform(rotationAngle: .pi / 2)

        let oriented = MeeshyVideoWatermarkBaker.orientedSize(natural: natural, transform: rotated)

        XCTAssertEqual(oriented.width, 1080, accuracy: 0.5)
        XCTAssertEqual(oriented.height, 1920, accuracy: 0.5,
                       "Une vidéo tournée se rend en portrait — c'est ce gabarit que voit le spectateur")
    }

    func test_orientedSize_identity_keepsNaturalSize() {
        let natural = CGSize(width: 1280, height: 720)

        let oriented = MeeshyVideoWatermarkBaker.orientedSize(natural: natural, transform: .identity)

        XCTAssertEqual(oriented, natural)
    }

    func test_sizesMatch_toleratesTheEncoderEvenPixelRounding() {
        XCTAssertTrue(MeeshyVideoWatermarkBaker.sizesMatch(CGSize(width: 1080, height: 1921),
                                                           CGSize(width: 1080, height: 1920)))
        XCTAssertFalse(MeeshyVideoWatermarkBaker.sizesMatch(CGSize(width: 1920, height: 1080),
                                                            CGSize(width: 1080, height: 1920)),
                       "Un gabarit COUCHÉ face à un portrait n'est pas un arrondi : c'est la garde d'orientation")
    }

    // MARK: - Cadence d'animation

    func test_animationTime_quantizesSoTilesAreReused() {
        let fps = MeeshyVideoWatermarkBaker.animationFPS

        // Deux frames voisines d'une vidéo à 60 fps retombent sur la même tuile.
        XCTAssertEqual(MeeshyVideoWatermarkBaker.animationTime(for: 1.0),
                       MeeshyVideoWatermarkBaker.animationTime(for: 1.0 + 1.0 / 120.0),
                       "À 60 fps, une frame sur deux réutilise la tuile déjà rendue")
        // Mais deux instants séparés d'un intervalle d'animation, non.
        XCTAssertNotEqual(MeeshyVideoWatermarkBaker.animationTime(for: 1.0),
                          MeeshyVideoWatermarkBaker.animationTime(for: 1.0 + 1.0 / fps))
    }

    func test_animationTime_clampsNonFiniteAndNegativeTimes() {
        XCTAssertEqual(MeeshyVideoWatermarkBaker.animationTime(for: -3), 0)
        XCTAssertEqual(MeeshyVideoWatermarkBaker.animationTime(for: .nan), 0,
                       "Un temps indéfini ne doit pas propager un NaN jusqu'au rendu")
    }

    // MARK: - Bloc du filigrane

    @MainActor
    func test_blockRect_staysInsideTheFrame_inBothCorners() throws {
        let watermark = try XCTUnwrap(MeeshyExportWatermark.make(username: "alice"))
        let size = CGSize(width: 1080, height: 1920)

        let first = watermark.blockRect(renderSize: size, at: 1)
        let second = watermark.blockRect(renderSize: size, at: StoryExportWatermark.segmentDuration + 1)

        XCTAssertTrue(CGRect(origin: .zero, size: size).contains(first))
        XCTAssertTrue(CGRect(origin: .zero, size: size).contains(second))
        XCTAssertNotEqual(first.origin, second.origin,
                          "Le filigrane change de coin d'un segment à l'autre")
    }

    // MARK: - Timings de la signature sonore

    func test_leadingPlacement_putsTheSignatureFirst_andPushesTheContent() {
        let signature = MeeshyAudioSignature.signatureDuration(for: .leading)

        XCTAssertEqual(MeeshyAudioSignature.signatureStart(contentDuration: 12, placement: .leading), 0,
                       "En tête : la signature ouvre le fichier")
        XCTAssertEqual(
            MeeshyAudioSignature.contentStart(signatureDuration: signature, placement: .leading),
            signature + MeeshyAudioSignature.gap,
            accuracy: 0.0001,
            "Le contenu entre APRÈS la signature et son silence de séparation")
    }

    func test_trailingPlacement_leavesTheContentFirst() {
        XCTAssertEqual(MeeshyAudioSignature.contentStart(placement: .trailing), 0)
        XCTAssertEqual(
            MeeshyAudioSignature.signatureStart(contentDuration: 12, placement: .trailing),
            12 + MeeshyAudioSignature.gap,
            accuracy: 0.0001)
    }

    func test_totalDuration_neverOverlapsContentAndSignature() {
        let signature = MeeshyAudioSignature.signatureDuration(for: .leading)

        let total = MeeshyAudioSignature.totalDuration(contentDuration: 12, signatureDuration: signature)

        XCTAssertEqual(total, 12 + MeeshyAudioSignature.gap + signature, accuracy: 0.0001,
                       "Le contenu de l'auteur n'est jamais recouvert par la marque")
    }

    func test_signatureDuration_followsThePlacementMotif() {
        XCTAssertEqual(MeeshyAudioSignature.signatureDuration(for: .leading),
                       MeeshyBrandJingle.duration,
                       "En tête : l'arpège ASCENDANT, celui qui ouvre un export de story")
        XCTAssertEqual(MeeshyAudioSignature.signatureDuration(for: .trailing),
                       MeeshyBrandJingle.outroDuration,
                       "En queue : la cadence DESCENDANTE, celle qui referme")
    }
}
