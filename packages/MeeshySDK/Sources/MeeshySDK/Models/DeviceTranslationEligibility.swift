import Foundation

// MARK: - CE QUE LE FIL CONFIE À L'APPAREIL (#9899)
//
// Miroir Swift de `offeredMessagesOf` (`apps/web/src/lib/device-translation/offer.ts`),
// complété de la règle du chiffrement de bout en bout : celle de
// `sharedTranslationServerReadsMessage`
// (`packages/shared/utils/shared-translation-eligibility.ts`), dont
// `DeviceTranslationEligibility.serverReadsMessage` est le miroir exact — toute
// évolution de la règle touche les deux. Règle PURE : l'orchestration (qui
// traduit, quand, avec quel moteur) est côté app.

/// Ce que l'appareil fait d'un message du fil.
public enum DeviceTranslationDisposition: Equatable, Sendable {
    /// L'appareil ne s'en charge pas.
    case skip
    /// Le serveur ne lit pas ce message (chiffré de bout en bout, mode inconnu,
    /// message chiffré sans mode) : traduit et montré, jamais écrit sur le
    /// disque, jamais partagé. La clé `message-secret` n'existe pas encore (le
    /// message chiffré qui la transporte est le lot cryptographique suivant), et
    /// la clé `message-content` est refusée par la passerelle dans ce cas —
    /// fail-closed.
    case ephemeral
    /// Traduit, montré, gardé comme une traduction du serveur, puis scellé et
    /// partagé aux autres membres.
    case shareable
}

public enum DeviceTranslationEligibility {

    /// La disposition d'un message. `conversationEncryptionMode` est le mode de
    /// la conversation (`nil`, `"server"`, `"hybrid"`, `"e2ee"`).
    ///
    /// Là où le serveur ne lit pas le message, seul le clair que CET appareil a
    /// déchiffré se traduit — reconnu par sa PROVENANCE
    /// (`isContentDecryptedOnDevice`, #11402), jamais par sa forme : un clair
    /// réel en base64 se traduit, un cryptogramme pas encore déchiffré, un
    /// texte que la passerelle forge ou un texte réécrit après déchiffrement
    /// ne se traduisent pas (fail-closed, #9229).
    public static func disposition(
        of message: MeeshyMessage,
        conversationEncryptionMode: String?
    ) -> DeviceTranslationDisposition {
        guard isOffered(message) else { return .skip }
        guard isEndToEnd(message, conversationEncryptionMode: conversationEncryptionMode) else { return .shareable }
        return message.isContentDecryptedOnDevice ? .ephemeral : .skip
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

    /// Le serveur lit-il déjà le texte de ce message ? Miroir exact de
    /// `sharedTranslationServerReadsMessage`. Seuls un message en clair et un
    /// message chiffré PAR le serveur (`server`, `hybrid`) le lui donnent. Tout le
    /// reste — bout en bout, mode inconnu, message chiffré sans mode — se lit
    /// comme un message que le serveur ne lit pas : la clé `message-content` y
    /// donnerait au serveur de quoi deviner un message court en essayant d'ouvrir
    /// l'enveloppe.
    ///
    /// Les modes se comparent sans blancs ni casse (`" Server "` vaut `"server"`).
    public static func serverReadsMessage(
        conversationEncryptionMode: String?,
        isEncrypted: Bool,
        encryptionMode: String?
    ) -> Bool {
        let conversation = normalizedMode(conversationEncryptionMode)
        if !conversation.isEmpty && !serverReadableModes.contains(conversation) { return false }
        let message = normalizedMode(encryptionMode)
        if message.isEmpty { return !isEncrypted }
        return serverReadableModes.contains(message)
    }

    /// Le serveur ne lit pas ce message : bout en bout, par sa conversation ou par
    /// lui-même, mais aussi mode inconnu et message chiffré sans mode annoncé — en
    /// cas de doute, le serveur n'y lit rien. Seuls `server` et `hybrid` annoncés,
    /// où il lit déjà le message, le sortent de la règle.
    /// Un message que CET appareil a déchiffré l'est, quelles que soient les
    /// étiquettes servies : la provenance prime (audit #12950).
    public static func isEndToEnd(_ message: MeeshyMessage, conversationEncryptionMode: String?) -> Bool {
        message.isContentDecryptedOnDevice || !serverReadsMessage(
            conversationEncryptionMode: conversationEncryptionMode,
            isEncrypted: message.isEncrypted,
            encryptionMode: message.encryptionMode
        )
    }

    private static let serverReadableModes: Set<String> = ["server", "hybrid"]

    private static func normalizedMode(_ mode: String?) -> String {
        (mode ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private static func isBlank(_ text: String) -> Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
