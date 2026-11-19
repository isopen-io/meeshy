import Combine
import XCTest
@testable import MeeshySDK

private final class FakeRegistrar: SocketEventRegistering {
    private(set) var registered: [String] = []
    private var receivers: [String: ([Any]) -> Void] = [:]

    func listen(_ event: String, _ receive: @escaping ([Any]) -> Void) {
        registered.append(event)
        receivers[event] = receive
    }

    func deliver(_ event: String, _ payload: [String: Any]) {
        receivers[event]?([payload])
    }
}

/// La table `[SocketInboundRoute]` est LE contrat entrant des deux sockets : ce que la passerelle émet, ce que le client
/// écoute, vers quel canal il le livre. Les relevés figés ci-dessous sont les noms que `origin/dev` inscrivait avant la
/// table (relevé des `.on("…")` des sources, commentaires exclus) : aucun événement perdu, aucun ajouté.
final class SocketInboundRouteTableTests: XCTestCase {

    private static let messageEventsOfDev: Set<String> = [
        "attachment-status:updated", "attachment:deleted", "attachment:reaction-added", "attachment:reaction-removed",
        "audio:transcription-failed", "audio:transcription-ready", "audio:translation-failed",
        "audio:translation-ready", "audio:translations-completed", "audio:translations-progressive",
        "auth:session-revoked", "auth:token-expired", "battery:changed", "battery:cleared", "battery:pull-requested",
        "bring:ring", "bring:stopped", "call:already-answered", "call:conversation-changed", "call:ended", "call:error",
        "call:force-leave", "call:frame-selected", "call:ice-servers-refreshed", "call:initiated",
        "call:invite-declined", "call:invite-expired", "call:media-toggled", "call:missed",
        "call:muted-by-moderator", "call:participant-invited", "call:participant-joined", "call:participant-left",
        "call:preview-requested", "call:preview-signal", "call:quality-alert", "call:reaction-received",
        "call:recording-requested", "call:recording-started", "call:recording-stopped", "call:screen-capture-alert",
        "call:signal", "call:transcription-active", "call:translated-segment", "categories:reordered",
        "category:created", "community:deleted", "community:member-joined", "community:member-left", "community:member-role-updated", "community:updated", "category:deleted", "category:updated", "conversation:closed", "conversation:deleted",
        "conversation:encryption-changed", "conversation:join-error", "conversation:joined", "conversation:left", "conversation:new",
        "conversation:obsoleted",
        "conversation:participant-banned", "conversation:participant-joined", "conversation:participant-left",
        "conversation:participant-unbanned", "conversation:restored", "conversation:stats",
        "conversation:unread-updated", "conversation:updated", "e2ee:envelope", "engagement:conversation-updated",
        "engagement:post-updated", "friend-request:cancelled", "friend-request:rejected", "game:missions-updated", "game:updated",
        "heartbeat:ack", "inactivity:alert", "inactivity:cleared", "location:live-started", "location:live-stopped", "location:live-updated",
        "location:share-changed", "location:share-ended", "location:share-own-changed",
        "mention:created", "message:attachment-updated", "message:cited-post-withdrawn", "message:consumed",
        "message:countdown-started", "message:deleted", "message:edited", "message:expired", "message:hidden-for-me",
        "message:new", "message:pending-delivered", "message:pinned", "message:restored-for-me", "message:starred",
        "message:translation", "message:translation-shared", "message:unpinned", "message:view-once-purged",
        "notification:counts", "notification:deleted", "notification:deleted-bulk", "notification:new",
        "notification:read", "notification:read-bulk", "now-playing:changed", "now-playing:cleared",
        "participant:rights-updated", "participant:role-updated",
        "phone:reachable", "phone:unreachable",
        "presence:snapshot", "profile:decor-updated", "profile:updated", "reaction:added", "reaction:removed", "read-status:updated",
        "relation:level-raised", "relation:ritual-completed", "relation:ritual-progress", "relation:ritual-started",
        "talkie:chunk", "talkie:ended", "talkie:incoming",
        "together:ended", "together:invited", "together:started", "together:synced",
        "translation:failed", "typing:start", "typing:stop", "user:preferences-reordered",
        "user:preferences-updated", "user:status", "user:updated", "viewing:activity", "viewing:snapshot",
        "viewing:start", "viewing:stop"
    ]

