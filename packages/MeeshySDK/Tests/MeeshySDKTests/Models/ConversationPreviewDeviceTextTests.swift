import Foundation
import Testing
@testable import MeeshySDK

/// #12968 — la ligne d'une conversation chiffrée de bout en bout lit le clair
/// que CET appareil tient de son dernier message ; sans lui, « Message chiffré ».
struct ConversationPreviewDeviceTextTests {

    private let now = Date(timeIntervalSince1970: 1_790_000_000)

    private func strings() -> ConversationPreviewStrings {
        ConversationPreviewStrings(language: "fr") { $0.rawValue }
    }

    private func sealedRow(configure: (inout MeeshyConversation) -> Void = { _ in }) -> MeeshyConversation {
        var row = MeeshyConversation(id: "conv-1", identifier: "conv-1", type: .direct,
                                     lastMessageAt: now.addingTimeInterval(-60),
                                     lastMessagePreview: "", lastMessageId: "m-1")
        row.lastMessageSenderName = "Alice"
        row.lastMessageNature = LastMessageNature(messageType: "text", isEncrypted: true)
        configure(&row)
        return row
    }

    private func compose(_ row: MeeshyConversation, readOnDevice: ConversationPreviewDeviceText?) -> ConversationPreview {
        let input = ConversationPreviewInput(
            conversation: row, viewerId: "u-me", language: "fr",
            preferredLanguages: ["fr"], now: now, readOnDevice: readOnDevice
        )
        return ConversationPreviewComposer.compose(input, strings: strings())
    }

    @Test func sealedLastMessage_withoutDeviceText_staysLabelled() {
        let preview = compose(sealedRow(), readOnDevice: nil)

        #expect(preview.icon == .encrypted)
        #expect(preview.segments == [.label("protection.encrypted")])
    }

    @Test func sealedLastMessage_readOnDevice_showsItsText() {
        let text = ConversationPreviewDeviceText(messageId: "m-1", text: "On se voit à 18 h", language: "fr")

        let preview = compose(sealedRow(), readOnDevice: text)

        #expect(preview.kind == .message)
        #expect(preview.icon == nil)
        #expect(preview.author?.label == "Alice")
        #expect(preview.segments == [.text("On se voit à 18 h", language: nil)])
    }

    @Test func deviceText_ofAnotherMessage_neverDressesTheLastOne() {
        let stale = ConversationPreviewDeviceText(messageId: "m-0", text: "Ancien message", language: nil)

        let preview = compose(sealedRow(), readOnDevice: stale)

        #expect(preview.icon == .encrypted)
        #expect(preview.segments == [.label("protection.encrypted")])
    }

    @Test func deviceText_neverServesAServerTranslation() {
        let row = sealedRow {
            $0.lastMessageOriginalLanguage = "en"
            $0.lastMessageTranslations = ["fr": "Traduction servie"]
        }
        let text = ConversationPreviewDeviceText(messageId: "m-1", text: "See you at 6", language: "en")

        let preview = compose(row, readOnDevice: text)

        #expect(preview.segments == [.text("See you at 6", language: nil)])
    }

    @Test func viewOnceProtection_stillWins_overTheDeviceText() {
        let row = sealedRow { $0.lastMessageIsViewOnce = true }
        let text = ConversationPreviewDeviceText(messageId: "m-1", text: "Secret", language: nil)

        let preview = compose(row, readOnDevice: text)

        #expect(preview.icon == .viewOnce)
        #expect(!preview.segments.contains(.text("Secret", language: nil)))
    }

    @Test func emptyDeviceText_staysLabelled() {
        let text = ConversationPreviewDeviceText(messageId: "m-1", text: "   ", language: nil)

        let preview = compose(sealedRow(), readOnDevice: text)

        #expect(preview.icon == .encrypted)
    }
}
