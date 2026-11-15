import Foundation

public struct APITextTranslation: Decodable, Identifiable, Sendable {
    public let id: String
    public let messageId: String
    public let targetLanguage: String
    public let translatedContent: String
    /// **Métadonnée, et facultative — le fil ne la garantit pas.**
    ///
    /// `Message.translations` est un document Mongo relu SANS validation par
    /// `transformTranslationsToArray` : une entrée écrite par une version
    /// antérieure, ou par un translator tombé à mi-chemin, n'a pas de modèle.
    /// Le schéma wire ne la déclare pas `nullable`, donc fast-json-stringify
    /// l'OMET dans ce cas — et une propriété non optionnelle faisait alors
    /// échouer le décodage du message, puis de la PAGE entière (`data` est un
    /// tableau décodé d'un bloc).
    ///
    /// Aucune surface ne la lit (relevé : seuls des tests) ; le web la traite
    /// déjà comme absente (`t.translationModel || 'basic'`). La rendre
    /// facultative dit ce qui est vrai plutôt que ce qu'on espérait.
    public let translationModel: String?
    public let confidenceScore: Double?
    public let sourceLanguage: String?
    /// `true` quand `translatedContent` est un CRYPTOGRAMME et non du texte.
    /// Le gateway pose le drapeau depuis `Message.translations[lang].isEncrypted`
    /// (`transformTranslationsToArray`) ; il était sur le fil depuis toujours,
    /// simplement jamais décodé — donc jamais respecté par les surfaces qui
    /// rendent cette traduction sans clé de déchiffrement (l'aperçu de la ligne
    /// de liste, cf. `ConversationSyncEngine.previewTranslations`).
    /// `nil` sur un payload qui l'omet : on ne suppose alors PAS le chiffrement.
    public let isEncrypted: Bool?
}
