import Combine
import Foundation
import MeeshySDK

// MARK: - La conversation, source de la traduction sur l'appareil (#9899)
//
// `DeviceTranslationCoordinator` ne connaît pas `ConversationViewModel` : il lit
// ce protocole. Cette extension en est le seul implémenteur, et ne fait que
// PROJETER ce que le modèle de vue détient déjà — ses messages, ses traductions
// et les langues du lecteur (`preferredLanguages`, la descente du Prisme).
//
// Montrer une traduction suit deux chemins, selon ce que le message est :
//
// - `persisting: true` (conversation lisible par le serveur) : la traduction
//   passe par `translationReceived`, le canal de celles du serveur. Elle suit
//   donc le MÊME chemin qu'une traduction du serveur — fusion dans
//   `messageTranslations` après la décantation de 80 ms, enregistrement dans
//   GRDB, et cache partagé — et survit au redémarrage ;
// - `persisting: false` (conversation chiffrée de bout en bout) : elle n'est
//   posée qu'en mémoire. `translationReceived` alimente le disque et les caches
//   partagés ; une traduction d'un message chiffré n'y entre jamais.

extension ConversationViewModel: DeviceTranslationConversationSource {

    var deviceTranslationConversationId: String { conversationId }

    var deviceTranslationMessages: [Message] { messages }

    var deviceTranslationReaderLanguages: [String] { preferredLanguages }

    var deviceTranslationTriggers: AnyPublisher<Void, Never> {
        Publishers.Merge(
            $messages.map { _ in () },
            $messageTranslations.map { _ in () }
        )
        .eraseToAnyPublisher()
    }

    func deviceTranslatedLanguages(of messageId: String) -> [String] {
        (messageTranslations[messageId] ?? []).map(\.targetLanguage)
    }

    func applyDeviceTranslation(_ translation: MessageTranslation, persisting: Bool) {
        guard persisting else {
            mergeDeviceTranslationInMemory(translation)
            return
        }
        messageSocket.translationReceived.send(
            TranslationEvent(
                messageId: translation.messageId,
                translations: [
                    TranslationData(
                        id: translation.id,
                        messageId: translation.messageId,
                        sourceLanguage: translation.sourceLanguage,
                        targetLanguage: translation.targetLanguage,
                        translatedContent: translation.translatedContent,
                        translationModel: translation.translationModel ?? "",
                        confidenceScore: translation.confidenceScore
                    )
                ]
            )
        )
    }

    private func mergeDeviceTranslationInMemory(_ translation: MessageTranslation) {
        var merged = messageTranslations[translation.messageId] ?? []
        if let index = merged.firstIndex(where: { $0.targetLanguage == translation.targetLanguage }) {
            merged[index] = translation
        } else {
            merged.append(translation)
        }
        messageTranslations[translation.messageId] = merged
    }
}
