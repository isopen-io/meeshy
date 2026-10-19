import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// **L'envoi de l'extension de partage** (#10947) : une seule fiche pour tout le
/// partage, les fichiers téléversés une fois, une ligne servie « Envoyé », une
/// ligne différée « En file », et jamais de clair vers une conversation chiffrée
/// (D7 : relais à l'app).
@MainActor
final class ExtensionShareDispatcherTests: XCTestCase {

    private let session = ShareSession(userId: "me", token: "jwt", apiBaseURL: "https://gate.staging.meeshy.me")
    private let photo = ShareStagedMedia(relPath: "cid_1/0.jpg", ext: "jpg", mime: "image/jpeg", bytes: 1_000)
    private let video = ShareStagedMedia(relPath: "cid_1/1.mov", ext: "mov", mime: "video/quicktime", bytes: 2_000)

    private final class SendLog {
        var shares: [SharePendingShare] = []
        var created: [String] = []
    }

    private func makeSUT(
        session: ShareSession?? = nil,
        directIsEncrypted: Bool = false,
        serve: @escaping (SharePendingShare.Target) -> SharePendingShare.TargetState = { _ in .sent }
    ) -> (sut: ExtensionShareDispatcher, log: SendLog) {
        let log = SendLog()
        let sut = ExtensionShareDispatcher(
            shareId: "cid_1",
            session: session ?? self.session,
            staged: [photo, video],
            now: { Date(timeIntervalSince1970: 1_000) },
            sendShare: { share, _ in
                log.shares.append(share)
                var served = share
                for index in served.targets.indices where served.targets[index].state != .sent {
                    served.targets[index].state = serve(served.targets[index])
                }
                return served
            },
            createDirect: { userId, _ in
                log.created.append(userId)
                return ExtensionShareDispatcher.CreatedDirect(id: "direct-\(userId)", isEncrypted: directIsEncrypted)
            }
        )
        return (sut, log)
    }

    private func request(media: [ShareStagedMedia], text: String? = "Regarde", caption: String = "") -> ShareSendRequest {
        let incoming = ShareIncoming(
            media: media.map { ShareIncomingMedia(id: $0.relPath, mimeType: $0.mime, bytes: $0.bytes, fileURL: nil) },
            text: text
        )
        return ShareSendRequest(
            subject: .incoming(incoming), keptMessageIds: [], caption: caption, captionPlacement: .messageText,
            grouping: .together, chosenDurationSeconds: nil, copyOnDevice: false
        )
    }

    private func conversation(_ id: String, encrypted: Bool = false) -> ShareRecipient {
        ShareRecipient(id: "conv:\(id)", kind: .conversation, conversationId: id, userId: nil, title: id,
                       detail: .group(members: 3), avatarURL: nil, isEncrypted: encrypted)
    }

    func test_twoRecipients_shareOneFiche_withTheKeptMediaInOrder() async {
        let (sut, log) = makeSUT()
        defer { XCTAssertEqual(log.shares.count, 2, "une remise à ShareSender par destinataire, sur la même fiche") }

        let first = await sut.deliver(request(media: [video, photo], caption: "Pour toi"), to: conversation("c1"))
        let second = await sut.deliver(request(media: [video, photo], caption: "Pour toi"), to: conversation("c2"))

        XCTAssertEqual(first, .sent(conversationId: "c1"))
        XCTAssertEqual(second, .sent(conversationId: "c2"))
        XCTAssertEqual(sut.share?.clientMessageId, "cid_1")
        XCTAssertEqual(sut.share?.targets.map(\.conversationId), ["c1", "c2"])
        XCTAssertEqual(sut.share?.media.map(\.relPath), ["cid_1/1.mov", "cid_1/0.jpg"], "l'ordre choisi à l'écran")
        XCTAssertEqual(sut.share?.content, "Pour toi\nRegarde", "la légende rejoint le texte joint (D3)")
        XCTAssertEqual(sut.share?.originTargetIndex, 0)
    }

    func test_aTargetTheSheetCouldNotServe_isQueued_forTheAppToResume() async {
        let (sut, _) = makeSUT(serve: { _ in .pending })

        let outcome = await sut.deliver(request(media: [photo]), to: conversation("c1"))

        XCTAssertEqual(outcome, .queued(conversationId: "c1"))
    }

    func test_aRetry_resendsTheSameTarget_neverAddsASecondOne() async {
        var attempt = 0
        let (sut, log) = makeSUT(serve: { _ in
            attempt += 1
            return attempt == 1 ? .failed : .sent
        })

        _ = await sut.deliver(request(media: [photo]), to: conversation("c1"))
        let retried = await sut.deliver(request(media: [photo]), to: conversation("c1"))

        XCTAssertEqual(retried, .sent(conversationId: "c1"))
        XCTAssertEqual(sut.share?.targets.count, 1)
        XCTAssertEqual(log.shares.count, 2)
    }

