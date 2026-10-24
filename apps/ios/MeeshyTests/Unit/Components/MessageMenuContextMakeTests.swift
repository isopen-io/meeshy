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
        id: String = "6a0ad86a6e21a483b4443d11",
        age: TimeInterval = 3600,
        content: String = "Bonjour",
        deletedAt: Date? = nil,
        attachments: [MessageAttachment] = [],
        senderIsAnonymous: Bool = false,
        senderHasAccount: Bool = true,
        deliveryStatus: Message.DeliveryStatus = .sent,
        location: SharedPlace? = nil,
        trackedLinkMap: [String: String] = [:]
    ) -> Message {
        Message(
            id: id,
            conversationId: "6a0ad86a6e21a483b4443d99",
            senderId: mine ? "6a0ad86a6e21a483b4443da1" : "6a0ad86a6e21a483b4443da2",
            content: content,
            deletedAt: deletedAt,
            createdAt: now.addingTimeInterval(-age),
            updatedAt: now.addingTimeInterval(-age),
            attachments: attachments,
            senderUserId: mine ? viewerId : otherId,
            senderIsAnonymous: senderIsAnonymous,
            senderHasAccount: senderHasAccount,
            deliveryStatus: deliveryStatus,
            isMe: mine,
            location: location,
            trackedLinkMap: trackedLinkMap
        )
    }

    private func photo() -> MessageAttachment {
        MessageAttachment(id: "6a0ad86a6e21a483b4443d21", messageId: "6a0ad86a6e21a483b4443d11",
                          fileName: "p.jpg", mimeType: "image/jpeg", fileUrl: "https://staging.meeshy.me/p.jpg",
                          width: 1200, height: 800)
    }

    private func infoItems(_ ctx: MessageMenuContext) -> [MoreItem] {
        MessageActionResolver.moreSections(ctx).flatMap { section -> [MoreItem] in
            if case .info(let items) = section { return items }
            return []
        }
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

    /// Un envoi jamais parti porte un id `cid_…` : la loi le lit OPTIMISTE, ni
    /// « pour moi » ni « pour tous » — mais `.discard`. Sans lui, le message
    /// restait dans le fil pour toujours.
    func test_make_anUnsentFailedMessage_canBeDiscarded() {
        let ctx = make(message(mine: true, id: ClientMessageId.generate(), deliveryStatus: .failed), authority(viewer()))
        XCTAssertTrue(ctx.isFailed)
        XCTAssertTrue(ctx.canDiscard, "la loi range `.discard` dans les destructives d'un envoi raté")
        XCTAssertFalse(ctx.canDeleteForEveryone)
        XCTAssertFalse(ctx.canDeleteOnServer)
        XCTAssertTrue(ctx.canDelete)
        XCTAssertTrue(actionItems(ctx).contains(.delete), "un envoi raté se retire du fil")
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx).first, .retry)
    }

    // MARK: - Supprimer sur le serveur ≠ supprimer pour moi

    /// « Supprimer pour moi » est local ; « Supprimer le média » et la
    /// suppression d'une pièce partent vers la passerelle, qui refuse un
    /// membre ordinaire sur le message d'autrui.
    func test_make_aMemberOnSomeoneElsesPhoto_offersNoServerDeletion() {
        let ctx = make(message(mine: false, content: "Regarde", attachments: [photo()]), authority(viewer()))
        XCTAssertTrue(ctx.canDeleteForMe)
        XCTAssertFalse(ctx.canDeleteOnServer)
        XCTAssertFalse(actionItems(ctx).contains(.media), "le média d'autrui ne se supprime pas")
        let piece = MessagePieceMenu.actions(MessagePieceMenu.Context(isProtected: false, menu: ctx))
        XCTAssertFalse(piece.contains(.deletePiece), "la pièce d'autrui ne se supprime pas")
    }

    func test_make_theAuthorOfAPhoto_deletesTheMedia() {
        let ctx = make(message(mine: true, content: "Regarde", attachments: [photo()]), authority(viewer()))
        XCTAssertTrue(ctx.canDeleteOnServer)
        XCTAssertTrue(actionItems(ctx).contains(.media))
        XCTAssertTrue(MessagePieceMenu.actions(MessagePieceMenu.Context(isProtected: false, menu: ctx)).contains(.deletePiece))
    }

    func test_make_aGroupModeratorOnSomeoneElsesPhoto_deletesTheMedia() {
        let ctx = make(message(mine: false, content: "Regarde", attachments: [photo()]), authority(viewer(conversationRole: "moderator")))
        XCTAssertTrue(ctx.canRemove)
        XCTAssertTrue(ctx.canDeleteOnServer)
        XCTAssertTrue(actionItems(ctx).contains(.media))
    }

    func test_make_aDeletedMessage_offersOnlyDeleteForMe() {
        let ctx = make(message(mine: true, deletedAt: now), authority(viewer()))
        XCTAssertTrue(ctx.isGone)
        XCTAssertTrue(ctx.canDeleteForMe)
        XCTAssertFalse(ctx.canDeleteForEveryone)
        XCTAssertEqual(MessageActionResolver.primaryActions(ctx), [.deleteMessage, .more])
        XCTAssertEqual(MessageActionResolver.moreSections(ctx), [.actions([.delete])])
    }

    // MARK: - Supprimer pour moi : un participant ACTIF (#11415)

    private func group() -> MeeshyConversation {
        MeeshyConversation(id: "6a0ad86a6e21a483b4443d99", identifier: "famille", type: .group)
    }

    /// La passerelle exige un participant actif (`DELETE /messages/:id/delete-for-me`) ;
    /// un lecteur dont elle a révoqué l'accès relit son cache sans se voir offrir
    /// un geste condamné au 403.
    func test_make_aViewerWhoseAccessWasRevoked_isNotOfferedDeleteForMe() {
        let user = MeeshyUser(id: viewerId, username: "lea")
        let member = ConversationMenuAuthority.make(conversation: group(), currentUser: user, guest: nil, accessRevoked: false)
        XCTAssertTrue(member.viewer.isActiveMember)
        XCTAssertTrue(make(message(mine: false), member).canDeleteForMe, "témoin : un participant actif masque chez lui")

        let departed = ConversationMenuAuthority.make(conversation: group(), currentUser: user, guest: nil, accessRevoked: true)
        XCTAssertFalse(departed.viewer.isActiveMember)
        XCTAssertFalse(make(message(mine: false), departed).canDeleteForMe)
        XCTAssertFalse(make(message(mine: true), departed).canDeleteForMe, "son propre message non plus")
        XCTAssertFalse(make(message(mine: true, deletedAt: now), departed).canDeleteForMe, "ni un message déjà supprimé")
    }

    func test_isActiveMember_needsAKnownConversationAndNoRevocation() {
        XCTAssertTrue(ConversationMenuAuthority.isActiveMember(conversation: group(), accessRevoked: false))
        XCTAssertFalse(ConversationMenuAuthority.isActiveMember(conversation: group(), accessRevoked: true))
        XCTAssertFalse(ConversationMenuAuthority.isActiveMember(conversation: nil, accessRevoked: false))
    }

    /// Sans conversation connue, l'appartenance est INCONNUE : fermée.
    func test_make_withoutAConversation_isNotOfferedDeleteForMe() {
        let unknown = ConversationMenuAuthority.make(
            conversation: nil, currentUser: MeeshyUser(id: viewerId, username: "lea"), guest: nil, accessRevoked: false)
        XCTAssertFalse(unknown.viewer.isActiveMember)
        XCTAssertFalse(make(message(mine: false), unknown).canDeleteForMe)
    }

    func test_conversationView_menuAuthority_readsTheRevokedAccess() throws {
        let view = AppSourceGuard.stripComments(try String(
            contentsOf: appRoot().appendingPathComponent("Meeshy/Features/Main/Views/ConversationView.swift"),
            encoding: .utf8
        ))
        XCTAssertTrue(view.contains("guest: anonymousSession, accessRevoked: viewModel.accessRevoked"),
                      "l'autorité du menu lit la révocation servie, jamais `conversation != nil` seul")
        let factory = AppSourceGuard.stripComments(try String(
            contentsOf: appRoot().appendingPathComponent("Meeshy/Features/Main/Components/MessageMenuContext+Make.swift"),
            encoding: .utf8
        ))
        XCTAssertFalse(factory.contains("isActiveMember: conversation != nil"))
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

    /// #10286 — le lien d'un invité sans compte est INERTE dans la bulle : le
    /// menu ne rouvre pas la porte que la bulle garde fermée.
    func test_make_anAnonymousAuthorsLink_isNotOpenable() {
        let anonymous = make(message(mine: false, content: "https://phishing.example/login", senderIsAnonymous: true), authority(viewer()))
        XCTAssertFalse(anonymous.kindActions.contains(.openLink))
        let accountless = make(message(mine: false, content: "https://phishing.example/login", senderHasAccount: false), authority(viewer()))
        XCTAssertFalse(accountless.kindActions.contains(.openLink))
        XCTAssertFalse(MessageActionResolver.primaryActions(accountless).contains(.openLink))
    }

    func test_kindTarget_openableLink_followsTheTrackedRedirect() throws {
        let raw = "https://meeshy.me/a"
        let tracked = message(mine: false, content: "Regarde \(raw)", trackedLinkMap: [raw: "tok123"])
        let url = try XCTUnwrap(MessageKindTarget.openableLink(of: tracked))
        XCTAssertEqual(url, TrackedLink.redirectURL(token: "tok123"))
        let plain = message(mine: false, content: "Regarde \(raw)")
        XCTAssertEqual(MessageKindTarget.openableLink(of: plain)?.absoluteString, raw)
        let anonymous = message(mine: false, content: "Regarde \(raw)", senderIsAnonymous: true)
        XCTAssertNil(MessageKindTarget.openableLink(of: anonymous))
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
        XCTAssertFalse(allItems(ctx).contains(.transcription))
    }

    /// Le sentiment iOS se calcule SUR L'APPAREIL (`NLTagger`) : rien ne part.
    func test_make_endToEnd_keepsTheOnDeviceSentiment() {
        let ctx = make(message(mine: false), authority(viewer(), encryptionMode: "e2ee"))
        XCTAssertTrue(infoItems(ctx).contains(.sentiment))
    }

    /// La loi refuse le transfert en E2EE : le clair repartirait vers une
    /// conversation que le serveur lit.
    func test_make_endToEnd_offersNoForward() {
        let ctx = make(message(mine: false, attachments: [photo()]), authority(viewer(), encryptionMode: "e2ee"))
        XCTAssertFalse(ctx.canForward)
        XCTAssertFalse(actionItems(ctx).contains(.forward))
        XCTAssertFalse(MessagePieceMenu.actions(MessagePieceMenu.Context(isProtected: false, menu: ctx)).contains(.forwardPiece))
    }

    func test_make_aPlainMessage_forwards() {
        let ctx = make(message(mine: false), authority(viewer()))
        XCTAssertTrue(ctx.canForward)
        XCTAssertTrue(actionItems(ctx).contains(.forward))
    }

    /// « Traduire » n'ouvre pas une vue dont chaque langue est refusée : en E2EE
    /// elle est offerte, mais par l'APPAREIL (`DeviceTranslationCoordinator`) —
    /// jamais par la vue Langue, qui ne sait demander qu'au serveur.
    func test_make_endToEnd_offersTranslationOnDeviceOnly() {
        let ctx = make(message(mine: false), authority(viewer(), encryptionMode: "e2ee"))
        XCTAssertFalse(ctx.canTranslate)
        XCTAssertTrue(ctx.translatesOnDevice)
        XCTAssertTrue(MessageActionResolver.primaryActions(ctx).contains(.translate))
        XCTAssertFalse(infoItems(ctx).contains(.language))
        let served = make(message(mine: false), authority(viewer()))
        XCTAssertTrue(served.canTranslate)
        XCTAssertFalse(served.translatesOnDevice)
    }

    /// Une note vocale en E2EE : ni transcription, ni traduction serveur — la
    /// vue Langue, dont chaque langue serait refusée, n'est pas offerte.
    func test_make_endToEndVoiceNote_offersNoLanguageView() {
        let voice = MessageAttachment(id: "6a0ad86a6e21a483b4443d22", messageId: "6a0ad86a6e21a483b4443d11",
                                      fileName: "v.m4a", mimeType: "audio/mp4", fileUrl: "https://staging.meeshy.me/v.m4a")
        let ctx = make(message(mine: false, content: "", attachments: [voice]), authority(viewer(), encryptionMode: "e2ee"))
        let info = infoItems(ctx)
        XCTAssertFalse(info.contains(.language))
        XCTAssertFalse(info.contains(.transcription))
        let served = make(message(mine: false, content: "", attachments: [voice]), authority(viewer()))
        XCTAssertTrue(infoItems(served).contains(.language))
    }

    func test_make_systemNotice_offersNoForward() {
        var notice = message(mine: false)
        notice.messageSource = .system
        XCTAssertFalse(make(notice, authority(viewer())).canForward)
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

    /// L'aperçu d'une pièce et la confirmation de suppression lisent la
    /// fabrique : « Supprimer pour moi » n'ouvre aucune suppression serveur.
    func test_theHosts_readTheFactoryVerdicts() throws {
        let menu = AppSourceGuard.stripComments(try String(
            contentsOf: appRoot().appendingPathComponent("Meeshy/Features/Main/Views/ConversationView+LongPressMenu.swift"),
            encoding: .utf8
        ))
        XCTAssertTrue(menu.contains("canDelete: menu.canDeleteOnServer"))
        XCTAssertTrue(menu.contains("canForward: menu.canForward"))
        XCTAssertFalse(menu.contains("viewModel.canDeleteForEveryone("), "la confirmation lit `canDeleteForEveryone` de la fabrique")
        XCTAssertTrue(menu.contains("let verdicts = MessageMenuContext.make(messageId: msgId"))
        XCTAssertTrue(menu.contains("verdicts.canDeleteForEveryone"))
        XCTAssertTrue(menu.contains("verdicts.canRemove"))
        XCTAssertTrue(menu.contains("verdicts.canDeleteForMe"))
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
