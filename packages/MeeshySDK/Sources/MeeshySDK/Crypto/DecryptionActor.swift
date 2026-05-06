import Foundation

// MARK: - Protocol

public protocol DecryptionSessionProviding: Sendable {
    func decryptMessage(_ ciphertext: Data, from senderId: String) async throws -> Data
}

// MARK: - Value Types

public struct DecryptionPayload: Sendable {
    public let messageId: String
    public let senderId: String
    public let ciphertext: Data

    public init(messageId: String, senderId: String, ciphertext: Data) {
        self.messageId = messageId
        self.senderId = senderId
        self.ciphertext = ciphertext
    }
}

public struct DecryptionResult: Sendable {
    public let messageId: String
    public let plaintext: String?
    public let error: (any Error)?

    public init(messageId: String, plaintext: String?, error: (any Error)?) {
        self.messageId = messageId
        self.plaintext = plaintext
        self.error = error
    }
}

// MARK: - Actor

public actor DecryptionActor {
    private let provider: any DecryptionSessionProviding

    public init(provider: any DecryptionSessionProviding) {
        self.provider = provider
    }

    public func decrypt(_ payloads: [DecryptionPayload]) async -> [DecryptionResult] {
        await withTaskGroup(of: DecryptionResult.self, returning: [DecryptionResult].self) { group in
            for payload in payloads {
                group.addTask { [provider] in
                    CryptoSignposts.beginDecrypt(messageId: payload.messageId)
                    do {
                        let decrypted = try await provider.decryptMessage(
                            payload.ciphertext,
                            from: payload.senderId
                        )
                        let str = String(data: decrypted, encoding: .utf8)
                        CryptoSignposts.endDecrypt(messageId: payload.messageId, bytes: decrypted.count)
                        return DecryptionResult(messageId: payload.messageId, plaintext: str, error: nil)
                    } catch {
                        CryptoSignposts.endDecrypt(messageId: payload.messageId, bytes: 0)
                        return DecryptionResult(messageId: payload.messageId, plaintext: nil, error: error)
                    }
                }
            }
            var results: [DecryptionResult] = []
            for await r in group { results.append(r) }
            return results
        }
    }
}
