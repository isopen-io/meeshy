import XCTest
import MeeshySDK
@testable import Meeshy

/// #10370 — « Le travail sur les médias doit éviter à présent d'avoir l'icône
/// télécharger quand le média EST DÉJÀ TÉLÉCHARGÉ ! »
///
/// La présence d'un média sur l'appareil se lit par UNE règle synchrone
/// (`AttachmentDownloadCenter.isOnDevice`) : un `stat`, sous la clé exacte
/// du cache typé, sans saut d'acteur. Chaque surface la consulte AU PREMIER
/// RENDU — avant elle, la bulle et la galerie partaient de `.needsDownload`
/// et dessinaient « ↓ » le temps que la résolution asynchrone revienne, et le
/// badge d'image ignorait la variante effectivement affichée.
@MainActor
final class AttachmentOnDevicePresenceTests: XCTestCase {

    // MARK: - Factories

    private func makeImage(
        fileUrl: String = "2025/10/x/p.jpg",
        variants: [MeeshyImageVariant]? = nil
    ) -> MessageAttachment {
        MessageAttachment(
            id: "att-img-\(UUID().uuidString)",
            mimeType: "image/jpeg",
            fileUrl: fileUrl,
            uploadedBy: "user-test",
            imageVariants: variants
        )
    }

    private func makeVideo(fileUrl: String = "2025/10/x/v.mp4") -> MessageAttachment {
        MessageAttachment(
            id: "att-vid-\(UUID().uuidString)",
            mimeType: "video/mp4",
            fileUrl: fileUrl,
            uploadedBy: "user-test"
        )
    }

    private func makeAudio(fileUrl: String = "2025/10/x/a.m4a") -> MessageAttachment {
        MessageAttachment(
            id: "att-aud-\(UUID().uuidString)",
            mimeType: "audio/mp4",
            fileUrl: fileUrl,
            uploadedBy: "user-test"
        )
    }

    /// La clé sous laquelle le cache typé range une URL — résolue
    /// indépendamment de la règle testée.
    private func resolvedKey(_ raw: String) -> String {
        MeeshyConfig.resolveMediaURL(raw)?.absoluteString ?? raw
    }

    // MARK: - isOnDevice(urlString:kind:)

    func test_isOnDevice_rawStorageKeyWithResolvedURLOnDisk_isTrue() {
        let raw = "2025/10/x/p.jpg"
        let onDisk = resolvedKey(raw)
        XCTAssertNotEqual(onDisk, raw, "la clé brute doit se résoudre en URL complète")

        let present = AttachmentDownloadCenter.isOnDevice(
            urlString: raw,
            kind: .image,
            stat: { key, _ in key == onDisk }
        )

        XCTAssertTrue(present, "un média rangé sous son URL résolue est sur l'appareil, même cité par sa clé brute")
    }

    func test_isOnDevice_nothingOnDisk_isFalse() {
        let present = AttachmentDownloadCenter.isOnDevice(
            urlString: "2025/10/x/p.jpg",
            kind: .image,
            stat: { _, _ in false }
        )

        XCTAssertFalse(present)
    }

    func test_isOnDevice_emptyURL_isFalse() {
        let present = AttachmentDownloadCenter.isOnDevice(
            urlString: "",
            kind: .video,
            stat: { _, _ in true }
        )

        XCTAssertFalse(present, "une URL vide ne désigne aucun média")
    }

    func test_isOnDevice_existingFileURL_isTrueWithoutTypedStore() {
        let present = AttachmentDownloadCenter.isOnDevice(
            urlString: "file:///tmp/meeshy/optimistic.mp4",
            kind: .video,
            stat: { _, _ in false },
            fileExists: { $0 == "/tmp/meeshy/optimistic.mp4" }
        )

        XCTAssertTrue(present, "un média local optimiste est sur l'appareil par définition")
    }

    func test_isOnDevice_missingFileURL_isFalse() {
        let present = AttachmentDownloadCenter.isOnDevice(
            urlString: "file:///tmp/meeshy/gone.mp4",
            kind: .video,
            stat: { _, _ in true },
            fileExists: { _ in false }
        )

        XCTAssertFalse(present)
    }

