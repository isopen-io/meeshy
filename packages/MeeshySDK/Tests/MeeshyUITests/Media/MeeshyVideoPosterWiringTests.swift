import XCTest
@testable import MeeshyUI

/// Plein écran NET (feature 3), côté SDK.
///
/// Ce que ces tests tiennent : (1) les deux décisions PURES du renderer plein
/// écran — le poster reste à l'écran tant qu'aucune frame n'est COMPOSÉE, le
/// spinner ne tourne que pendant un vrai chargement ; (2) quatre câblages que
/// ViewInspector ne peut pas introspecter, verrouillés en gardes de source (le
/// patron du dépôt, cf. `ImageFullscreenAutoLoadWiringTests`). Le code est lu
/// commentaires retirés : on ancre sur les expressions, pas sur la prose.
@MainActor
final class MeeshyVideoPosterWiringTests: XCTestCase {

    // MARK: - Décisions pures

    /// Leçon 24 (`tasks/lessons.md`) : jamais gater sur `player.currentItem` —
    /// on arme sur la présence du PLAYER + `isReadyForDisplay`.
    func test_showsPoster_untilTheSurfaceHasComposedItsFirstFrame() {
        XCTAssertTrue(_FullscreenRenderer.showsPoster(playerPresent: false, surfaceReady: false))
        XCTAssertTrue(_FullscreenRenderer.showsPoster(playerPresent: true, surfaceReady: false),
                      "player attaché mais aucune frame composée : le poster net reste, sinon l'écran est NOIR")
        XCTAssertFalse(_FullscreenRenderer.showsPoster(playerPresent: true, surfaceReady: true))
    }

    func test_showsPoster_againAfterEndOfStreamReleasesThePlayer() {
        XCTAssertTrue(_FullscreenRenderer.showsPoster(playerPresent: false, surfaceReady: true))
    }

    func test_loadingSpinner_onlyWhileAFrameIsActuallyBeingPrepared() {
        XCTAssertTrue(_FullscreenRenderer.showsLoadingSpinner(playerPresent: true, surfaceReady: false, didInitialLoad: true))
        XCTAssertFalse(_FullscreenRenderer.showsLoadingSpinner(playerPresent: true, surfaceReady: true, didInitialLoad: true))
        XCTAssertTrue(_FullscreenRenderer.showsLoadingSpinner(playerPresent: false, surfaceReady: false, didInitialLoad: false),
                      "avant le premier load, le spinner discret accompagne le poster")
        XCTAssertFalse(_FullscreenRenderer.showsLoadingSpinner(playerPresent: false, surfaceReady: false, didInitialLoad: true),
                       "fin de flux (player relâché) : poster sans spinner — rien ne charge")
    }

    // MARK: - Gardes de source

    private func sdkSource(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private func block(from startMarker: String, upTo endMarker: String, in source: String) throws -> String {
        guard let start = source.range(of: startMarker) else {
            XCTFail("Marker not found: \(startMarker)")
            return ""
        }
        let end = source.range(of: endMarker, range: start.upperBound..<source.endIndex)?.lowerBound
            ?? source.endIndex
        return String(source[start.lowerBound..<end])
    }

    /// Ouvrir un avatar/bannière plein écran est un geste manuel (§14.1) : la
    /// politique réseau ambiante (Low Data / Wi-Fi seul) ne doit jamais laisser
    /// le viewer sur un spinner infini.
    func test_fullscreenImageView_forcesAutoLoad_bypassingPolicyGate() throws {
        let source = try sdkSource("Sources/MeeshyUI/Profile/FullscreenImageView.swift")
        XCTAssertTrue(source.contains("CachedAsyncImage(url: urlString, autoLoad: true)"),
                      "FullscreenImageView doit forcer autoLoad:true — même règle qu'ImageFullscreen.")
    }

    /// Le poster net tient l'écran pendant le spin-up décodeur : plus de
    /// `ProgressView` sur NOIR entre `manager.load` et la première frame.
    func test_fullscreenRenderer_mountsThePoster_untilTheFirstFrame() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        )
        let content = try block(from: "private var playerContent: some View {", upTo: "private var authorAndCaptionOverlay", in: source)
        XCTAssertTrue(content.contains("posterLayer"), "playerContent doit monter `posterLayer`")
        XCTAssertTrue(content.contains("guard !didInitialLoad else { return }"),
                      "le bloc de chargement initial reste intact (garde AttachmentIdWiring)")
        XCTAssertTrue(content.contains("showsPoster(playerPresent: manager.player != nil, surfaceReady: surfaceReady)"),
                      "la visibilité du poster passe par la décision pure — pas par `manager.player == nil` seul")
        XCTAssertTrue(content.contains("onReadyForDisplay:"),
                      "la surface doit signaler sa première frame composée (KVO isReadyForDisplay)")
    }

    /// Overlay de téléchargement : une frame NETTE se sert telle quelle — ni
    /// `.blur` ni voile. Le flou reste réservé au repli vignette/thumbHash.
    func test_fullscreenRenderer_downloadOverlay_servesASharpPoster_withoutBlur() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        )
        let overlay = try block(from: "private var downloadOverlay: some View {", upTo: "private var downloadOverlayIcon", in: source)
        let sharpBranch = try block(from: "if let poster {", upTo: "} else", in: overlay)
        XCTAssertFalse(sharpBranch.isEmpty, "downloadOverlay doit avoir une branche `if let poster`")
        XCTAssertFalse(sharpBranch.contains(".blur("), "une frame nette ne se floute pas")
        XCTAssertFalse(sharpBranch.contains(".overlay(Color.black.opacity("), "une frame nette ne se voile pas")
    }

    /// `MeeshyVideoThumbnail` relisait son poster persisté par `cachedData`
    /// (NSCache mémoire, vide à chaque relance) : le poster était re-extrait
    /// (1 Mo réseau) à chaque ouverture froide. La relecture passe par le DISQUE.
    func test_videoThumbnail_rereadsThePersistedPosterFromDisk() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoThumbnail.swift")
        )
        XCTAssertTrue(source.contains("cachedFileURL(for: thumbKey)"),
                      "la relecture du poster persisté doit interroger le disque (`cachedFileURL`)")
        XCTAssertFalse(source.contains("cachedData(for: thumbKey)"),
                       "`cachedData` ne voit que la NSCache mémoire — le poster disque était invisible après relance")
        XCTAssertTrue(source.contains("static func extractRemoteFirstFrame("),
                      "l'extraction distante par Range est un atome réutilisable (cascade poster côté app)")
    }

    /// La surface signale sa première frame COMPOSÉE par KVO sur
    /// `AVPlayerLayer.isReadyForDisplay` — le signal qui ne dépend que du layer.
    func test_videoSurface_reportsItsFirstFrame_viaIsReadyForDisplayKVO() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoSurface.swift")
        )
        XCTAssertTrue(source.contains("observe(\\.isReadyForDisplay"))
        XCTAssertTrue(source.contains("var onReadyForDisplay: (() -> Void)? = nil"),
                      "paramètre opaque à défaut nil : aucun call site existant ne change")
    }
}
