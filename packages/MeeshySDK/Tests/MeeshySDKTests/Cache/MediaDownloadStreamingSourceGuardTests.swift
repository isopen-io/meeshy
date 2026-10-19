import XCTest

/// Garde de source #9863 : aucun site de téléchargement média n'itère les
/// octets d'une réponse un à un, ni ne rapatrie une vidéo ou un audio entier
/// dans un `Data`.
///
/// `AttachmentDownloadCenter` parcourait `URLSession.bytes` octet par octet
/// (≈ 30 millions de tours pour 30 Mo) et `DiskCacheStore` chargeait chaque
/// vidéo préchargée par `urlSession.data(for:)`. Les stores audio et vidéo
/// passent désormais `streamedToFile` ; cette garde empêche un nouveau site de
/// rouvrir l'un ou l'autre chemin.
final class MediaDownloadStreamingSourceGuardTests: XCTestCase {

    private struct Source {
        let path: String
        let code: String
        var name: String { (path as NSString).lastPathComponent }
    }

    private static var repoRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent() // Cache/
            .deletingLastPathComponent() // MeeshySDKTests/
            .deletingLastPathComponent() // Tests/
            .deletingLastPathComponent() // MeeshySDK/
            .deletingLastPathComponent() // packages/
            .deletingLastPathComponent() // racine du dépôt
    }

    private static let excludedSegments = ["/MeeshyTests/", "/MeeshyUIDeviceTests/", "/Tests/", "/Build/", "/SourcePackages/", "/.build/"]

    private func productionSources() throws -> [Source] {
        let roots = [
            Self.repoRoot.appendingPathComponent("apps/ios", isDirectory: true),
            Self.repoRoot.appendingPathComponent("packages/MeeshySDK/Sources", isDirectory: true),
        ]
        var sources: [Source] = []
        for root in roots {
            guard let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil) else { continue }
            for case let url as URL in enumerator where url.pathExtension == "swift" {
                let path = url.path
                guard !Self.excludedSegments.contains(where: { path.contains($0) }) else { continue }
                sources.append(Source(path: path, code: try String(contentsOf: url, encoding: .utf8)))
            }
        }
        XCTAssertGreaterThan(sources.count, 500, "la garde doit parcourir les sources réelles du dépôt")
        return sources
    }

    private func source(named name: String, in sources: [Source]) throws -> String {
        try XCTUnwrap(sources.first { $0.name == name }?.code, "\(name) introuvable")
    }

    func test_noMediaSite_iteratesResponseBytesOneByOne() throws {
        let pattern = try NSRegularExpression(pattern: #"for\s+try\s+await\s+\w+\s+in\s+\w*[bB]ytes\b|\.bytes\(from:"#)
        let offenders = try productionSources().filter { source in
            pattern.firstMatch(in: source.code, range: NSRange(source.code.startIndex..., in: source.code)) != nil
        }.map(\.name)
        XCTAssertEqual(offenders, [], "un téléchargement s'écrit vers un fichier (URLSessionDownloadTask), jamais octet par octet")
    }

    /// Les seuls `URLSession.shared.data(` restants rapatrient un média BORNÉ :
    /// la pochette d'écran verrouillé (une image) et la première image d'une
    /// vidéo distante (plage `Range` de 1 Mo). L'extension de partage n'y
    /// rapatrie aucun média : ses deux appels sont des requêtes JSON vers l'API
    /// (destinataires, envoi — #10947). Tout nouveau site justifie sa place ici,
    /// ou passe par le funnel en flux du cache.
    func test_sharedSessionDataDownloads_areConfinedToBoundedMedia() throws {
        let found = Set(try productionSources().filter { $0.code.contains("URLSession.shared.data(") }.map(\.name))
        XCTAssertEqual(found, [
            "ConversationAudioCoordinator+NowPlaying.swift",
            "ExtensionShareDirectory.swift",
            "ExtensionShareDispatcher.swift",
            "MeeshyVideoThumbnail.swift",
        ])
    }

    func test_audioAndVideoStores_streamToAFile() throws {
        let coordinator = try source(named: "CacheCoordinator.swift", in: productionSources())
        for policy in ["mediaAudio", "mediaVideo"] {
            let pattern = try NSRegularExpression(pattern: #"DiskCacheStore\(policy: \."# + policy + #"[^\n]*networkTransfer: \.streamedToFile"#)
            XCTAssertNotNil(
                pattern.firstMatch(in: coordinator, range: NSRange(coordinator.startIndex..., in: coordinator)),
                "le store \(policy) doit télécharger en flux vers un fichier"
            )
        }
    }

    func test_diskCacheStoreFunnel_branchesToTheFileTransferBeforeAnyInMemoryFetch() throws {
        let store = try source(named: "DiskCacheStore.swift", in: productionSources())
        XCTAssertEqual(store.components(separatedBy: "urlSession.data(for:").count - 1, 1)
        let streamed = try XCTUnwrap(store.range(of: "if transfer == .streamedToFile {"))
        let inMemory = try XCTUnwrap(store.range(of: "urlSession.data(for:"))
        XCTAssertLessThan(streamed.lowerBound, inMemory.lowerBound)
    }

    func test_attachmentDownloadCenter_goesThroughTheStreamedFunnel() throws {
        let center = try source(named: "AttachmentDownloadCenter.swift", in: productionSources())
        XCTAssertTrue(center.contains("store.data(for: resolvedKey, progress:"))
        XCTAssertFalse(center.contains("store.store("), "le centre n'écrit plus d'octets accumulés dans le cache")
    }
}