    func test_isOnDevice_probesTheTypedStoreOfItsKind() {
        var probedVideo = false
        _ = AttachmentDownloadCenter.isOnDevice(
            urlString: "https://cdn.example.com/v.mp4",
            kind: .video,
            stat: { _, kind in
                if case .video = kind { probedVideo = true }
                return false
            }
        )

        XCTAssertTrue(probedVideo, "une vidéo se cherche dans le cache vidéo")
    }

    // MARK: - isOnDevice(_ attachment:displayedURL:) — images

    func test_isOnDevice_imageWhoseDisplayedVariantIsOnDisk_isTrue() {
        let variant = "https://cdn.example.com/2025/10/x/p_640.webp"
        let image = makeImage()

        let present = AttachmentDownloadCenter.isOnDevice(
            image,
            displayedURL: variant,
            stat: { key, _ in key == variant }
        )

        XCTAssertTrue(present, "la variante affichée par la bulle est sur le disque : aucun badge « télécharger »")
    }

    func test_isOnDevice_imageWithADeclaredVariantOnDisk_isTrue() {
        let variant = "https://cdn.example.com/2025/10/x/p_320.webp"
        let image = makeImage(variants: [MeeshyImageVariant(width: 320, height: 240, url: variant, size: 9_000)])

        let present = AttachmentDownloadCenter.isOnDevice(
            image,
            stat: { key, _ in key == variant }
        )

        XCTAssertTrue(present, "toute variante de l'image présente sur l'appareil la rend disponible")
    }

    func test_isOnDevice_imageWithNoCandidateOnDisk_isFalse() {
        let image = makeImage(variants: [
            MeeshyImageVariant(width: 320, height: 240, url: "https://cdn.example.com/p_320.webp", size: 9_000)
        ])

        let present = AttachmentDownloadCenter.isOnDevice(
            image,
            displayedURL: "https://cdn.example.com/p_640.webp",
            stat: { _, _ in false }
        )

        XCTAssertFalse(present, "rien sur le disque : le badge reste")
    }

    func test_isOnDevice_audioAttachmentOnDisk_isTrue() {
        let audio = makeAudio()
        let onDisk = resolvedKey(audio.fileUrl)

        let present = AttachmentDownloadCenter.isOnDevice(audio, stat: { key, _ in key == onDisk })

        XCTAssertTrue(present)
    }

    // MARK: - Premier rendu des résolveurs

    func test_videoAtFirstRender_fileOnDisk_isReady() {
        let video = makeVideo()
        let onDisk = resolvedKey(video.fileUrl)

        let availability = VideoAvailability.atFirstRender(for: video, stat: { key, _ in key == onDisk })

        XCTAssertEqual(availability, .ready, "une vidéo déjà sur l'appareil se dessine prête, jamais « ↓ »")
    }

    func test_videoAtFirstRender_fileNotOnDisk_needsDownload() {
        let availability = VideoAvailability.atFirstRender(for: makeVideo(), stat: { _, _ in false })

        XCTAssertEqual(availability, .needsDownload)
    }

    func test_audioAtFirstRender_fileOnDisk_isReady() {
        let audio = makeAudio()
        let onDisk = resolvedKey(audio.fileUrl)

        let availability = AudioAvailability.atFirstRender(for: audio, stat: { key, _ in key == onDisk })

        XCTAssertEqual(availability, .ready, "un vocal déjà sur l'appareil se dessine prêt, jamais « ↓ »")
    }

    func test_audioAtFirstRender_fileNotOnDisk_needsDownload() {
        let availability = AudioAvailability.atFirstRender(for: makeAudio(), stat: { _, _ in false })

        XCTAssertEqual(availability, .needsDownload)
    }

    // MARK: - La source de la case : ce qui est sur l'appareil d'abord

    private func bubbleVariants() -> [MeeshyImageVariant] {
        [480, 960, 1920].map { MeeshyImageVariant(width: $0, height: $0 * 3 / 4, url: "2025/10/x/p_\($0).webp", size: $0 * 100) }
    }

    /// Une photo téléchargée par le bouton de la bulle (l'ORIGINAL) restait
    /// floue : la case affichait la variante 960, absente du disque, que la
    /// politique d'auto-téléchargement continuait de retenir.
    func test_bubbleImageSource_originalOnDevice_variantAbsent_showsTheOriginal() {
        let original = "2025/10/x/p.jpg"

        let shown = BubbleImageSourceLaw.displayedURL(
            variants: bubbleVariants(), originalURL: original, originalWidth: 4032, targetWidthPx: 900,
            isOnDevice: { $0 == original }
        )

        XCTAssertEqual(shown, original, "l'original sur le disque l'emporte sur une variante qu'il faudrait encore télécharger")
    }