    private static let socialEventsOfDev: Set<String> = [
        "comment:added", "comment:deleted", "comment:liked", "comment:media-updated", "comment:reaction-added",
        "comment:reaction-removed", "comment:translation-updated", "comment:unliked", "comment:updated",
        "conversation:closed", "conversation:deleted", "conversation:obsoleted", "media:caption-translation-updated", "post:bookmarked",
        "post:created", "post:deleted", "post:liked", "post:reaction-added", "post:reaction-removed",
        "post:reposted", "post:translation-updated", "post:unliked", "post:updated", "status:created",
        "status:deleted", "status:reacted", "status:unreacted", "status:updated", "story:created", "story:deleted",
        "story:reacted", "story:translation-updated", "story:unreacted", "story:updated", "story:viewed"
    ]

    private func installed(_ routes: [SocketInboundRoute]) -> FakeRegistrar {
        let registrar = FakeRegistrar()
        registrar.install(routes)
        return registrar
    }

    private func expectOneValue<P: Publisher>(
        from publisher: P,
        where matches: @escaping (P.Output) -> Bool = { _ in true },
        after trigger: () -> Void
    ) async where P.Failure == Never {
        let published = expectation(description: "publication")
        let subscription = publisher.sink { if matches($0) { published.fulfill() } }
        trigger()
        await fulfillment(of: [published], timeout: 2)
        subscription.cancel()
    }

    private func expectNoValue<P: Publisher>(from publisher: P, after trigger: () -> Void) async where P.Failure == Never {
        let silence = expectation(description: "aucune publication")
        silence.isInverted = true
        let subscription = publisher.sink { _ in silence.fulfill() }
        trigger()
        await fulfillment(of: [silence], timeout: 0.4)
        subscription.cancel()
    }

    // MARK: - La table dit ce que dev inscrivait

    func test_messageTable_registersExactlyTheEventsOfDev() {
        let events = Set(MessageSocketRoutes.all(for: .shared).map(\.event.rawValue))
        XCTAssertEqual(events.subtracting(Self.messageEventsOfDev), [], "événements ajoutés")
        XCTAssertEqual(Self.messageEventsOfDev.subtracting(events), [], "événements perdus")
    }

    func test_socialTable_registersExactlyTheEventsOfDev() {
        let events = Set(SocialSocketRoutes.all(for: .shared).map(\.event.rawValue))
        XCTAssertEqual(events.subtracting(Self.socialEventsOfDev), [], "événements ajoutés")
        XCTAssertEqual(Self.socialEventsOfDev.subtracting(events), [], "événements perdus")
    }

    func test_tables_haveNoDuplicateEvent() {
        let message = MessageSocketRoutes.all(for: .shared).map(\.event)
        let social = SocialSocketRoutes.all(for: .shared).map(\.event)
        XCTAssertEqual(Set(message).count, message.count)
        XCTAssertEqual(Set(social).count, social.count)
    }

    func test_install_registersEachRouteOnceWithItsWireName() {
        let routes = MessageSocketRoutes.all(for: .shared)
        let registrar = installed(routes)
        XCTAssertEqual(registrar.registered, routes.map(\.event.rawValue))
    }

    // MARK: - Une route livre où la table le dit

