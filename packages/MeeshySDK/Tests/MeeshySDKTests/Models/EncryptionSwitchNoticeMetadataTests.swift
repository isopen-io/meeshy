import Testing
import Foundation
@testable import MeeshySDK

/// #12846 — l'avis système d'une bascule du chiffrement (`metadata.kind`
/// `encryption-enabled` / `encryption-disabled`, posé par la passerelle à chaque
/// bascule, #12522) se lit dans le fil avec son ÉPOQUE. Le bout en bout ne se
/// désactivant plus (#12949), un avis de désactivation déjà en base (staging)
/// se lit et s'affiche comme un historique, sans rien rouvrir.
@Suite("EncryptionSwitchNoticeMetadata — l'avis de bascule du chiffrement porte son époque (#12846)")
struct EncryptionSwitchNoticeMetadataTests {

    private static func notice(_ json: String) throws -> EncryptionSwitchNoticeMetadata {
        try JSONDecoder().decode(EncryptionSwitchNoticeMetadata.self, from: Data(json.utf8))
    }

    @Test("une désactivation se lit avec son époque et le mode qu'elle quitte")
    func disabledNoticeIsRead() throws {
        let notice = try Self.notice(#"{"kind":"encryption-disabled","previousMode":"e2ee","epoch":4,"actor":{"participantId":"p","displayName":"Ana"}}"#)
        #expect(notice.disablesEndToEnd)
        #expect(notice.epoch == 4)
        #expect(notice.previousMode == "e2ee")
    }

    @Test("une activation n'est pas une désactivation")
    func enabledNoticeIsNotADowngrade() throws {
        let notice = try Self.notice(#"{"kind":"encryption-enabled","mode":"e2ee","epoch":3}"#)
        #expect(!notice.disablesEndToEnd)
        #expect(notice.mode == "e2ee")
    }

    @Test("la désactivation d'un mode lisible par le serveur ne rouvre pas un bout en bout")
    func disablingServerModeIsNotAnEndToEndDowngrade() throws {
        let notice = try Self.notice(#"{"kind":"encryption-disabled","previousMode":"server","epoch":2}"#)
        #expect(!notice.disablesEndToEnd)
    }

    @Test("une désactivation sans mode quitté ne se dit pas comme celle d'un bout en bout")
    func disablingWithoutPreviousModeConfirmsNothing() throws {
        #expect(!(try Self.notice(#"{"kind":"encryption-disabled","epoch":2}"#).disablesEndToEnd))
    }

    @Test("une activation d'un mode inconnu se lit comme le bout en bout, celle du serveur non")
    func enablingReadsTheMode() throws {
        #expect(try Self.notice(#"{"kind":"encryption-enabled","mode":"e2ee","epoch":3}"#).enablesEndToEnd)
        #expect(try Self.notice(#"{"kind":"encryption-enabled","epoch":3}"#).enablesEndToEnd)
        #expect(!(try Self.notice(#"{"kind":"encryption-enabled","mode":"server","epoch":3}"#).enablesEndToEnd))
    }

    private static let french = ConversationPreviewStrings(language: "fr") { key in
        switch key {
        case .systemEncryptionDisabled: return "{actor} a désactivé le chiffrement de bout en bout"
        case .systemEncryptionE2EE: return "Chiffrement de bout en bout activé"
        case .systemEncryptionEnabled: return "Chiffrement activé"
        default: return key.rawValue
        }
    }

    @Test("la phrase se compose depuis la métadonnée, auteur nommé et nettoyé, jamais depuis le texte du serveur")
    func textIsComposedFromMetadata() throws {
        let disabled = try Self.notice(#"{"kind":"encryption-disabled","previousMode":"e2ee","epoch":4,"actor":{"participantId":"p","displayName":"\u202EAna"}}"#)
        #expect(disabled.actorName == "\u{202E}Ana")
        #expect(disabled.text(Self.french) == "Ana a désactivé le chiffrement de bout en bout")
        #expect(try Self.notice(#"{"kind":"encryption-enabled","mode":"e2ee","epoch":3}"#).text(Self.french) == "Chiffrement de bout en bout activé")
        #expect(try Self.notice(#"{"kind":"encryption-enabled","mode":"server","epoch":3}"#).text(Self.french) == "Chiffrement activé")
        #expect(try Self.notice(#"{"kind":"encryption-disabled","previousMode":"server","epoch":3}"#).text(Self.french) == nil)
    }

    @Test("un autre avis, une époque absente ou illisible ne se lisent pas")
    func otherShapesAreRejected() {
        #expect(throws: (any Error).self) { try Self.notice(#"{"kind":"members-arrived","epoch":1}"#) }
        #expect(throws: (any Error).self) { try Self.notice(#"{"kind":"encryption-disabled","previousMode":"e2ee"}"#) }
        #expect(throws: (any Error).self) { try Self.notice(#"{"kind":"encryption-disabled","previousMode":"e2ee","epoch":-1}"#) }
    }

    @Test("le message système porte l'avis depuis metadata, et la colonne d'avis du cache le rend tel quel")
    func apiMessageAndCacheColumnCarryTheNotice() throws {
        let json = #"{"id":"6720aa00000000000000c001","conversationId":"conv-1","senderId":"p-actor","content":"Ana a désactivé le chiffrement de bout en bout.","messageType":"system","messageSource":"system","createdAt":"2026-10-25T10:00:00.000Z","metadata":{"kind":"encryption-disabled","previousMode":"e2ee","epoch":4}}"#
        let api = try APIClient.makeAPIPayloadDecoder().decode(APIMessage.self, from: Data(json.utf8))
        #expect(api.encryptionSwitchNotice?.epoch == 4)
        #expect(api.joinNotice == nil)
        #expect(api.toMessage(currentUserId: "me").encryptionSwitchNotice == api.encryptionSwitchNotice)

        let column = try #require(api.systemNoticeJson(encoder: JSONEncoder()))
        let relu = SystemNoticeColumn.decode(column, decoder: JSONDecoder(), id: "x")
        #expect(relu.encryptionSwitch == api.encryptionSwitchNotice)
        #expect(relu.capture == nil)
    }

    @Test("le message relu de son encodage garde l'avis")
    func meeshyMessageRoundTripKeepsTheNotice() throws {
        let notice = try Self.notice(#"{"kind":"encryption-disabled","previousMode":"e2ee","epoch":7,"actor":{"participantId":"p","displayName":"Ana"}}"#)
        #expect(notice.actorName == "Ana")
        let message = MeeshyMessage(conversationId: "c", content: "x", messageSource: .system, encryptionSwitchNotice: notice)
        let relu = try JSONDecoder().decode(MeeshyMessage.self, from: try JSONEncoder().encode(message))
        #expect(relu.encryptionSwitchNotice == notice)
    }
}
