import Foundation
import MeeshySDK
@testable import Meeshy

/// Le double du service de régime de chiffrement (#12522, #12949) : un
/// résultat par geste, des compteurs d'appels.
nonisolated final class MockConversationEncryptionService: ConversationEncryptionServiceProviding, @unchecked Sendable {
    private let lock = NSLock()

    var statusResult: Result<ConversationEncryptionStatus, Error> = .success(
        ConversationEncryptionStatus(isEncrypted: false, mode: nil, epoch: 0, canToggleEncryption: false)
    )
    var enableResult: Result<ConversationEncryptionStatus, Error> = .success(
        ConversationEncryptionStatus(isEncrypted: true, mode: "e2ee", epoch: 1, canToggleEncryption: true)
    )

    var disableResult: Result<ConversationEncryptionStatus, Error> = .success(
        ConversationEncryptionStatus(isEncrypted: false, mode: nil, epoch: 2, canToggleEncryption: true)
    )

    var openReadableDirectResult: Result<String, Error> = .success("00000000000000000000aa01")
    private(set) var openedReadableDirectWith: [String] = []

    private var counts: [String: Int] = [:]
    var fetchStatusCallCount: Int { lock.withLock { counts["status", default: 0] } }
    var enableCallCount: Int { lock.withLock { counts["enable", default: 0] } }
    var disableCallCount: Int { lock.withLock { counts["disable", default: 0] } }

    private func count(_ key: String) { lock.withLock { counts[key, default: 0] += 1 } }

    func fetchStatus(conversationId: String) async throws -> ConversationEncryptionStatus {
        count("status")
        return try statusResult.get()
    }

    func enable(conversationId: String, mode: String) async throws -> ConversationEncryptionStatus {
        count("enable")
        return try enableResult.get()
    }

    func openReadableDirect(with userId: String) async throws -> String {
        lock.withLock { openedReadableDirectWith.append(userId) }
        return try openReadableDirectResult.get()
    }

    func disable(conversationId: String) async throws -> ConversationEncryptionStatus {
        count("disable")
        return try disableResult.get()
    }
}