    func test_aPersonWithoutConversation_getsADirectOneAtSendTime() async {
        let (sut, log) = makeSUT()
        let lea = ShareRecipient(id: "user:lea", kind: .person, conversationId: nil, userId: "lea", title: "Léa",
                                 detail: .friendWithoutConversation, avatarURL: nil)

        let outcome = await sut.deliver(request(media: []), to: lea)

        XCTAssertEqual(log.created, ["lea"])
        XCTAssertEqual(outcome, .sent(conversationId: "direct-lea"))
    }

    /// D7 : l'extension n'a pas les clés — une conversation chiffrée ne reçoit
    /// jamais de clair d'ici, elle est remise à l'app.
    func test_anEncryptedConversation_isRelayedToTheApp_neverSentInClear() async {
        let (sut, log) = makeSUT()

        let outcome = await sut.deliver(request(media: [photo]), to: conversation("e1", encrypted: true))

        XCTAssertEqual(outcome, .queued(conversationId: "e1"))
        XCTAssertTrue(log.shares.isEmpty, "aucune requête ne part vers la conversation chiffrée")
        XCTAssertEqual(sut.relayedConversationIds, ["e1"])
        XCTAssertTrue(sut.holdsStagedMedia, "la fiche de relais possède les fichiers")
    }

    /// Une personne dont la directe, retrouvée ou créée à l'envoi, est chiffrée :
    /// la ligne choisie ne le disait pas, la conversation RENDUE le dit.
    func test_aPersonWhoseDirectComesBackEncrypted_isRelayed_neverSentInClear() async {
        let (sut, log) = makeSUT(directIsEncrypted: true)
        let bob = ShareRecipient(id: "user:bob", kind: .person, conversationId: nil, userId: "bob", title: "Bob",
                                 detail: .friendWithoutConversation, avatarURL: nil)

        let outcome = await sut.deliver(request(media: [photo]), to: bob)

        XCTAssertEqual(outcome, .queued(conversationId: "direct-bob"))
        XCTAssertTrue(log.shares.isEmpty, "aucun clair vers une directe chiffrée")
        XCTAssertEqual(sut.relayedConversationIds, ["direct-bob"])
    }

    /// Sans cliché (l'app n'a pas tourné depuis la mise à jour), une conversation
    /// des récents du widget peut être chiffrée sans que rien ne le dise.
    func test_aWidgetRecentWithoutKnownEncryption_isRelayed_neverSentInClear() async {
        let (sut, log) = makeSUT()
        let recent = ExtensionShareDirectory.recipient(from: ShareTarget(id: "e2", displayName: "Bob", accentColorHex: "6366F1", unreadCount: 0))

        let outcome = await sut.deliver(request(media: [photo]), to: recent)

        XCTAssertEqual(outcome, .queued(conversationId: "e2"))
        XCTAssertTrue(log.shares.isEmpty)
    }

    /// La création d'une directe est idempotente : elle rend l'EXISTANTE, et son
    /// mode. Seul un `null` explicite prouve le clair.
    func test_theCreatedDirect_isClearOnlyWhenTheServerSaysSo() {
        func parse(_ json: String) -> ExtensionShareDispatcher.CreatedDirect? {
            ExtensionShareDispatcher.createdDirect(fromResponse: Data(json.utf8))
        }
        XCTAssertEqual(parse(#"{"success":true,"data":{"id":"d1","encryptionMode":null}}"#), .init(id: "d1", isEncrypted: false))
        XCTAssertEqual(parse(#"{"success":true,"data":{"id":"d2","encryptionMode":"e2ee"}}"#), .init(id: "d2", isEncrypted: true))
        XCTAssertEqual(parse(#"{"success":true,"data":{"id":"d3"}}"#), .init(id: "d3", isEncrypted: true), "un mode tu compte comme chiffré")
        XCTAssertNil(parse(#"{"success":true,"data":{}}"#))
    }

    /// La fiche de relais nomme le compte qui l'a déposée : l'app ne la sert qu'à lui.
    func test_theRelayHandoff_namesItsOwner() async {
        let (sut, _) = makeSUT()

        _ = await sut.deliver(request(media: [photo]), to: conversation("e1", encrypted: true))

        XCTAssertEqual(sut.relayHandoff(createdAt: Date())?.ownerUserId, "me")
    }

    func test_withoutSession_nothingLeaves() async {
        let (sut, log) = makeSUT(session: .some(nil))

        let outcome = await sut.deliver(request(media: [photo]), to: conversation("c1"))

        guard case .failed = outcome else { return XCTFail("sans session, l'envoi est refusé") }
        XCTAssertTrue(log.shares.isEmpty)
        XCTAssertFalse(sut.holdsStagedMedia)
    }

    /// La fiche est écrite dès l'entrée de `ShareSender.send` : une feuille
    /// fermée PENDANT l'envoi ne doit plus effacer ce qu'elle décrit.
    func test_theFilesBelongToTheFiche_fromTheFirstAttempt() async {
        let (sut, _) = makeSUT()
        XCTAssertFalse(sut.holdsStagedMedia)

        _ = await sut.deliver(request(media: [photo]), to: conversation("c1"))

        XCTAssertTrue(sut.holdsStagedMedia)
        XCTAssertFalse(sut.createsGroups, "D12 n'est pas offert dans l'extension")
    }
}
