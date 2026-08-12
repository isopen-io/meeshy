import XCTest
import SwiftUI
@testable import MeeshyUI

/// S5 — les deux points d'injection des amorces de page blanche.
///
/// Même doctrine que `\.storyLocationPicker` : le SDK ne connaît ni
/// AVCaptureSession ni PhotoKit, il expose une fabrique et PRÉSENTE ce que
/// l'app fournit. Le défaut `nil` n'est pas un détail d'implémentation, c'est
/// la règle produit — une amorce qui ouvre le vide est pire que pas d'amorce.
@MainActor
final class StoryCanvasStarterEnvironmentTests: XCTestCase {

    // MARK: - Caméra

    func test_storyCameraCapture_defaultValue_isNil_soTheCameraStarterStaysHidden() {
        XCTAssertNil(EnvironmentValues().storyCameraCapture)
    }

    func test_storyCameraCaptureProvider_photoCapture_forwardsTheImageToTheCallback() {
        var received: StoryCameraCapture?
        var appSideSink: ((StoryCameraCapture) -> Void)?
        let image = UIImage(systemName: "camera") ?? UIImage()
        let provider = StoryCameraCaptureProvider { onCapture in
            appSideSink = onCapture
            return AnyView(Color.clear)
        }

        _ = provider.makeView { received = $0 }
        appSideSink?(.photo(image))

        guard case .photo(let forwarded) = received else {
            return XCTFail("La photo capturée n'a pas été transmise")
        }
        XCTAssertEqual(forwarded, image)
    }

    func test_storyCameraCaptureProvider_videoCapture_forwardsTheURLToTheCallback() {
        var received: StoryCameraCapture?
        var appSideSink: ((StoryCameraCapture) -> Void)?
        let url = URL(fileURLWithPath: "/tmp/capture.mov")
        let provider = StoryCameraCaptureProvider { onCapture in
            appSideSink = onCapture
            return AnyView(Color.clear)
        }

        _ = provider.makeView { received = $0 }
        appSideSink?(.video(url))

        guard case .video(let forwarded) = received else {
            return XCTFail("L'URL de la vidéo capturée n'a pas été transmise")
        }
        XCTAssertEqual(forwarded, url)
    }

    // MARK: - Dernière photo de la pellicule

    func test_storyRecentCameraRollAsset_defaultValue_isNil_soTheThumbnailStaysHidden() {
        XCTAssertNil(EnvironmentValues().storyRecentCameraRollAsset)
    }

    func test_storyRecentCameraRollProvider_latest_forwardsTheAssetFromTheApp() async {
        let thumbnail = UIImage(systemName: "photo") ?? UIImage()
        let provider = StoryRecentCameraRollProvider(
            latest: { StoryRecentCameraRollAsset(identifier: "asset-1", thumbnail: thumbnail) },
            fullImage: { _ in nil },
            requestAccess: { nil }
        )

        let asset = await provider.latest()

        XCTAssertEqual(asset?.identifier, "asset-1")
        XCTAssertEqual(asset?.thumbnail, thumbnail)
    }

    /// Les deux fabriques sont DISTINCTES et c'est toute la règle produit :
    /// `latest()` (appelée à l'ouverture du composer) ne demande jamais rien,
    /// `requestAccess()` (appelée par le tap sur la capsule « Galerie ») est la
    /// seule à pouvoir prompter. Les confondre ramènerait l'alerte système sur
    /// un écran que l'utilisateur vient d'ouvrir pour écrire.
    func test_storyRecentCameraRollProvider_requestAccess_isASeamOfItsOwn() async {
        let granted = UIImage(systemName: "photo") ?? UIImage()
        let provider = StoryRecentCameraRollProvider(
            latest: { nil },
            fullImage: { _ in nil },
            requestAccess: { StoryRecentCameraRollAsset(identifier: "asset-9", thumbnail: granted) }
        )

        let beforeTap = await provider.latest()
        XCTAssertNil(beforeTap, "Accès non accordé : aucune vignette, et surtout aucune demande.")

        let afterTap = await provider.requestAccess()
        XCTAssertEqual(afterTap?.identifier, "asset-9",
                       "Le geste explicite obtient l'accès, et la dernière photo avec.")
    }

    func test_storyRecentCameraRollProvider_fullImage_resolvesTheRequestedIdentifier() async {
        let full = UIImage(systemName: "photo.fill") ?? UIImage()
        let askedFor = IdentifierProbe()
        let provider = StoryRecentCameraRollProvider(
            latest: { nil },
            fullImage: { id in
                askedFor.value = id
                return full
            },
            requestAccess: { nil }
        )

        let resolved = await provider.fullImage(for: "asset-42")

        XCTAssertEqual(askedFor.value, "asset-42")
        XCTAssertEqual(resolved, full)
    }

    func test_storyRecentCameraRollProvider_appReturnsNothing_yieldsNilWithoutCrashing() async {
        let provider = StoryRecentCameraRollProvider(
            latest: { nil }, fullImage: { _ in nil }, requestAccess: { nil })

        let asset = await provider.latest()

        XCTAssertNil(asset, "Pellicule vide ou permission refusée = aucune vignette, jamais un placeholder muet.")
    }
}

/// Boîte de référence : les fabriques injectées sont `@Sendable`, donc une
/// capture de `var` locale y est refusée. Le test a besoin d'observer
/// l'identifiant réellement demandé, pas de contourner l'isolation.
private final class IdentifierProbe: @unchecked Sendable {
    var value: String?
}