    func test_bubbleImageSource_nothingOnDevice_showsTheLightestCoveringVariant() {
        let shown = BubbleImageSourceLaw.displayedURL(
            variants: bubbleVariants(), originalURL: "2025/10/x/p.jpg", originalWidth: 4032, targetWidthPx: 900,
            isOnDevice: { _ in false }
        )

        XCTAssertEqual(shown, "2025/10/x/p_960.webp")
    }

    func test_bubbleImageSource_largerCoveringVariantOnDevice_beatsTheNetworkPick() {
        let shown = BubbleImageSourceLaw.displayedURL(
            variants: bubbleVariants(), originalURL: "2025/10/x/p.jpg", originalWidth: 4032, targetWidthPx: 900,
            isOnDevice: { $0 == "2025/10/x/p_1920.webp" || $0 == "2025/10/x/p.jpg" }
        )

        XCTAssertEqual(shown, "2025/10/x/p_1920.webp", "la plus légère des formes déjà sur l'appareil qui couvre la case")
    }

    func test_bubbleImageSource_tooNarrowVariantOnDevice_isNeverShown() {
        let shown = BubbleImageSourceLaw.displayedURL(
            variants: bubbleVariants(), originalURL: "2025/10/x/p.jpg", originalWidth: 4032, targetWidthPx: 900,
            isOnDevice: { $0 == "2025/10/x/p_480.webp" }
        )

        XCTAssertEqual(shown, "2025/10/x/p_960.webp", "une variante trop étroite pour la case ne la sert jamais")
    }

    func test_bubbleImageSource_emptyOriginal_isNil() {
        XCTAssertNil(BubbleImageSourceLaw.displayedURL(
            variants: [], originalURL: "", originalWidth: nil, targetWidthPx: 900, isOnDevice: { _ in true }
        ))
    }

    /// La case apprend la fin du téléchargement du bouton par le centre, et
    /// la source qu'elle affiche bascule alors vers l'original.
    func test_bubbleImageSource_finishedDownloadOfTheOriginal_switchesTheCellToTheOriginal() {
        let original = "2025/10/x/landing-\(UUID().uuidString).jpg"
        let center = AttachmentDownloadCenter()
        var landed = false
        let watch = center.events(for: AttachmentDownloadCenter.key(for: original))
            .sink { landed = landed || BubbleImageSourceLaw.marksOriginalLanding($0) }
        defer { watch.cancel() }
        let shown = {
            BubbleImageSourceLaw.displayedURL(
                variants: self.bubbleVariants(), originalURL: original, originalWidth: 4032, targetWidthPx: 900,
                isOnDevice: { landed && $0 == original }
            )
        }
        XCTAssertEqual(shown(), "2025/10/x/p_960.webp")

        center.publish(.progress(.init(downloadedBytes: 10, totalBytes: 100)), for: AttachmentDownloadCenter.key(for: original))
        XCTAssertEqual(shown(), "2025/10/x/p_960.webp", "une progression ne fait rien basculer")

        center.publish(.finished(totalBytes: 100), for: AttachmentDownloadCenter.key(for: original))
        XCTAssertEqual(shown(), original)
    }

    func test_marksOriginalLanding_onlyOnFinished() {
        XCTAssertTrue(BubbleImageSourceLaw.marksOriginalLanding(.finished(totalBytes: 1)))
        XCTAssertFalse(BubbleImageSourceLaw.marksOriginalLanding(.failed))
        XCTAssertFalse(BubbleImageSourceLaw.marksOriginalLanding(.cancelled))
    }

    /// Une forme `file://` est déjà sur l'appareil (la politique ne retient
    /// jamais une lecture locale).
    func test_bubbleImageSource_productionPredicate_localFileIsOnDevice() {
        XCTAssertTrue(BubbleImageSourceLaw.isOnDevice("file:///tmp/whatever.jpg"))
        XCTAssertFalse(BubbleImageSourceLaw.isOnDevice("2025/10/x/never-\(UUID().uuidString).jpg"))
    }
}
