import Foundation

// MARK: - CE QUE LE FIL CONFIE À L'APPAREIL (#9899)
//
// Miroir Swift de `offeredMessagesOf` (`apps/web/src/lib/device-translation/offer.ts`),
// complété de la règle du chiffrement de bout en bout. Règle PURE : l'orchestration
// (qui traduit, quand, avec quel moteur) est côté app.

/// Ce que l'appareil fait d'un message du fil.
public enum DeviceTranslationDisposition: Equatable, Sendable {
    /// L'appareil ne s'en charge pas.
    case skip
    /// Chiffré de bout en bout : traduit et montré, jamais écrit sur le disque,
    /// jamais partagé. La clé `message-secret` n'existe pas encore (le message
    /// chiffré qui la transporte est le lot cryptographique suivant), et la clé
    /// `message-content` est refusée par la passerelle dans ce mode — fail-closed.
    case ephemeral
    /// Traduit, montré, gardé comme une traduction du serveur, puis scellé et
    /// partagé aux autres membres.
    case shareable
}

public enum DeviceTranslationEligibility {

    /// La disposition d'un message. `conversationEncryptionMode` est le mode de
    /// la conversation (`nil`, `"server"`, `"hybrid"`, `"e2ee"`).
    public static func disposition(
        of message: MeeshyMessage,
        conversationEncryptionMode: String?
    ) -> DeviceTranslationDisposition {
        guard isOffered(message) else { return .skip }
        guard isEndToEnd(message, conversationEncryptionMode: conversationEncryptionMode) else { return .shareable }
        return looksLikeCiphertext(message.content) ? .skip : .ephemeral
    }

    /// Mes propres messages sont écrits dans une langue que je lis. Un message
    /// éphémère, à vue unique ou flouté n'entre jamais dans le cache de
    /// l'appareil : sa traduction y survivrait à la protection. La loi de sortie
    /// (`contentExitLaw`) le juge sur le message ENTIER, pièces jointes comprises,
    /// comme `translationMayTravel` côté web ; les lectures directes du message
    /// la doublent et ajoutent le flou, que la loi ne compte pas pour une nature.
    /// Un avis système, un message supprimé, un message sans texte ou sans langue
    /// d'origine connue n'ont rien à traduire.
    public static func isOffered(_ message: MeeshyMessage) -> Bool {
        !message.isMe
            && message.messageSource == .user
            && message.deletedAt == nil
            && message.contentExitLaw.nature == .ordinary
            && !message.holdsViewOnce
            && message.protectionFlags.isDisjoint(with: .lifecycleMask)
            && message.expiresAt == nil
            && (message.effects.ephemeralDuration ?? 0) == 0
            && !isBlank(message.content)
            && !isBlank(message.originalLanguage)
    }

    /// Chiffré de bout en bout — par sa conversation ou par lui-même. Un message
    /// chiffré qui n'annonce aucun mode est traité comme tel : en cas de doute,
    /// le serveur n'y lit rien. Seuls `server` et `hybrid` annoncés, où il lit
    /// déjà le message, le sortent de la règle.
    public static func isEndToEnd(_ message: MeeshyMessage, conversationEncryptionMode: String?) -> Bool {
        if isEndToEndMode(conversationEncryptionMode) { return true }
        guard message.isEncrypted else { return isEndToEndMode(message.encryptionMode) }
        guard let mode = message.encryptionMode, !isBlank(mode) else { return true }
        return isEndToEndMode(mode)
    }

    /// Un message chiffré de bout en bout est persisté chiffré et déchiffré en
    /// mémoire : tant que le déchiffrement n'a pas eu lieu, son contenu est
    /// l'enveloppe en base64, que traduire ne rendrait qu'un charabia.
    public static func looksLikeCiphertext(_ content: String) -> Bool {
        guard content.utf8.count >= SharedTranslationLimits.payloadMinLength,
              !content.contains(where: \.isWhitespace)
        else { return false }
        return Data(base64Encoded: content) != nil
    }

    private static func isEndToEndMode(_ mode: String?) -> Bool {
        mode?.lowercased() == "e2ee"
    }

    private static func isBlank(_ text: String) -> Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