    func test_messageNewRoute_deliversDecodedMessageToMessageReceived() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))
        let id = "route-table-\(UUID().uuidString)"
        let payload: [String: Any] = ["id": id, "conversationId": "c1", "senderId": "u1", "createdAt": "2026-10-21T10:00:00.000Z"]

        await expectOneValue(from: MessageSocketManager.shared.messageReceived, where: { $0.id == id }) {
            registrar.deliver("message:new", payload)
        }
    }

    func test_attachmentDeletedRoute_deliversTheRemovalToItsChannel() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))
        let id = "removal-\(UUID().uuidString)"

        await expectOneValue(from: MessageSocketManager.shared.attachmentDeleted, where: { $0.attachmentId == id && $0.messageId == "m1" && $0.conversationId == "c1" }) {
            registrar.deliver("attachment:deleted", ["conversationId": "c1", "messageId": "m1", "attachmentId": id])
        }
    }

    func test_attachmentDeletedRoute_ignoresAnIncompletePayload() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))

        await expectNoValue(from: MessageSocketManager.shared.attachmentDeleted) {
            registrar.deliver("attachment:deleted", ["conversationId": "c1", "messageId": "m1"])
            registrar.deliver("attachment:deleted", ["conversationId": "", "messageId": "m1", "attachmentId": "a1"])
        }
    }

    func test_e2eeEnvelopeRoute_deliversTheOpaqueEnvelopeOfThisDevice() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))
        let id = "envelope-\(UUID().uuidString)"
        let payload: [String: Any] = [
            "id": id, "messageId": "m1", "conversationId": "c1", "recipientRegistrationId": 7,
            "senderUserId": "u1", "senderDeviceId": 2, "type": 3, "body": "Y2lwaGVy", "createdAt": "2026-10-24T10:00:00.000Z",
        ]

        await expectOneValue(from: E2EEEnvelopeChannel.shared.received, where: { $0.id == id && $0.senderDeviceId == 2 }) {
            registrar.deliver("e2ee:envelope", payload)
        }
    }

    func test_conversationEncryptionChangedRoute_deliversTheRegimeToItsChannel() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))
        let id = "regime-\(UUID().uuidString)"
        let payload: [String: Any] = [
            "conversationId": id, "isEncrypted": true, "mode": "e2ee", "epoch": 3,
            "changedByUserId": "u1", "changedAt": "2026-10-25T10:00:00.000Z",
        ]

        await expectOneValue(from: ConversationEncryptionChannel.shared.changed, where: { $0.conversationId == id && $0.epoch == 3 }) {
            registrar.deliver("conversation:encryption-changed", payload)
        }
    }

    func test_userPreferencesUpdated_routesByScope() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))
        let conversationScope: [String: Any] = ["userId": "u1", "conversationId": "c1", "version": 1, "reset": true]
        let categoryScope: [String: Any] = ["userId": "u1", "category": "pinned"]

        await expectOneValue(from: MessageSocketManager.shared.userPreferencesConversationUpdated) {
            registrar.deliver("user:preferences-updated", conversationScope)
        }
        await expectOneValue(from: MessageSocketManager.shared.userPreferencesUpdated) {
            registrar.deliver("user:preferences-updated", categoryScope)
        }
        await expectNoValue(from: MessageSocketManager.shared.userPreferencesUpdated) {
            registrar.deliver("user:preferences-updated", conversationScope)
        }
        await expectNoValue(from: MessageSocketManager.shared.userPreferencesConversationUpdated) {
            registrar.deliver("user:preferences-updated", categoryScope)
        }
    }

    func test_callSignal_routesByType() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))
        func signal(_ type: String) -> [String: Any] {
            ["callId": "c1", "signal": ["type": type, "from": "a", "to": "b", "negotiationId": 1] as [String: Any]]
        }

        await expectOneValue(from: MessageSocketManager.shared.callSignalOfferReceived) { registrar.deliver("call:signal", signal("offer")) }
        await expectOneValue(from: MessageSocketManager.shared.callAnswerReceived) { registrar.deliver("call:signal", signal("answer")) }
        await expectOneValue(from: MessageSocketManager.shared.callICECandidateReceived) { registrar.deliver("call:signal", signal("ice-candidate")) }
        await expectNoValue(from: MessageSocketManager.shared.callAnswerReceived) { registrar.deliver("call:signal", signal("renegotiate")) }
    }

    func test_callParticipantJoinedThenEnded_tracksLastParticipant() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))
        let manager = MessageSocketManager.shared

        await expectOneValue(from: manager.callParticipantJoined) {
            registrar.deliver("call:participant-joined", ["callId": "c-last", "userId": "u2"])
        }
        let joined = await MainActor.run { manager.lastCallParticipantJoined?.callId }
        XCTAssertEqual(joined, "c-last")

        await expectOneValue(from: manager.callEnded) {
            registrar.deliver("call:ended", ["callId": "c-last"])
        }
        let afterEnd = await MainActor.run { manager.lastCallParticipantJoined?.callId }
        XCTAssertNil(afterEnd)
    }

    func test_translationShared_reachesSharedTranslationChannel() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))
        let envelope: [String: Any] = ["v": 1, "alg": "A256GCM", "kdf": "message-content", "payload": "AAECAwQFBgcICQoLIaP2d4BN5n7LZzhFfM5LMgef8yGgP//5NrcvJA9z36m/"]
        let payload: [String: Any] = [
            "id": "st-route",
            "conversationId": "64f0c0ffee0000000000c0de",
            "messageId": "64f0c0ffee0000000000a001",
            "targetLanguage": "fr",
            "envelope": envelope,
            "sharedBy": "participant-7",
            "sharedAt": "2026-10-10T08:15:30.000Z",
        ]

        await expectOneValue(from: SharedTranslationSocketChannel.events, where: { $0.id == "st-route" }) {
            registrar.deliver("message:translation-shared", payload)
        }
    }

    func test_postLiked_reachesSocialPostLiked() async {
        let registrar = installed(SocialSocketRoutes.all(for: .shared))
        let payload: [String: Any] = ["postId": "p-route", "userId": "u1", "emoji": "❤️", "likeCount": 1, "reactionSummary": ["❤️": 1]]

        await expectOneValue(from: SocialSocketManager.shared.postLiked, where: { $0.postId == "p-route" }) {
            registrar.deliver("post:liked", payload)
        }
    }

    func test_conversationClosedAndDeleted_bothReachTheSocialConversationDeletedChannel() async {
        let registrar = installed(SocialSocketRoutes.all(for: .shared))

        await expectOneValue(from: SocialSocketManager.shared.conversationDeleted) { registrar.deliver("conversation:closed", ["conversationId": "c1"]) }
        await expectOneValue(from: SocialSocketManager.shared.conversationDeleted) { registrar.deliver("conversation:deleted", ["conversationId": "c1"]) }
    }

    func test_conversationObsoleted_reachesTheSocialConversationDeletedChannel() async {
        let registrar = installed(SocialSocketRoutes.all(for: .shared))

        await expectOneValue(from: SocialSocketManager.shared.conversationDeleted, where: { $0 == "c-obsolete" }) {
            registrar.deliver("conversation:obsoleted", Self.obsoletedPayload(conversationId: "c-obsolete"))
        }
    }

    func test_conversationObsoleted_reachesTheMessageConversationObsoletedChannel() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))

        await expectOneValue(from: MessageSocketManager.shared.conversationObsoleted, where: {
            $0.conversationId == "c-obsolete" && $0.obsoletedBy == "admin-1" && $0.purgeAfter == "2026-11-04T10:00:00.000Z"
        }) {
            registrar.deliver("conversation:obsoleted", Self.obsoletedPayload(conversationId: "c-obsolete"))
        }
    }

    private static func obsoletedPayload(conversationId: String) -> [String: Any] {
        [
            "conversationId": conversationId,
            "obsoletedBy": "admin-1",
            "obsoletedAt": "2026-11-02T10:00:00.000Z",
            "purgeAfter": "2026-11-04T10:00:00.000Z",
        ]
    }

    func test_communityUpdated_reachesTheCommunityUpdatedChannel() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))

        await expectOneValue(from: MessageSocketManager.shared.communityUpdated, where: {
            $0.communityId == "c-renamed" && $0.name == "Nouveau nom" && $0.memberCount == 7 && $0.isPrivate
        }) {
            registrar.deliver("community:updated", [
                "communityId": "c-renamed", "identifier": "mshy_c", "name": "Nouveau nom",
                "description": NSNull(), "avatar": NSNull(), "banner": NSNull(),
                "isPrivate": true, "memberCount": 7, "updatedAt": "2026-11-15T10:00:00.000Z",
            ])
        }
    }

    /// #18924 — ma langue changée sur un autre appareil repeint le compte connecté, quel que soit l'écran.
    @MainActor
    func test_profileUpdated_repaintsTheSignedInAccount() async {
        let auth = AuthManager.shared
        let previousUser = auth.currentUser
        let previousPending = auth.pendingOptimisticProfile
        defer {
            auth.currentUser = previousUser
            auth.pendingOptimisticProfile = previousPending
        }
        auth.pendingOptimisticProfile = nil
        auth.currentUser = MeeshyUser(id: "moi-route", username: "alice", systemLanguage: "fr", updatedAt: "2026-11-17T10:00:00.000Z")
        let registrar = installed(MessageSocketRoutes.all(for: .shared))

        await expectOneValue(from: auth.$currentUser, where: { $0?.systemLanguage == "en" }) {
            registrar.deliver("profile:updated", [
                "userId": "moi-route", "updatedAt": "2026-11-17T10:05:00.000Z",
                "profile": [
                    "systemLanguage": "en", "regionalLanguage": NSNull(), "customDestinationLanguage": NSNull(),
                    "displayName": NSNull(), "firstName": "Alice", "lastName": "Dupont", "username": "alice",
                    "avatar": NSNull(), "banner": NSNull(),
                ] as [String: Any],
            ])
        }
    }

    func test_communityMemberEvents_reachTheCommunityMemberChannel() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))

        await expectOneValue(from: MessageSocketManager.shared.communityMemberChanged, where: {
            $0.communityId == "c-eff" && $0.userId == "u-new" && $0.memberCount == 8 && $0.role == .moderator
        }) {
            registrar.deliver("community:member-joined", [
                "communityId": "c-eff", "userId": "u-new", "role": "moderator", "via": "self",
                "memberCount": 8, "at": "2026-11-17T10:00:00.000Z",
            ])
        }
        await expectOneValue(from: MessageSocketManager.shared.communityMemberChanged, where: {
            $0.communityId == "c-eff" && $0.userId == "u-gone" && $0.memberCount == 7 && $0.role == nil
        }) {
            registrar.deliver("community:member-left", [
                "communityId": "c-eff", "userId": "u-gone", "reason": "left", "memberCount": 7, "at": "2026-11-17T10:00:00.000Z",
            ])
        }
        await expectOneValue(from: MessageSocketManager.shared.communityMemberChanged, where: {
            $0.communityId == "c-eff" && $0.userId == "u-new" && $0.role == .admin
        }) {
            registrar.deliver("community:member-role-updated", [
                "communityId": "c-eff", "userId": "u-new", "role": "admin", "memberCount": 7, "at": "2026-11-17T10:00:00.000Z",
            ])
        }
    }

    func test_communityDeleted_reachesTheCommunityDeletedChannel() async {
        let registrar = installed(MessageSocketRoutes.all(for: .shared))

        await expectOneValue(from: MessageSocketManager.shared.communityDeleted, where: { $0 == "c-gone" }) {
            registrar.deliver("community:deleted", [
                "communityId": "c-gone", "reason": "deactivated", "at": "2026-11-18T10:00:00.000Z",
            ])
        }
    }
}
