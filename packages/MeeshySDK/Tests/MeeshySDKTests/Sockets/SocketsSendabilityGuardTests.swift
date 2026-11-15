import Combine
import XCTest
@testable import MeeshySDK

final class SocketsSendabilityGuardTests: XCTestCase {

    private static let managersAwaitingMigration: Set<String> = [
        "MessageSocketManager.swift", "SocialSocketManager.swift"
    ]

    private func socketsDirectory() throws -> URL {
        var directory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        for _ in 0..<8 {
            if FileManager.default.fileExists(atPath: directory.appendingPathComponent("Package.swift").path) {
                return directory.appendingPathComponent("Sources/MeeshySDK/Sockets")
            }
            directory = directory.deletingLastPathComponent()
        }
        throw NSError(domain: "SocketsSendabilityGuardTests", code: 1, userInfo: [
            NSLocalizedDescriptionKey: "Package.swift introuvable depuis \(#filePath)"
        ])
    }

    private func sources() throws -> [(name: String, text: String)] {
        let directory = try socketsDirectory()
        return try FileManager.default.contentsOfDirectory(atPath: directory.path)
            .filter { $0.hasSuffix(".swift") }
            .sorted()
            .map { ($0, try String(contentsOf: directory.appendingPathComponent($0), encoding: .utf8)) }
    }

    func test_conversationEncryptionChannel_isCompilerCheckedSendable() throws {
        let text = try XCTUnwrap(sources().first { $0.name == "ConversationEncryptionChannel.swift" }?.text)
        XCTAssertFalse(text.contains("@unchecked Sendable"))
        XCTAssertTrue(text.contains("ConversationEncryptionChannel: Sendable"))
    }

    func test_onlyTheTwoSocketManagers_keepAnEscapeHatch_namingTheirMigration() throws {
        let files = try sources()
        XCTAssertGreaterThan(files.count, 20, "la garde ne lit plus le dossier Sockets")
        let unchecked = files.filter { $0.text.contains("@unchecked Sendable") }
        XCTAssertEqual(Set(unchecked.map(\.name)), Self.managersAwaitingMigration)
        for file in unchecked {
            XCTAssertTrue(file.text.contains("// unchecked:"), "\(file.name) justifie son `@unchecked`.")
            XCTAssertTrue(file.text.contains("#11530"), "\(file.name) nomme la migration #11530.")
        }
    }

    func test_conversationEncryptionChannel_changedIsStable_andDelivers() {
        let channel = ConversationEncryptionChannel()
        XCTAssertTrue(channel.changed === channel.changed)
        var received = 0
        let cancellable = channel.changed.sink { _ in received += 1 }
        channel.changed.send(ConversationEncryptionChangedEvent(conversationId: "c1", isEncrypted: true, mode: "e2ee", epoch: 1, changedByUserId: "u1", changedAt: "2026-11-01T00:00:00Z"))
        XCTAssertEqual(received, 1)
        cancellable.cancel()
    }
}
