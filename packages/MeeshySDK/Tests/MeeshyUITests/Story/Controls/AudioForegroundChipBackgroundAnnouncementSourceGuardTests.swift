import XCTest

/// Garde de source (B8f, arbitrage 9) : `AudioForegroundChip.swift` doit
/// résoudre l'affichage de sa chip par `AudioChipDisplay.backgroundAnnouncement`
/// — le résolveur UNIQUE de la provenance (B3.4).
///
/// Ancré sur le COMPORTEMENT (l'appel réel dans `chipContent`), pas sur une
/// mise en forme. Les commentaires sont retirés avant analyse.
final class AudioForegroundChipBackgroundAnnouncementSourceGuardTests: XCTestCase {

    func test_chipContent_resoutLAffichage_parBackgroundAnnouncement() throws {
        let lines = try SDKSourceCorpus.strippedLines(
            of: "Sources/MeeshyUI/Story/Controls/AudioForegroundChip.swift")
        XCTAssertTrue(
            lines.contains { $0.contains("AudioChipDisplay.backgroundAnnouncement(") },
            "chipContent doit résoudre l'affichage via backgroundAnnouncement (résolveur unique)"
        )
    }
}

/// Garde de dette E1c — les trois signatures audio que le SDK exportait sans
/// AUCUN appelant de production (mesuré au 2026-08-25 :
/// `grep -rn 'AudioChipDisplay.resolve(' packages/MeeshySDK/Sources apps/ios/Meeshy`
/// → 0 ligne ; idem `AudioChipHeaderModel` et `hasBackgroundAudioTrack`, dont
/// les seuls appelants vivaient dans les suites qui les couvraient).
///
/// La garde qui vivait ici affirmait l'inverse — « resolve reste vivant pour
/// les appelants APP (`StoryViewerView` ×2, dette lot E) » — et ne balayait
/// qu'un seul fichier : elle serait restée VERTE si le résolveur legacy avait
/// été rappelé n'importe où ailleurs dans le SDK. Elle balaie désormais
/// `Sources/` en entier, et rougit dès qu'une des trois signatures réapparaît.
final class DeadAudioSignaturesSourceGuardTests: XCTestCase {

    func test_resolveSoundIdTitleAuthor_absentDeToutesLesSourcesDuSDK() throws {
        try assertAbsent("func resolve(soundId:",
                         "Le résolveur legacy `resolve(soundId:title:authorUsername:)` a été retiré (E1c) : " +
                         "un appelant qui en aurait besoin passe par backgroundAnnouncement + display(for:).")
        try assertAbsent("AudioChipDisplay.resolve(",
                         "Aucune source du SDK ne doit rappeler le résolveur legacy retiré en E1c.")
    }

    func test_audioChipHeaderModel_absentDeToutesLesSourcesDuSDK() throws {
        try assertAbsent("AudioChipHeaderModel",
                         "Le modèle d'affichage pré-E1 a été retiré (E1c) — le header descend " +
                         "l'annonce brute BackgroundAudioAnnouncement, pas un dérivé.")
    }

    func test_hasBackgroundAudioTrack_absentDeToutesLesSourcesDuSDK() throws {
        try assertAbsent("hasBackgroundAudioTrack",
                         "Le prédicat d'existence de fond audio a été retiré (E1c) — la présence " +
                         "s'annonce par BackgroundSoundBadge.announcement(for:), qui rend .none sans piste.")
    }

    private func assertAbsent(_ needle: String,
                              _ message: String,
                              file: StaticString = #filePath,
                              line: UInt = #line) throws {
        let hits = try SDKSourceCorpus.sourceFilesContaining(needle)
        XCTAssertEqual(hits, [], "\(message) Fichiers fautifs : \(hits)", file: file, line: line)
    }
}

/// Corpus des sources du package, commentaires RETIRÉS — sans quoi une garde
/// passe au vert (ou au rouge) parce qu'un doc-comment cite la signature
/// qu'elle cherche.
enum SDKSourceCorpus {

    /// Le fichier vit dans `Tests/MeeshyUITests/Story/Controls/` : cinq
    /// remontées avant d'atteindre la racine du package.
    static func packageRoot(file: StaticString = #filePath) -> URL {
        URL(fileURLWithPath: String(describing: file))
            .deletingLastPathComponent()   // Controls
            .deletingLastPathComponent()   // Story
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
    }

    static func strippedLines(of relativePath: String, file: StaticString = #filePath) throws -> [String] {
        let url = packageRoot(file: file).appendingPathComponent(relativePath)
        return stripped(try String(contentsOf: url, encoding: .utf8))
    }

    /// Chemins (relatifs à `Sources/`) des fichiers dont une ligne de CODE
    /// contient `needle`. Vide = signature absente du package.
    static func sourceFilesContaining(_ needle: String, file: StaticString = #filePath) throws -> [String] {
        let root = packageRoot(file: file).appendingPathComponent("Sources")
        guard let walker = FileManager.default.enumerator(at: root,
                                                          includingPropertiesForKeys: nil) else { return [] }
        let swiftFiles = walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
        XCTAssertGreaterThan(swiftFiles.count, 100,
                             "Le corpus des sources du SDK est vide ou tronqué — la garde ne prouverait rien")
        return swiftFiles
            .filter { url in
                guard let text = try? String(contentsOf: url, encoding: .utf8) else { return false }
                return stripped(text).contains { $0.contains(needle) }
            }
            .map { $0.lastPathComponent }
            .sorted()
    }

    private static func stripped(_ source: String) -> [String] {
        source
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> String in
                guard let range = line.range(of: "//") else { return String(line) }
                return String(line[line.startIndex..<range.lowerBound])
            }
    }
}
