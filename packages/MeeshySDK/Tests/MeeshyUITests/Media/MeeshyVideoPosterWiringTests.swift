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
    ///
    /// #3897 — lisait la source BRUTE (`sdkSource`, sans `stripComments`) :
    /// la seule raison pour laquelle `source.contains("autoLoad: true")`
    /// passait était que le COMMENTAIRE au-dessus de l'appel formule
    /// littéralement « autoLoad: true » — la garde passait par chance de
    /// formulation, pas par le contenu réel. Doublement faux depuis #3897
    /// (le paramètre est désormais `autoLoad: autoLoad`, threadé, plus une
    /// valeur codée en dur) : ciblée sur le câblage réel, sur source nettoyée.
    func test_fullscreenImageView_threadsAutoLoad_toCachedAsyncImage() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Profile/FullscreenImageView.swift")
        )
        XCTAssertTrue(source.contains("CachedAsyncImage(url: urlString, targetSize: WindowMetrics.windowSize, autoLoad: autoLoad)"),
                      "le paramètre exposé (#3897) doit être threadé jusqu'au chargeur — jamais une valeur codée en dur")
    }

    /// #3897 — la décision produit `autoLoad: true` (bypass §14.1) est
    /// désormais un PARAMÈTRE, pas une valeur codée en dur : un futur appelant
    /// sans geste explicite (ex. un aperçu ambiante) peut demander `false`
    /// sans dupliquer la vue. Le défaut reste `true` — comportement inchangé
    /// pour l'unique appelant existant (`UserProfileSheet`).
    func test_fullscreenImageView_autoLoad_defaultsToTrue_butIsOverridable() {
        let defaulted = FullscreenImageView(imageURL: "https://cdn.meeshy.me/x.jpg", fallbackText: "A", accentColor: "#FFFFFF")
        XCTAssertTrue(defaulted.autoLoad)

        let overridden = FullscreenImageView(imageURL: "https://cdn.meeshy.me/x.jpg", fallbackText: "A", accentColor: "#FFFFFF", autoLoad: false)
        XCTAssertFalse(overridden.autoLoad)
    }

    /// #3895 (défaut 2) : sans `targetSize`, le décodage plafonnait au budget
    /// PAR DÉFAUT du pipeline (1200 px, cf. doc-comment `CachedAsyncImage
    /// .targetSize`) quel que soit l'écran — flou sur une fenêtre plus large
    /// (iPad), gaspillage mémoire sur une fenêtre plus petite. Aucune variante
    /// responsive n'existe pour un avatar/bannière (`MeeshyUser.avatarURL` /
    /// `.bannerURL` sont de simples chaînes, contrairement à
    /// `MessageAttachment.imageVariants`) : `ImageVariantSelector.bestImageURL`
    /// y serait un no-op (candidats vides → retourne toujours l'original,
    /// cf. son étape 5) — le levier applicable ici est le budget de décodage,
    /// pas la sélection d'URL. `WindowMetrics.windowSize`, pas
    /// `UIScreen.main.bounds` : seuls `WindowMetrics.swift` et
    /// `CachedAsyncImage.swift` peuvent lire l'écran physique
    /// (`WindowMetricsSourceGuardTests`).
    func test_fullscreenImageView_sizesDecodeToTheWindow_neverTheDefaultPipelineCap() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Profile/FullscreenImageView.swift")
        )
        XCTAssertTrue(source.contains("targetSize: WindowMetrics.windowSize"),
                      "le décodage plein écran doit couvrir la fenêtre réelle, pas un plafond fixe")
        XCTAssertFalse(source.contains("UIScreen.main.bounds"),
                       "la mesure passe par WindowMetrics — seul son dernier recours lit l'écran physique")
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

    // MARK: - #3895 (défaut 3) : le spinner ne distinguait pas fin de flux de player jamais chargé

    /// `SharedAVPlayerManager.load` peut retomber dans son repli réseau
    /// supprimé (§4.10) et laisser `player` `nil` alors que
    /// `player.availability` affirmait `.ready` — l'appelant n'avait pas
    /// gaté correctement. `load()` est SYNCHRONE (aucun repli réseau en
    /// vol) : lire `manager.player` juste après l'appel suffit à distinguer
    /// définitivement l'échec du succès, jamais un état « en cours ».
    func test_fullscreenRenderer_attemptLoad_detectsANoPlayerResult_synchronously() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        )
        let attempt = try block(from: "private func attemptLoad() {", upTo: "private func retryLoad", in: source)
        XCTAssertTrue(attempt.contains(
            "manager.load(urlString: player.attachment.fileUrl, attachmentId: player.attachment.id)"))
        XCTAssertTrue(attempt.contains("if manager.player == nil {"),
                      "load() étant synchrone, lire manager.player juste après suffit à constater l'échec")
        XCTAssertTrue(attempt.contains("loadFailed = true"))
        XCTAssertTrue(attempt.contains("manager.play()"), "le cas succès doit toujours démarrer la lecture")
    }

    /// Sans ce branchement, un échec de chargement laissait le poster figé
    /// pour toujours : `showsLoadingSpinner` rend correctement `false` (fin
    /// de flux légitime), mais rien ne distinguait alors « a fini de jouer »
    /// de « n'a jamais pu charger » — passé de « bloqué visiblement »
    /// (ancien `ProgressView`) à « bloqué silencieusement ».
    func test_fullscreenRenderer_readyButLoadFailed_showsTheDownloadOverlay_neverAFrozenPoster() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        )
        let body = try block(from: "var body: some View {", upTo: "private var isActive:", in: source)
        XCTAssertTrue(body.contains("if loadFailed {"),
                      "`.ready` doit basculer sur l'overlay de reprise quand le chargement synchrone a échoué")
        XCTAssertTrue(body.contains("downloadOverlay"))
        XCTAssertTrue(body.contains("playerContent"))
    }

    /// Le chargement initial et la reprise partagent le même atome —
    /// `attemptLoad()` — pour ne jamais diverger (le défaut même que ce lot
    /// corrige serait trivial à réintroduire dans une copie du bloc initial).
    func test_fullscreenRenderer_retryButton_reusesAttemptLoad_afterResettingActiveURL() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        )
        XCTAssertTrue(source.contains("retryLoad()"), "un bouton doit pouvoir redéclencher le chargement")
        let retry = try block(from: "private func retryLoad() {", upTo: "// MARK:", in: source)
        XCTAssertTrue(retry.contains("manager.stop()"),
                      "réinitialise activeURL avant de retenter — load() est un no-op sinon (URL déjà active)")
        XCTAssertTrue(retry.contains("attemptLoad()"))
        let onAppear = try block(from: "guard !didInitialLoad else { return }", upTo: "// Le poster NET reste", in: source)
        XCTAssertTrue(onAppear.contains("attemptLoad()"),
                      "le montage initial doit passer par le même atome que la reprise")
    }

    // MARK: - #3897 : reprise de la résolution de poster après téléchargement

    /// `.task(id: player.attachment.id)` ne rejoue qu'au changement
    /// d'attachment — un poster non résolu au premier montage (fichier pas
    /// encore local) ne l'était plus jamais une fois le fichier téléchargé
    /// via `downloadOverlay`. Miroir de `GalleryVideoPage.task(id:
    /// downloader.isCached)` côté app.
    func test_fullscreenRenderer_replaysPosterResolution_onceAvailabilityBecomesReady() throws {
        let source = ComposerSourceGuard.stripComments(
            try sdkSource("Sources/MeeshyUI/Media/MeeshyVideoPlayer+Renderers.swift")
        )
        XCTAssertTrue(source.contains(".task(id: player.availability == .ready) {"),
                      "comparaison en booléen — pas l'availability brute, qui changerait à chaque tick de progression")
        let replay = try block(from: ".task(id: player.availability == .ready) {",
                               upTo: ".task(id: manager.player != nil)", in: source)
        XCTAssertTrue(replay.contains("guard poster == nil, player.availability == .ready else { return }"))
        XCTAssertTrue(replay.contains("resolvePosterIfNeeded()"))
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
