import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un seul site construit le contexte du menu d'un message, et il lit la loi
/// partagée** (#11214) — `MessageMenuContext.make` projette `MessageActionPolicy`
/// (SDK, miroir de `messageActionsFor`). Ces témoins jouent les rôles qui
/// faisaient mentir les quatre règles locales : la fenêtre d'édition de
/// l'auteur, l'administrateur de conversation qui éditait le message d'autrui,
/// l'invité qui épinglait, le créateur oublié, le modérateur qui retirait en direct.
@MainActor
final class MessageMenuContextMakeTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let viewerId = "6a0ad86a6e21a483b4443d01"
    private let otherId = "6a0ad86a6e21a483b4443d02"

    private func viewer(
        platformRole: String? = "USER",
        conversationRole: String? = "member",
        guest: Bool = false
    ) -> ConversationViewerAuthority {
        ConversationViewerAuthority(
            id: guest ? "6a0ad86a6e21a483b4443d0f" : viewerId,
            participantId: guest ? "6a0ad86a6e21a483b4443d0f" : nil,
            hasAccount: !guest,
            isAnonymous: guest,
            platformRoleRaw: guest ? nil : platformRole,
            conversationRoleRaw: conversationRole,
            isActiveMember: true,
            canSendMessages: true,
            isDeclaredMinor: false
        )
    }

    private func authority(
        _ viewer: ConversationViewerAuthority,
        type: String = "group",
        encryptionMode: String? = nil
    ) -> ConversationMenuAuthority {
        ConversationMenuAuthority(
            viewer: viewer,
            conversation: MessageActionPolicy.Conversation(type: type, encryptionMode: encryptionMode)
        )
    }

    private func message(
        mine: Bool,
        age: TimeInterval = 3600,
        content: String = "Bonjour",
        deletedAt: Date? = nil,
        deliveryStatus: Message.DeliveryStatus = .sent,
        location: SharedPlace? = nil
    ) -> Message {
        Message(
            id: "6a0ad86a6e21a483b4443d11",
            conversationId: "6a0ad86a6e21a483b4443d99",
            senderId: mine ? "6a0ad86a6e21a483b4443da1" : "6a0ad86a6e21a483b4443da2",
            content: content,
            deletedAt: deletedAt,
            createdAt: now.addingTimeInterval(-age),
            updatedAt: now.addingTimeInterval(-age),
            senderUserId: mine ? viewerId : otherId,
            deliveryStatus: deliveryStatus,
            isMe: mine,
            location: location
        )
    }

    private func make(_ message: Message, _ authority: ConversationMenuAuthority) -> MessageMenuContext {
        MessageMenuContext.make(message: message, facts: MessageMenuFacts(), authority: authority, now: now)
    }

    private func actionItems(_ ctx: MessageMenuContext) -> [MoreItem] {
        MessageActionResolver.moreSections(ctx).flatMap { section -> [MoreItem] in
            if case .actions(let items) = section { return items }
            return []
        }
    }

    private func allItems(_ ctx: MessageMenuContext) -> [MoreItem] {
        MessageActionResolver.moreSections(ctx).flatMap { section -> [MoreItem] in
            switch section {
            case .actions(let items), .info(let items), .moderation(let items): return items
            }
        }
    }

    // MARK: - Éditer : l'auteur, dans sa fenêtre

    func test_make_authorWithinTheWindow_edits() {
        XCTAssertTrue(make(message(mine: true), authority(viewer())).canEdit)
    }

    func test_make_authorAt25Hours_doesNotEdit() {
        let ctx = make(message(mine: true, age: 25 * 3600), authority(viewer()))
        XCTAssertFalse(ctx.canEdit, "la fenêtre de l'auteur est de 24 h (admitMessageEdit)")
        XCTAssertFalse(MessageActionResolver.primaryActions(ctx).contains(.edit))
    }

    func test_make_conversationAdmin_doesNotEditSomeoneElsesMessage() {
        let ctx = make(message(mine: false), authority(viewer(conversationRole: "admin")))
        XCTAssertFalse(ctx.canEdit, "un rang de conversation n'ouvre pas l'édition du message d'autrui")
        XCTAssertFalse(actionItems(ctx).contains(.edit))
    }

    // MARK: - L'invité

    func test_make_guest_hasNeitherPinNorStar() {
        let ctx = make(message(mine: false), authority(viewer(guest: true)))
        XCTAssertFalse(ctx.canPin)
        XCTAssertFalse(ctx.canStar)
        let items = actionItems(ctx)
        for item in [MoreItem.pin, .unpin, .star, .unstar] {
            XCTAssertFalse(items.contains(item), "\(item) : un invité n'épingle ni ne met en favori")
        }
    }

    // MARK: - Signaler

    func test_make_ownMessage_offersNoReport() {
        let ctx = make(message(mine: true), authority(viewer()))
        XCTAssertFalse(ctx.canReport)
        XCTAssertFalse(allItems(ctx).contains(.report), "on ne signale pas son propre message")
    }

    func test_make_someoneElsesMessage_offersReport() {
        XCTAssertTrue(allItems(make(message(mine: false), authority(viewer()))).contains(.report))
    }

    // MARK: - Retirer avec motif

    func test_make_creatorInAGroup_removes() {
        let ctx = make(message(mine: false), authority(viewer(conversationRole: "creator")))
        XCTAssertTrue(ctx.canRemove, "le créateur était oublié par isCurrentUserAdminOrMod")
        XCTAssertFalse(ctx.canDeleteForEveryone, "un tiers retire, il ne supprime pas pour tous")
        XCTAssertTrue(ctx.canDelete)
    }

    func test_make_platformModeratorInADirect_doesNotRemove() {
        let ctx = make(message(mine: false), authority(viewer(platformRole: "MODERATOR"), type: "direct"))
        XCTAssertFalse(ctx.canRemove, "un direct ne se modère pas")
    }

    func test_make_author_deletesForEveryone_withoutAWindow() {
        let ctx = make(message(mine: true, age: 30 * 24 * 3600), authority(viewer()))
        XCTAssertTrue(ctx.canDeleteForEveryone, "le serveur n'impose aucune fenêtre à l'auteur")
        XCTAssertTrue(ctx.canDeleteForMe)
        XCTAssertFalse(ctx.canRemove)
    }

    // MARK: - Répondre, réessayer, supprimé

    func test_make_aLiveMessage_putsReplyFirst() {
        let ctx = make(message(mine: false), authority(viewer()))
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx).first, .reply)
    }

    func test_make_aFailedMessage_putsRetryFirst() {
        let ctx = make(message(mine: true, deliveryStatus: .failed), authority(viewer()))
        XCTAssertTrue(ctx.isFailed)
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx).first, .retry)
        XCTAssertFalse(ctx.canReply, "un envoi raté ne se cite pas")
    }

    func test_make_aDeletedMessage_offersOnlyDeleteForMe() {
        let ctx = make(message(mine: true, deletedAt: now), authority(viewer()))
        XCTAssertTrue(ctx.isGone)
        XCTAssertTrue(ctx.canDeleteForMe)
        XCTAssertFalse(ctx.canDeleteForEveryone)
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx), [.more])
        XCTAssertEqual(MessageActionResolver.moreSections(ctx), [.actions([.delete])])
    }

    // MARK: - Les actions du type

    func test_make_aLink_opensAndCopiesTheLink() {
        let ctx = make(message(mine: false, content: "Regarde https://meeshy.me/a"), authority(viewer()))
        let primary = MessageActionResolver.primaryActions(ctx)
        XCTAssertTrue(primary.contains(.openLink))
        XCTAssertTrue(primary.contains(.copyLink))
    }

    func test_make_aPlace_opensInMaps_andCopiesNoText() {
        let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Notre-Dame", address: "6 Parvis Notre-Dame")
        let ctx = make(message(mine: false, content: "", location: place), authority(viewer()))
        let primary = MessageActionResolver.primaryActions(ctx)
        XCTAssertTrue(ctx.isLocation)
        XCTAssertTrue(primary.contains(.openInMaps))
        XCTAssertTrue(primary.contains(.copyAddress))
        XCTAssertFalse(primary.contains(.copy))
    }

    func test_kindTarget_mapsURL_carriesTheCoordinatesAndTheName() throws {
        let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Notre-Dame")
        let url = try XCTUnwrap(MessageKindTarget.mapsURL(for: place))
        XCTAssertEqual(url.host, "maps.apple.com")
        XCTAssertTrue(url.absoluteString.contains("ll=48.85,2.35"))
        XCTAssertEqual(MessageKindTarget.address(of: place), "Notre-Dame")
    }

    func test_kindTarget_firstLink_readsTheFirstWebAddress() {
        XCTAssertEqual(MessageKindTarget.firstLink(in: "a https://x.io/1 b https://y.io/2")?.absoluteString, "https://x.io/1")
        XCTAssertNil(MessageKindTarget.firstLink(in: "aucun lien ici"))
    }

    // MARK: - Chiffrement de bout en bout

    func test_make_endToEnd_absentServerFeatures_andNoEdit() {
        let ctx = make(message(mine: true), authority(viewer(), encryptionMode: "e2ee"))
        XCTAssertTrue(ctx.serverFeaturesAbsent)
        XCTAssertFalse(ctx.canEdit, "le serveur ne lit pas le clair : il ne peut pas l'éditer")
        let info = allItems(ctx)
        XCTAssertFalse(info.contains(.sentiment))
        XCTAssertFalse(info.contains(.transcription))
    }

    // MARK: - Gardes de source

    private func appRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // …/Unit/Components
            .deletingLastPathComponent()  // …/Unit
            .deletingLastPathComponent()  // …/MeeshyTests
            .deletingLastPathComponent()  // …/apps/ios
    }

    private func appSources() -> [URL] {
        let dir = appRoot().appendingPathComponent("Meeshy")
        guard let walker = FileManager.default.enumerator(at: dir, includingPropertiesForKeys: nil) else { return [] }
        return walker.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    func test_onlyTheFactory_buildsAMenuContext() throws {
        let sources = appSources()
        XCTAssertGreaterThan(sources.count, 500, "le balayage ne voit pas l'app — la garde ne mesurerait rien")
        let builders = sources.filter { url in
            guard let raw = try? String(contentsOf: url, encoding: .utf8) else { return false }
            return AppSourceGuard.stripComments(raw).contains("MessageMenuContext(")
        }.map(\.lastPathComponent)
        XCTAssertEqual(builders, ["MessageMenuContext+Make.swift"])
    }

    func test_theDeadNativeMenu_isGoneFromDiskAndProject() throws {
        let dead = "ConversationView+NativeMessageMenu.swift"
        let path = appRoot().appendingPathComponent("Meeshy/Features/Main/Views/\(dead)").path
        XCTAssertFalse(FileManager.default.fileExists(atPath: path))
        let project = try String(
            contentsOf: appRoot().appendingPathComponent("Meeshy.xcodeproj/project.pbxproj"), encoding: .utf8
        )
        XCTAssertFalse(project.contains(dead))
    }
}
