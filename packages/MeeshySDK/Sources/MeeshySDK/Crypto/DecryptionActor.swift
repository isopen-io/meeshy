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

    /// Mémo `messageId → (ciphertext, plaintext)` : chaque `messagesDidChange`
    /// re-déchiffrait TOUTE la fenêtre (200+ messages) en DM. Même clé
    /// symétrique par pair ⇒ même ciphertext = même plaintext ; un edit
    /// re-chiffré change le ciphertext et invalide donc l'entrée d'office.
    /// Les échecs ne sont JAMAIS mémoïsés — une session E2EE transitoirement
    /// indisponible doit pouvoir réessayer au refresh suivant.
    private var plaintextMemo: [String: (ciphertext: Data, plaintext: String?)] = [:]
    private var memoInsertionOrder: [String] = []
    private static let memoLimit = 1000

    public init(provider: any DecryptionSessionProviding) {
        self.provider = provider
    }

    public func decrypt(_ payloads: [DecryptionPayload]) async -> [DecryptionResult] {
        var memoized: [DecryptionResult] = []
        var toDecrypt: [DecryptionPayload] = []
        for payload in payloads {
            if let entry = plaintextMemo[payload.messageId], entry.ciphertext == payload.ciphertext {
                memoized.append(DecryptionResult(
                    messageId: payload.messageId, plaintext: entry.plaintext, error: nil
                ))
            } else {
                toDecrypt.append(payload)
            }
        }
        guard !toDecrypt.isEmpty else { return memoized }

        let fresh = await withTaskGroup(of: DecryptionResult.self, returning: [DecryptionResult].self) { group in
            for payload in toDecrypt {
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

        let ciphertextById = Dictionary(toDecrypt.map { ($0.messageId, $0.ciphertext) },
                                        uniquingKeysWith: { _, last in last })
        for result in fresh where result.error == nil {
            guard let ciphertext = ciphertextById[result.messageId] else { continue }
            memoize(messageId: result.messageId, ciphertext: ciphertext, plaintext: result.plaintext)
        }
        return memoized + fresh
    }

    private func memoize(messageId: String, ciphertext: Data, plaintext: String?) {
        if plaintextMemo[messageId] == nil {
            memoInsertionOrder.append(messageId)
        }
        plaintextMemo[messageId] = (ciphertext, plaintext)
        while plaintextMemo.count > Self.memoLimit, !memoInsertionOrder.isEmpty {
            let oldest = memoInsertionOrder.removeFirst()
            plaintextMemo.removeValue(forKey: oldest)
        }
    }
}
