import XCTest

/// **Garde anti-retour (#11844)** : une vignette vidéo passe par
/// `VideoThumbnailGenerator`. `AVAssetImageGenerator` ne se construit plus que
/// dans le générateur et dans les sites qui extraient autre chose qu'une
/// vignette — chacun nommé ici avec sa raison.
final class VideoThumbnailGeneratorSourceGuardTests: XCTestCase {

    private static let allowed: [String: String] = [
        "packages/MeeshySDK/Sources/MeeshySDK/Media/VideoThumbnailGenerator.swift": "le générateur",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryAVCompositor.swift": "export : images pleine définition à l'instant exact",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Canvas/StoryForegroundVideoFrameSource.swift": "export : une image par trame de rendu",
        "apps/ios/Meeshy/Features/Main/Export/MessageCardMotionExporter.swift": "export animé : une image par trame",
        "apps/ios/Meeshy/Features/Vitrine/VitrineReel.swift": "affiche pleine définition écrite une fois sur disque, jamais réaffichée",
    ]

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media/
            .deletingLastPathComponent()   // MeeshySDKTests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .deletingLastPathComponent()   // packages/
            .deletingLastPathComponent()   // racine
    }

    private func swiftFiles(under relative: String) -> [String] {
        let root = Self.repositoryRoot
        let base = root.appendingPathComponent(relative)
        let enumerator = FileManager.default.enumerator(at: base, includingPropertiesForKeys: nil)
        return (enumerator?.allObjects as? [URL] ?? [])
            .filter { $0.pathExtension == "swift" }
            .map { String($0.standardizedFileURL.path.dropFirst(root.standardizedFileURL.path.count + 1)) }
    }

    func test_onlyTheGeneratorAndTheExportSites_buildAnImageGenerator() throws {
        let root = Self.repositoryRoot
        let files = swiftFiles(under: "packages/MeeshySDK/Sources") + swiftFiles(under: "apps/ios/Meeshy")
        XCTAssertFalse(files.isEmpty, "les sources doivent être lisibles depuis le témoin")

        let offenders = try files.filter { path in
            let text = try String(contentsOf: root.appendingPathComponent(path), encoding: .utf8)
            return text.contains("AVAssetImageGenerator(")
        }.filter { Self.allowed[$0] == nil }

        XCTAssertEqual(offenders, [], "une vignette passe par VideoThumbnailGenerator")
    }
}
