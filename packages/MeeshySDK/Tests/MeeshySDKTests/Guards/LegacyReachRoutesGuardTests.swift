import XCTest

/// iOS ne parle plus qu'à `POST /social/events` pour ce qu'il COMPTE (#10483,
/// décision du porteur du 2026-10-13 : « il faut passer à social/events
/// directement »).
///
/// Six anciennes portes disaient « ce contenu a été vu » : `POST
/// /posts/:id/view`, `/impression`, `/impressions/batch`, `/engagement/batch`,
/// `/downloads` et `/anonymous-view`. Le serveur les garde montées — les
/// versions publiées de l'app les appellent encore — mais aucune source iOS
/// neuve ne doit plus y passer : elles ne portent ni la surface, ni la
/// provenance, ni l'origine, et chacune consomme son propre budget de débit.
///
/// Le balayage couvre `apps/ios` (hors tests et produits de build) et
/// `packages/MeeshySDK/Sources`, sur les DEUX formes d'un appel : le cas du
/// catalogue généré (`PostsEndpoint.byPostIdView`, …) et le chemin écrit en
/// clair. Le catalogue lui-même (`PostsEndpoint.swift`) déclare les routes qui
/// existent : il n'appelle rien, il est exclu. `byPostIdViews` (la liste « vu
/// par », une lecture) n'est pas une porte de comptage.
final class LegacyReachRoutesGuardTests: XCTestCase {

    private static let endpointCase = #"\.(byPostIdView|byPostIdImpression|byPostIdAnonymousView|byPostIdDownloads|engagementBatch|impressionsBatch)\b"#
    private static let literalPath = #""[^"\n]*posts/(?:[^"\n]*/)?(impression|impressions/batch|engagement/batch|anonymous-view|downloads|view)(\?[^"\n]*)?""#

    private static let skippedDirectories: Set<String> = [
        "Build", "DerivedData", "SourcePackages", "Pods", ".build", "fastlane", "node_modules",
    ]

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Guards
            .deletingLastPathComponent() // MeeshySDKTests
            .deletingLastPathComponent() // Tests
            .deletingLastPathComponent() // MeeshySDK
            .deletingLastPathComponent() // packages
            .deletingLastPathComponent() // racine
    }

    private static func isTestDirectory(_ name: String) -> Bool {
        name.hasSuffix("Tests") || name == "Tests" || name.hasSuffix("UITests")
    }

    private static func swiftSources(under root: URL) -> [URL] {
        guard let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }
        var files: [URL] = []
        for case let url as URL in enumerator {
            let isDirectory = (try? url.resourceValues(forKeys: [.isDirectoryKey]).isDirectory) ?? false
            if isDirectory {
                let name = url.lastPathComponent
                if skippedDirectories.contains(name) || isTestDirectory(name) || name.hasSuffix(".xcodeproj") {
                    enumerator.skipDescendants()
                }
                continue
            }
            guard url.pathExtension == "swift", url.lastPathComponent != "PostsEndpoint.swift" else { continue }
            files.append(url)
        }
        return files
    }

    private static func codeLines(of source: String) -> [(number: Int, text: String)] {
        source.components(separatedBy: "\n").enumerated().compactMap { index, line in
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard !trimmed.hasPrefix("//"), !trimmed.hasPrefix("*"), !trimmed.hasPrefix("/*") else { return nil }
            return (index + 1, line)
        }
    }

    func test_noIOSSourceCallsALegacyReachRoute() throws {
        let root = Self.repositoryRoot
        let roots = [
            root.appendingPathComponent("apps/ios"),
            root.appendingPathComponent("packages/MeeshySDK/Sources"),
        ]
        let patterns = try [Self.endpointCase, Self.literalPath].map { try NSRegularExpression(pattern: $0) }

        let sources = roots.flatMap(Self.swiftSources(under:))
        XCTAssertGreaterThan(sources.count, 100, "Le balayage n'a trouvé aucune source sous \(root.path) : il ne garderait rien.")

        let offenders: [String] = try sources.flatMap { url -> [String] in
            let contents = try String(contentsOf: url, encoding: .utf8)
            let relative = url.path.replacingOccurrences(of: root.path + "/", with: "")
            return Self.codeLines(of: contents).compactMap { line in
                let range = NSRange(line.text.startIndex..<line.text.endIndex, in: line.text)
                let hit = patterns.contains { $0.firstMatch(in: line.text, range: range) != nil }
                return hit ? "\(relative):\(line.number)" : nil
            }
        }

        XCTAssertEqual(
            offenders, [],
            "Une source iOS appelle encore une ancienne porte de comptage. Tout ce qu'iOS compte part par "
            + "POST /social/events (PostService.recordSocialEvents : view, impression, open, dwell, download) : \(offenders)"
        )
    }

    /// Contrôle positif : les deux formes d'appel sont bien reconnues, et la
    /// liste « vu par » (`byPostIdViews`) ne l'est pas.
    func test_patternsRecognizeBothCallFormsButNotTheViewersList() throws {
        let endpoint = try NSRegularExpression(pattern: Self.endpointCase)
        let literal = try NSRegularExpression(pattern: Self.literalPath)
        func matches(_ regex: NSRegularExpression, _ text: String) -> Bool {
            regex.firstMatch(in: text, range: NSRange(text.startIndex..<text.endIndex, in: text)) != nil
        }
        XCTAssertTrue(matches(endpoint, "api.request(PostsEndpoint.byPostIdView(postId: id), method: \"POST\")"))
        XCTAssertTrue(matches(endpoint, "api.post(PostsEndpoint.impressionsBatch, body: body)"))
        XCTAssertTrue(matches(endpoint, "api.post(.engagementBatch, body: body)"))
        XCTAssertFalse(matches(endpoint, "api.request(PostsEndpoint.byPostIdViews(postId: id))"))
        XCTAssertTrue(matches(literal, #"let path = "/api/v1/posts/\(postId)/view""#))
        XCTAssertTrue(matches(literal, #"let path = "/posts/\(postId)/impression?source=detail""#))
        XCTAssertTrue(matches(literal, #"let path = "/api/v1/posts/impressions/batch""#))
        XCTAssertFalse(matches(literal, #"let path = "/api/v1/posts/\(postId)/views""#))
        XCTAssertFalse(matches(literal, #"let path = "/api/v1/social/events""#))
    }
}
