import Foundation

extension ConversationSyncEngine {

    /// La facette du message précédent qui reprend la ligne de liste, avec ses traductions : la ligne se sert dans la
    /// langue du lecteur (Prisme), pas dans celle de l'expéditeur.
    ///
    /// Les traductions viennent de la base du compte (`messageTranslationsReader`), sans réseau, restreintes au
    /// prisme du lecteur comme sur le chemin reçu. Un message protégé (vue unique, flouté, chiffré) n'en emporte
    /// aucune : seule son étiquette part sur la ligne, et un chiffré est scellé, jamais en clair.
    func survivorFacet(_ message: MeeshyMessage) async -> LastMessageFacet {
        LastMessageFacet(
            message: message,
            preview: message.content,
            translations: await survivorTranslations(of: message)
        ).sealedForEndToEnd(message.isEncrypted)
    }

    private func survivorTranslations(of message: MeeshyMessage) async -> [String: String]? {
        guard !message.isEncrypted, !message.isViewOnce, !message.isBlurred,
              let reader = messageTranslationsReader
        else { return nil }
        let records = await reader(message.id)
        let viewerLanguages = await currentPreferredLanguages()
        return PreviewTranslationCard.make(
            candidates: records.map { (language: $0.targetLanguage, text: $0.translatedContent) },
            originalLanguage: message.originalLanguage,
            viewerLanguages: viewerLanguages
        )
    }
}
