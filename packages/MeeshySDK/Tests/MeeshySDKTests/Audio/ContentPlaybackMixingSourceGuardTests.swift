#if os(iOS)
import Testing
import Foundation

/// #11039 — aucun chemin de lecture de CONTENU ne remet `.duckOthers` ni
/// `.mixWithOthers` : une session mélangeable n'est jamais interrompue par
/// l'audio d'une autre app, et Meeshy jouait par-dessus Spotify. La session
/// d'un contenu passe par `ContentPlaybackSessionLaw`.
///
/// La liste blanche nomme ce qui n'est PAS du contenu : l'appel, sa sonnerie
/// de retour, et la timeline du composer, qui porte sa propre piste.
struct ContentPlaybackMixingSourceGuardTests {

    private static let allowed: Set<String> = [
        "CallManager+AudioSession.swift",
        "CallManager+Connection.swift",
        "RingbackTonePlayer.swift",
        "StoryTimelineEngine.swift",
    ]

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
    }

    private static func swiftFiles(under relativePath: String) -> [URL] {
        let root = repositoryRoot.appendingPathComponent(relativePath)
        guard let walker = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Les lignes de CODE qui posent une option mélangeable — commentaires
    /// retirés, ils peuvent raconter l'ancien comportement.
    private static func mixingLines(in file: URL) -> [String] {
        guard let text = try? String(contentsOf: file, encoding: .utf8) else { return [] }
        return text.components(separatedBy: .newlines)
            .map { line in line.components(separatedBy: "//").first ?? "" }
            .filter { $0.contains(".duckOthers") || $0.contains(".mixWithOthers") }
    }

    @Test func theGuardSeesTheSources() {
        #expect(Self.swiftFiles(under: "packages/MeeshySDK/Sources").count > 100)
        #expect(Self.swiftFiles(under: "apps/ios/Meeshy").count > 100)
    }

    @Test func noContentPlaybackPathMixesWithOtherApps() {
        let files = Self.swiftFiles(under: "packages/MeeshySDK/Sources") + Self.swiftFiles(under: "apps/ios/Meeshy")
        let offenders = files
            .filter { !Self.allowed.contains($0.lastPathComponent) }
            .flatMap { file in Self.mixingLines(in: file).map { "\(file.lastPathComponent): \($0.trimmingCharacters(in: .whitespaces))" } }

        #expect(offenders.isEmpty, "\(offenders)")
    }

    @Test func theAllowListStillNamesLivingFiles() {
        let names = Set((Self.swiftFiles(under: "packages/MeeshySDK/Sources") + Self.swiftFiles(under: "apps/ios/Meeshy"))
            .map(\.lastPathComponent))
        #expect(Self.allowed.isSubset(of: names), "\(Self.allowed.subtracting(names))")
    }
}
#endif
