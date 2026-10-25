import Foundation
import MeeshySDK

/// Le régime de chiffrement d'une conversation, tel que l'utilisateur le lit
/// (#12880). Même lecture que `DeviceTranslationEligibility.serverReadsMessage` :
/// seuls l'absence de mode, `server` et `hybrid` laissent le serveur lire ; un
/// mode inconnu se lit comme le bout en bout.
enum ConversationEncryptionRegime: Equatable {
    case none
    case server
    case hybrid
    case endToEnd

    init(mode: String?) {
        switch (mode ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
        case "": self = .none
        case "server": self = .server
        case "hybrid": self = .hybrid
        default: self = .endToEnd
        }
    }

    /// Une phrase, sans jargon : le régime et qui peut lire.
    var summary: String {
        switch self {
        case .none:
            String(localized: "conversation.encryption.summary.none",
                   defaultValue: "Non chiffrée : les messages sont stockés sans chiffrement sur le serveur", bundle: .main)
        case .server:
            String(localized: "conversation.encryption.summary.server",
                   defaultValue: "Chiffrée sur le serveur : Meeshy peut lire les messages", bundle: .main)
        case .hybrid:
            String(localized: "conversation.encryption.summary.hybrid",
                   defaultValue: "Chiffrée sur le serveur (mode hybride) : Meeshy peut lire les messages", bundle: .main)
        case .endToEnd:
            String(localized: "conversation.encryption.summary.endToEnd",
                   defaultValue: "Chiffrée de bout en bout : seuls les appareils des participants lisent les messages", bundle: .main)
        }
    }
}

/// Ce que la fiche Chiffrement explique de la conversation ouverte (#12880,
/// directive du porteur) : qui peut lire, ce qui fonctionne, ce qui
/// manque et pourquoi, ce qui n'est pas encore livré, les appareils, la
/// bascule. Chaque fait est relevé dans le code qui le produit :
/// - `server` et `hybrid` : la passerelle chiffre le texte avec sa propre clé
///   (`MessageProcessor.getEncryptionContext`) ; en `hybrid`, aucun client ne
///   produit de couche de bout en bout (`EndToEndSendGate.requiresSeal`) ;
/// - `e2ee` : refus du clair, des pièces, de l'édition et du transfert par la
///   passerelle (`e2eeSendAdmission`, `messageEditAdmission`, `forwardAdmission`),
///   aperçu de notification protégé (`messageNotificationFanOut`), recherche
///   qui écarte les messages chiffrés, file hors ligne refusée et traduction sur
///   l'appareil seulement (`EndToEndSendRefusal`, `DeviceTranslationEligibility`) ;
/// - pièces jointes `e2ee` (#10789) : blob opaque, ni TTS ni média dans le push
///   (`la-passerelle-garde-une-piece-e2ee-comme-un-blob-opaque`), web qui ne
///   les ouvre pas, aucune modération serveur ;
/// - appareils : 16 au plus (`E2EE_MAX_ACTIVE_DEVICES`), clés du trousseau
///   `ThisDeviceOnly` ;
/// - bascule : `mayActivateConversationEncryption`, avis système ; le bout en
///   bout ne se désactive pas (#12949) : un tête-à-tête renvoie à une
///   conversation non chiffrée avec le même contact (#12966), un groupe à une
///   nouvelle conversation. Le chiffrement au repos se désactive encore.
struct ConversationEncryptionExplanation: Equatable {

    enum Topic: CaseIterable, Equatable {
        case whoReads, available, absent, notYet, devices, switching, permanence
    }

    enum Fact: CaseIterable, Equatable {
        case transitProtected, storedWithoutEncryption, encryptedOnServerServerReads, hybridIsServerToday
        case onlyParticipantsRead, everyServerFeature, translatedOnDevice, attachmentsEncryptedOnDevice
        case noServerTranscription, noNotificationPreview, noSearch, noEdit, noForward, noOfflineSending
        case notYetPlacesAndStickers, notYetDecryptedNotifications, notYetGroups, groupSendingUnavailable, notYetSafetyNumbers
        case oneKeyPerDevice, deviceLimit, restoredDeviceIsNew
        case whoMayToggle, switchKeepsHistory, switchIsShownInThread, endToEndIsFinal
        case endToEndNeverTurnedOff, endToEndNeverTurnedOffDirect, serverCannotTurnItOff
        case voiceTranslatedAsTextOnDevice, noLockScreenMediaPreview, noWebPlayback, noServerModeration
    }

    struct Section: Equatable {
        let topic: Topic
        let facts: [Fact]
    }

    let regime: ConversationEncryptionRegime
    let sections: [Section]

    init(mode: String?, isDirect: Bool) {
        let regime = ConversationEncryptionRegime(mode: mode)
        self.regime = regime
        sections = Self.sections(for: regime, isDirect: isDirect).filter { !$0.facts.isEmpty }
    }

    private static func sections(for regime: ConversationEncryptionRegime, isDirect: Bool) -> [Section] {
        switch regime {
        case .none:
            return readable(whoReads: [.transitProtected, .storedWithoutEncryption])
        case .server:
            return readable(whoReads: [.transitProtected, .encryptedOnServerServerReads])
        case .hybrid:
            return readable(whoReads: [.transitProtected, .encryptedOnServerServerReads, .hybridIsServerToday])
        case .endToEnd:
            return endToEnd(isDirect: isDirect)
        }
    }

    /// Ce que le bout en bout retire aux pièces jointes (#10789) : le vocal
    /// se traduit en texte sur l'appareil sans voix clonée (aucun TTS serveur),
    /// le push n'attache aucun média (`maskedAttachment`), le web n'ouvre pas
    /// la pièce (#10788), et le serveur, aveugle, ne modère rien.
    static let attachmentTradeOffs: [Fact] = [.voiceTranslatedAsTextOnDevice, .noLockScreenMediaPreview, .noWebPlayback, .noServerModeration]

    /// Ce que le choix d'un mode annonce AVANT l'activation : seul le bout en
    /// bout retire quelque chose aux pièces jointes.
    static func activationTradeOffs(for mode: ConversationEncryptionModeChoice) -> [Fact] {
        mode == .e2ee ? attachmentTradeOffs : []
    }

    private static let switchingFacts: [Fact] = [.whoMayToggle, .switchKeepsHistory, .switchIsShownInThread, .endToEndIsFinal]

    private static func readable(whoReads: [Fact]) -> [Section] {
        [
            Section(topic: .whoReads, facts: whoReads),
            Section(topic: .available, facts: [.everyServerFeature]),
            Section(topic: .switching, facts: switchingFacts),
        ]
    }

    private static func endToEnd(isDirect: Bool) -> [Section] {
        [
            Section(topic: .whoReads, facts: [.onlyParticipantsRead]),
            Section(topic: .available, facts: [.translatedOnDevice, .attachmentsEncryptedOnDevice]),
            Section(topic: .absent, facts: [.noServerTranscription, .noNotificationPreview, .noSearch, .noEdit, .noForward, .noOfflineSending]
                + attachmentTradeOffs),
            Section(topic: .notYet, facts: [.notYetPlacesAndStickers, .notYetDecryptedNotifications]
                + (isDirect ? [.notYetGroups] : [.notYetGroups, .groupSendingUnavailable])
                + [.notYetSafetyNumbers]),
            Section(topic: .devices, facts: [.oneKeyPerDevice, .deviceLimit, .restoredDeviceIsNew]),
            Section(topic: .permanence, facts: [isDirect ? .endToEndNeverTurnedOffDirect : .endToEndNeverTurnedOff, .serverCannotTurnItOff]),
        ]
    }
}
