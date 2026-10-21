import Combine
import Foundation
import SocketIO

// Extrait de `MessageSocketManager.swift`, hors budget de taille : le lot #9899
// ajoute `message:translation-shared`. Responsabilité tenue ici : les
// traductions qui ARRIVENT sur une conversation — celle du serveur
// (`message:translation`) et celle qu'un autre membre partage
// (`message:translation-shared`).

// MARK: - Translation Event Data

public struct TranslationData: Codable, Sendable, CacheIdentifiable {
    public let id: String
    public let messageId: String
    public let sourceLanguage: String
    public let targetLanguage: String
    public let translatedContent: String
    public let translationModel: String
    public let confidenceScore: Double?

    public init(
        id: String,
        messageId: String,
        sourceLanguage: String,
        targetLanguage: String,
        translatedContent: String,
        translationModel: String,
        confidenceScore: Double? = nil
    ) {
        self.id = id
        self.messageId = messageId
        self.sourceLanguage = sourceLanguage
        self.targetLanguage = targetLanguage
        self.translatedContent = translatedContent
        self.translationModel = translationModel
        self.confidenceScore = confidenceScore
    }
}

public struct TranslationEvent: Codable, Sendable {
    public let messageId: String
    public let translations: [TranslationData]

    public init(messageId: String, translations: [TranslationData]) {
        self.messageId = messageId
        self.translations = translations
    }
}

/// Le canal des traductions que les AUTRES membres partagent — l'enveloppe est
/// scellée : l'ouvrir (avec le texte du message) est l'affaire de l'app.
public enum SharedTranslationSocketChannel {
    nonisolated(unsafe) public static let events = PassthroughSubject<SharedTranslation, Never>()
}

extension MessageSocketManager {

    /// `message:translation-shared` — une traduction qu'un membre vient de
    /// partager à la conversation. Une charge, une `SharedTranslation`.
    public var sharedTranslationReceived: AnyPublisher<SharedTranslation, Never> {
        SharedTranslationSocketChannel.events.eraseToAnyPublisher()
    }

    func registerTranslationHandlers(on socket: SocketIOClient) {
        socket.on("message:translation") { [weak self] data, _ in
            guard let self else { return }
            self.decode(TranslationEvent.self, from: data) { [weak self] event in
                self?.translationReceived.send(event)
            }
        }

        socket.on("message:translation-shared") { [weak self] data, _ in
            self?.decode(SharedTranslation.self, from: data) { shared in
                SharedTranslationSocketChannel.events.send(shared)
            }
        }
    }
}
