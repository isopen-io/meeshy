import Foundation

/// **Le régime de chiffrement d'une conversation, tel que CET appareil le
/// tient** (#11380, #12949).
///
/// Une conversation chiffrée de bout en bout ne repasse JAMAIS en clair
/// (décision du porteur, #12949) : pour échanger en clair, on crée une autre
/// conversation. Le régime est donc MONOTONE. Une observation chiffrée de bout
/// en bout l'emporte toujours sur une observation qui ne l'est pas, d'où
/// qu'elles viennent (ligne servie sans mode, statut, événement socket, avis de
/// désactivation) : une passerelle compromise qui retire le régime ne fait rien
/// lire ni rien envoyer en clair.
///
/// Seule la frontière d'ACTIVATION reste datée : elle range l'historique en
/// clair d'une conversation EXISTANTE avant l'ère chiffrée (#9224). Elle vient
/// du serveur ; une date dans le futur est bornée par l'horloge de l'appareil
/// à l'instant où il la lit (#12936), et deux dates connues gardent la plus
/// ancienne (fail-closed : elle range plus de messages dans l'ère chiffrée).
/// Une activation sans date range tout le fil dans l'ère chiffrée.
public struct EndToEndRegime: Equatable, Sendable, Codable {
    public let isEndToEnd: Bool
    public let enabledAt: Date?

    public static let serverReadable = EndToEndRegime(isEndToEnd: false, enabledAt: nil)

    public init(isEndToEnd: Bool, enabledAt: Date?) {
        self.isEndToEnd = isEndToEnd
        self.enabledAt = isEndToEnd ? enabledAt : nil
    }

    /// Le régime d'un mode servi, sa date d'activation bornée par `readAt`.
    public init(encryptionMode: String?, enabledAt: Date?, readAt: Date = Date()) {
        self.init(
            isEndToEnd: EndToEndPlaintextLaw.isEndToEndConversation(encryptionMode),
            enabledAt: enabledAt.map { min($0, readAt) }
        )
    }

    /// Le régime que le serveur SERT pour cette conversation, sans mémoire.
    public init(conversation: MeeshyConversation?, readAt: Date = Date()) {
        self.init(encryptionMode: conversation?.encryptionMode, enabledAt: conversation?.encryptionEnabledAt, readAt: readAt)
    }

    /// Fusionne deux observations : le bout en bout l'emporte, et l'activation
    /// la plus ancienne connue fait la frontière.
    public func merging(_ other: EndToEndRegime?) -> EndToEndRegime {
        guard let other, other.isEndToEnd else { return self }
        guard isEndToEnd else { return other }
        let dates = [enabledAt, other.enabledAt].compactMap { $0 }
        return EndToEndRegime(isEndToEnd: true, enabledAt: dates.min())
    }

    /// Un message créé à cet instant appartient-il à l'ère chiffrée ? Un
    /// instant ou une activation inconnus s'y rangent (fail-closed).
    public func governs(createdAt: Date?) -> Bool {
        guard isEndToEnd else { return false }
        guard let createdAt, let enabledAt else { return true }
        return createdAt >= enabledAt
    }

    /// **Le serveur peut-il traduire ce message ?** Jamais un message chiffré
    /// de bout en bout ni un message que CET appareil a déchiffré, quelles que
    /// soient les dates servies (#12935) : le serveur ne l'a pas lu, donc toute
    /// traduction qu'il en sert — texte comme piste audio — est FORGÉE. Ni,
    /// dans l'ère chiffrée, un message que le serveur dit en clair. Seul
    /// l'historique en clair antérieur à l'activation garde les siennes. Les
    /// traductions faites sur l'appareil ne passent pas par ici.
    public func admitsWireTranslations(of message: MeeshyMessage) -> Bool {
        guard !DeviceTranslationEligibility.isEndToEnd(message, conversationEncryptionMode: nil) else { return false }
        return !governs(createdAt: message.createdAt)
    }
}
