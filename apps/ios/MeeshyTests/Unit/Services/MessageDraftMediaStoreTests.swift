import XCTest
import MeeshySDK
@testable import Meeshy

/// Persistance durable des pièces jointes de brouillon de message :
/// copie tmp → Documents au background, restauration tolérante aux fichiers
/// disparus, purge à l'envoi/clear. Les fichiers du composer vivent dans
/// tmp/ (purgeable par iOS) — c'est la copie qui fait survivre le brouillon.
@MainActor
final class MessageDraftMediaStoreTests: XCTestCase {

    private let userId = "user-tests"
    private var conversationId = ""

    override func setUp() async throws {
        try await super.setUp()
        conversationId = "conv-\(UUID().uuidString)"
    }

    override func tearDown() async throws {
        MessageDraftMediaStore.purge(userId: userId, conversationId: conversationId)
        try await super.tearDown()
    }

    private func makeTempFile(named name: String, contents: String = "media-bytes") throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("draft-store-tests-\(UUID().uuidString)-\(name)")
        try Data(contents.utf8).write(to: url)
        return url
    }

    private func makeAttachment(id: String, name: String = "Photo.jpg",
                                mime: String = "image/jpeg") -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, originalName: name, mimeType: mime, fileSize: 42)
    }

    // MARK: persist → restore

    func test_persistThenRestore_roundTripsAttachmentAndFile() throws {
        let source = try makeTempFile(named: "a.jpg", contents: "jpeg-payload")
        let attachment = makeAttachment(id: "att-1")

        let refs = MessageDraftMediaStore.persist(
            attachments: [attachment], files: ["att-1": source],
            userId: userId, conversationId: conversationId
        )
        XCTAssertEqual(refs.count, 1)
        XCTAssertEqual(refs.first?.attachmentId, "att-1")

        let restored = MessageDraftMediaStore.restore(
            refs: refs, userId: userId, conversationId: conversationId
        )
        XCTAssertEqual(restored.attachments.map(\.id), ["att-1"])
        XCTAssertEqual(restored.attachments.first?.originalName, "Photo.jpg")
        XCTAssertEqual(restored.attachments.first?.mimeType, "image/jpeg")
        let restoredURL = try XCTUnwrap(restored.files["att-1"])
        XCTAssertEqual(try String(contentsOf: restoredURL, encoding: .utf8), "jpeg-payload")
    }

    func test_restore_skipsMissingFileSilently() throws {
        let source = try makeTempFile(named: "b.m4a")
        let refs = MessageDraftMediaStore.persist(
            attachments: [makeAttachment(id: "att-keep"), makeAttachment(id: "att-lost")],
            files: ["att-keep": source, "att-lost": source],
            userId: userId, conversationId: conversationId
        )
        XCTAssertEqual(refs.count, 2)
        let lostRef = try XCTUnwrap(refs.first { $0.attachmentId == "att-lost" })
        let dir = MessageDraftMediaStore.directory(userId: userId, conversationId: conversationId)
        try FileManager.default.removeItem(at: dir.appendingPathComponent(lostRef.storedFileName))

        let restored = MessageDraftMediaStore.restore(
            refs: refs, userId: userId, conversationId: conversationId
        )
        XCTAssertEqual(restored.attachments.map(\.id), ["att-keep"],
                       "un fichier purgé disparaît sans casser le reste du brouillon")
    }

    func test_persist_missingSourceFile_isSkippedBestEffort() throws {
        let source = try makeTempFile(named: "c.pdf")
        let ghost = FileManager.default.temporaryDirectory
            .appendingPathComponent("ghost-\(UUID().uuidString).pdf")

        let refs = MessageDraftMediaStore.persist(
            attachments: [makeAttachment(id: "ok"), makeAttachment(id: "ghost")],
            files: ["ok": source, "ghost": ghost],
            userId: userId, conversationId: conversationId
        )
        XCTAssertEqual(refs.map(\.attachmentId), ["ok"])
    }

    func test_persist_rebuildsDirectory_removedAttachmentDoesNotResurrect() throws {
        let source = try makeTempFile(named: "d.jpg")
        _ = MessageDraftMediaStore.persist(
            attachments: [makeAttachment(id: "old")], files: ["old": source],
            userId: userId, conversationId: conversationId
        )

        let refs = MessageDraftMediaStore.persist(
            attachments: [], files: [:],
            userId: userId, conversationId: conversationId
        )

        XCTAssertTrue(refs.isEmpty)
        let dir = MessageDraftMediaStore.directory(userId: userId, conversationId: conversationId)
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.path),
                       "une pièce retirée du tray ne ressuscite pas au restore")
    }

    func test_purge_removesDirectory() throws {
        let source = try makeTempFile(named: "e.mov")
        _ = MessageDraftMediaStore.persist(
            attachments: [makeAttachment(id: "att")], files: ["att": source],
            userId: userId, conversationId: conversationId
        )

        MessageDraftMediaStore.purge(userId: userId, conversationId: conversationId)

        let dir = MessageDraftMediaStore.directory(userId: userId, conversationId: conversationId)
        XCTAssertFalse(FileManager.default.fileExists(atPath: dir.path))
    }

    // MARK: MessageDraft model

    func test_messageDraft_roundTripsAttachmentRefs() throws {
        let draft = MessageDraft(
            text: "Regarde ça",
            attachments: [DraftAttachmentRef(
                attachmentId: "a1", storedFileName: "a1.jpg",
                originalName: "Photo.jpg", mimeType: "image/jpeg"
            )]
        )
        let data = try JSONEncoder().encode(draft)
        let decoded = try JSONDecoder().decode(MessageDraft.self, from: data)
        XCTAssertEqual(decoded.attachments?.count, 1)
        XCTAssertEqual(decoded.attachments?.first?.storedFileName, "a1.jpg")
    }

    func test_messageDraft_decodesLegacyPayloadWithoutAttachmentsKey() throws {
        let legacy = MessageDraft(text: "vieux brouillon")
        var payload = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(legacy)
        ) as! [String: Any]
        payload.removeValue(forKey: "attachments")
        let data = try JSONSerialization.data(withJSONObject: payload)

        let decoded = try JSONDecoder().decode(MessageDraft.self, from: data)
        XCTAssertEqual(decoded.text, "vieux brouillon")
        XCTAssertNil(decoded.attachments)
    }

    func test_isEffectivelyEmpty_falseWhenOnlyAttachments() {
        let draft = MessageDraft(
            text: "",
            attachments: [DraftAttachmentRef(
                attachmentId: "a1", storedFileName: "a1.jpg",
                originalName: "Photo.jpg", mimeType: "image/jpeg"
            )]
        )
        XCTAssertFalse(draft.isEffectivelyEmpty,
                       "un brouillon avec seulement des pièces jointes n'est pas vide")
        XCTAssertTrue(MessageDraft(text: "").isEffectivelyEmpty)
    }
}
