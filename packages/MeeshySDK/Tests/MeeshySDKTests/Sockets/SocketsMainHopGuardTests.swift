import XCTest

/// Cliquet de source : les sockets n'écrivent plus un saut vers le fil principal par `DispatchQueue.main.async`
/// (c'est un `Task { @MainActor in }`, dont l'isolation est écrite) ni un nom d'événement serveur en littéral
/// (c'est un cas de `SocketEvent`, inscrit par la table `[SocketInboundRoute]`). Les `socket.on(clientEvent:`
/// du cycle de vie restent permis : ils ne portent aucun nom du fil.
final class SocketsMainHopGuardTests: XCTestCase {

    private func socketSources() throws -> [(name: String, code: String)] {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/MeeshySDK/Sockets")
        let files = try FileManager.default.contentsOfDirectory(atPath: root.path).filter { $0.hasSuffix(".swift") }.sorted()
        return try files.map { file in
            let source = try String(contentsOf: root.appendingPathComponent(file), encoding: .utf8)
            let code = source.split(separator: "\n", omittingEmptySubsequences: false)
                .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("//") }
                .joined(separator: "\n")
            return (file, code)
        }
    }

    private func offenders(containing needle: String) throws -> [String] {
        try socketSources().compactMap { source in
            let count = source.code.components(separatedBy: needle).count - 1
            return count == 0 ? nil : "\(source.name) ×\(count)"
        }
    }

    func test_sockets_neverHopToMainThroughDispatchQueue() throws {
        let found = try offenders(containing: "DispatchQueue.main.async")
        XCTAssertEqual(found, [], "un saut vers le fil principal s'écrit `Task { @MainActor in }`")
    }

    func test_sockets_neverRegisterAServerEventByStringLiteral() throws {
        let found = try offenders(containing: "socket.on(\"")
        XCTAssertEqual(found, [], "un événement serveur est un cas de `SocketEvent` posé dans une table `[SocketInboundRoute]`")
    }

    func test_offendersPredicate_seesWhatItForbids() {
        let fabricated = "DispatchQueue.main.async { x() }\nsocket.on(\"message:new\") { _, _ in }"
        XCTAssertEqual(fabricated.components(separatedBy: "DispatchQueue.main.async").count - 1, 1)
        XCTAssertEqual(fabricated.components(separatedBy: "socket.on(\"").count - 1, 1)
    }
}
