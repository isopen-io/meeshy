import XCTest
import AVFoundation
@testable import Meeshy

/// **Valider une prise en segments concatène sans ré-encoder — sauf quand les
/// pistes ne le permettent pas.**
///
/// La vue `4b` de `MeeshyComposerMobile.dc.html` fait de la concaténation sans
/// ré-encodage un CONTRAT, pas une optimisation : « valider concatène des
/// pistes déjà encodées, ce qui rend la sortie quasi instantanée quelle que
/// soit la durée ». `mergeSegments` exportait en
/// `AVAssetExportPresetHighestQuality` — un ré-encodage dont le coût croît avec
/// la durée totale, ce qui contredit exactement la promesse mesurable de la
/// planche `4e`.
///
/// **Le piège que ces témoins protègent.** Poser `Passthrough` sans condition
/// aurait échangé un export lent contre une prise PERDUE :
/// `AVAssetExportPresetPassthrough` rend `nil` sur des pistes hétérogènes, et
/// le dépôt en produit — `switchCamera()` pendant l'enregistrement clôt un
/// segment et en ouvre un sur l'autre caméra, aux dimensions différentes. Le
/// défaut n'aurait sauté aux yeux qu'en basculant de caméra en cours de prise.
final class CameraSegmentMergePolicyTests: XCTestCase {

    private static let h264: FourCharCode = kCMVideoCodecType_H264

    private func format(width: Int32, height: Int32,
                        codec: FourCharCode = h264) -> SegmentVideoFormat {
        SegmentVideoFormat(codec: codec, width: width, height: height)
    }

    // MARK: - Le cas nominal de la vue 4b : plusieurs MAINTENIR, une caméra

    func test_segmentsHomogenes_concatenentSansReencodage() {
        let formats = [
            format(width: 1080, height: 1920),
            format(width: 1080, height: 1920),
            format(width: 1080, height: 1920),
        ]
        XCTAssertEqual(
            CameraSegmentMergePolicy.preset(formats: formats, readableSegmentCount: 3),
            AVAssetExportPresetPassthrough,
            """
            Trois segments identiques — le cas nominal de la vue 4b (trois \
            MAINTENIR sur la même caméra) — doivent se concaténer en \
            passthrough. C'est ce qui rend la validation « quasi instantanée \
            quelle que soit la durée » ; un ré-encodage ici fait payer la durée \
            totale à chaque validation.
            """
        )
    }

    func test_unSeulSegment_concatenneSansReencodage() {
        XCTAssertEqual(
            CameraSegmentMergePolicy.preset(formats: [format(width: 1080, height: 1920)],
                                            readableSegmentCount: 1),
            AVAssetExportPresetPassthrough
        )
    }

    // MARK: - Le cas mixte : une bascule de caméra en cours de prise

    func test_dimensionsDifferentes_reencodent() {
        let formats = [
            format(width: 1080, height: 1920),
            format(width: 720, height: 1280),
        ]
        XCTAssertEqual(
            CameraSegmentMergePolicy.preset(formats: formats, readableSegmentCount: 2),
            AVAssetExportPresetHighestQuality,
            """
            Une bascule de caméra en cours de prise produit des segments aux \
            dimensions différentes. Le passthrough y rendrait `nil` — la prise \
            entière serait PERDUE. Le ré-encodage est le bon prix ici.
            """
        )
    }

    func test_codecsDifferents_reencodent() {
        let formats = [
            format(width: 1080, height: 1920, codec: kCMVideoCodecType_H264),
            format(width: 1080, height: 1920, codec: kCMVideoCodecType_HEVC),
        ]
        XCTAssertEqual(
            CameraSegmentMergePolicy.preset(formats: formats, readableSegmentCount: 2),
            AVAssetExportPresetHighestQuality
        )
    }

    // MARK: - Ce qu'on n'a pas mesuré ne s'affirme pas

    func test_unSegmentSansFormatLisible_faitReencoder() {
        let formats = [format(width: 1080, height: 1920)]
        XCTAssertEqual(
            CameraSegmentMergePolicy.preset(formats: formats, readableSegmentCount: 2),
            AVAssetExportPresetHighestQuality,
            """
            Deux segments, un seul format lu : on ne peut pas AFFIRMER \
            l'homogénéité qu'on n'a pas mesurée. L'absence penche vers le \
            ré-encodage — se tromper ici coûte du temps, se tromper dans \
            l'autre sens coûte la prise.
            """
        )
    }

    func test_aucunFormat_faitReencoder() {
        XCTAssertEqual(
            CameraSegmentMergePolicy.preset(formats: [], readableSegmentCount: 0),
            AVAssetExportPresetHighestQuality
        )
    }
}
