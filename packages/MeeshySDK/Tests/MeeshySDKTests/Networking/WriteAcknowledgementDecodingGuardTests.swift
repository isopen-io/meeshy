import XCTest

/// **Un accusé 2xx ne se décode plus en table de chaînes ni de booléens** (#15996).
///
/// `APIResponse<[String: String]>` et `APIResponse<[String: Bool]>` jettent dès
/// que la passerelle met dans `data` une valeur d'un autre type — un booléen,
/// un nombre, un objet, un `null`. L'appelant lisait alors une ERREUR sur une
/// écriture que le serveur venait d'accepter : retour arrière, toast d'échec.
/// Un accusé dont on ne lit pas la charge se décode en `DiscardedResponseBody` ;
/// un accusé qu'on lit, dans le type exact de la réponse servie.
///
/// Seul `delete(…)` garde sa signature `[String: Bool]` : il décode en
/// `DeletionAcknowledgement`, qui ne refuse aucune forme (#10605).
final class WriteAcknowledgementDecodingGuardTests: XCTestCase {

    private static let forbidden = ["APIResponse<[String: String]>", "APIResponse<[String: Bool]>"]

    private static var repositoryRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private static let scannedDirectories = ["packages/MeeshySDK/Sources", "apps/ios/Meeshy"]

    private static func isTolerantDeletion(_ line: String) -> Bool {
        line.contains("delete(") || line.contains("var response: APIResponse<[String: Bool]>")
    }

    private static func offenders() throws -> [String] {
        let fileManager = FileManager.default
        return try scannedDirectories.flatMap { directory -> [String] in
            let root = repositoryRoot.appendingPathComponent(directory)
            guard let walker = fileManager.enumerator(at: root, includingPropertiesForKeys: nil) else { return [] }
            return try walker.compactMap { $0 as? URL }
                .filter { $0.pathExtension == "swift" }
                .flatMap { file -> [String] in
                    let source = try String(contentsOf: file, encoding: .utf8)
                    return source.components(separatedBy: "\n").enumerated().compactMap { index, line in
                        let offending = forbidden.contains { line.contains($0) } && !isTolerantDeletion(line)
                        return offending ? "\(directory)/\(file.path.replacingOccurrences(of: root.path + "/", with: "")):\(index + 1)" : nil
                    }
                }
        }
    }

    func test_theGuard_readsTheSources() throws {
        let sdk = Self.repositoryRoot.appendingPathComponent("packages/MeeshySDK/Sources/MeeshySDK/Networking/DiscardedResponseBody.swift")
        XCTAssertTrue(FileManager.default.fileExists(atPath: sdk.path), "la garde ne lit rien : chemin du dépôt faux")
    }

    func test_noWriteAcknowledgement_decodesIntoAStringOrBoolTable() throws {
        let offenders = try Self.offenders()

        XCTAssertTrue(offenders.isEmpty, """
            Ces accusés se décodent en table de chaînes ou de booléens, et liront une réussite comme un échec \
            dès que la passerelle y met un autre type. Décoder en `DiscardedResponseBody` (charge ignorée) \
            ou dans le type exact de la réponse :
            \(offenders.joined(separator: "\n"))
            """)
    }
}
