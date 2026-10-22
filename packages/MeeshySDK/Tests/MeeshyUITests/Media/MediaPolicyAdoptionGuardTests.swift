import XCTest

/// **Tout lecteur vidéo créé lit la politique média (#9880).**
///
/// Un fichier de `MeeshyUI` ou de l'app qui crée un élément ou un lecteur
/// (`AVPlayerItem(`, `AVPlayer(url:`, `AVQueuePlayer(url:`) le remet à
/// `MediaPolicyMonitor.shared.adopt` — sauf les sites DÉCLARÉS ci-dessous,
/// chacun avec la raison qui le tient à part. Garde de SOURCE : un tampon fixe
/// posé à la main (le « 2 s » des couches de story) n'a aucune autre trace
/// observable qu'un lecteur qui ne refroidit pas.
final class MediaPolicyAdoptionGuardTests: XCTestCase {

    private static let declaredApart: [String: String] = [
        "apps/ios/Meeshy/Features/Main/Components/OverlayAudioPlayer.swift": "piste audio seule : ni décodeur vidéo ni images d'avance",
        "packages/MeeshySDK/Sources/MeeshyUI/Media/MeeshyAudioEditorView.swift": "piste audio seule",
        "packages/MeeshySDK/Sources/MeeshyUI/Media/PlaybackLoopQueue.swift": "le successeur recopie l'élément courant d'un lecteur DÉJÀ adopté, dont la file suit la politique",
        "apps/ios/Meeshy/Features/Main/Composer/ComposerEditSources.swift": "édition locale du composer (chaîne création) — suivi #11984",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/Timeline/Engine/StoryTimelineEngine.swift": "composition locale de la timeline (chaîne création) — suivi #11984",
        "packages/MeeshySDK/Sources/MeeshyUI/Story/TimelineExportFlow.swift": "aperçu d'un export local (chaîne création) — suivi #11984",
    ]

    private static var repoRoot: URL {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<6 { url.deleteLastPathComponent() }
        return url
    }

    private func swiftFiles(under relative: String) throws -> [(path: String, code: String)] {
        let root = Self.repoRoot.appendingPathComponent(relative)
        let enumerator = try XCTUnwrap(FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil))
        return try enumerator.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { url in
                (path: relative + (url.path.components(separatedBy: relative).last ?? ""),
                 code: try String(contentsOf: url, encoding: .utf8))
            }
    }

    private static func codeLines(_ code: String) -> [String] {
        code.components(separatedBy: "\n")
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
    }

    private static func createsAPlayer(_ code: String) -> Bool {
        codeLines(code).contains { line in
            ["AVPlayerItem(", "AVPlayer(url:", "AVQueuePlayer(url:"].contains { line.contains($0) }
        }
    }

    private static func adoptsThePolicy(_ code: String) -> Bool {
        codeLines(code).contains { $0.contains("MediaPolicyMonitor.shared.adopt(") }
    }

    func test_everyPlayerCreatingSite_adoptsTheMediaPolicy() throws {
        let files = try swiftFiles(under: "packages/MeeshySDK/Sources/MeeshyUI") + swiftFiles(under: "apps/ios/Meeshy")
        XCTAssertGreaterThan(files.count, 1_000, "la garde ne voit plus les sources")
        let offenders = files
            .filter { Self.createsAPlayer($0.code) && !Self.adoptsThePolicy($0.code) }
            .map { $0.path }
            .filter { Self.declaredApart[$0] == nil }
        XCTAssertEqual(offenders, [], "remettre l'élément ou le lecteur à MediaPolicyMonitor.shared.adopt")
    }

    func test_theDeclaredSites_stillCreateAPlayer() throws {
        for path in Self.declaredApart.keys {
            let code = try String(contentsOf: Self.repoRoot.appendingPathComponent(path), encoding: .utf8)
            XCTAssertTrue(Self.createsAPlayer(code), "\(path) ne crée plus de lecteur : le retirer de la liste")
        }
    }

    func test_noFixedForwardBuffer_isWrittenOutsideThePolicy() throws {
        let files = try swiftFiles(under: "packages/MeeshySDK/Sources/MeeshyUI") + swiftFiles(under: "apps/ios/Meeshy")
        let offenders = files
            .filter { file in
                Self.codeLines(file.code).contains { line in
                    line.contains(".preferredForwardBufferDuration = ")
                        && !line.trimmingCharacters(in: .whitespaces).hasPrefix("self.")
                }
            }
            .map { $0.path }
            .filter { !$0.hasSuffix("MediaPolicyMonitor.swift") && !$0.hasSuffix("PlaybackLoopQueue.swift") }
        XCTAssertEqual(offenders, [], "le tampon d'avance se règle par la politique, jamais par une constante")
    }

    func test_thePeakBitRateLever_isGone() throws {
        let files = try swiftFiles(under: "packages/MeeshySDK/Sources") + swiftFiles(under: "apps/ios/Meeshy")
        let offenders = files
            .filter { file in Self.codeLines(file.code).contains { $0.contains("preferredPeakBitRate") } }
            .map { $0.path }
        XCTAssertEqual(offenders, [], "sans effet sur du MP4 progressif : le levier est le nombre de lecteurs préparés")
    }
}
