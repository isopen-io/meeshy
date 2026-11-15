import XCTest
import UniformTypeIdentifiers
@testable import Meeshy
import MeeshySDK

/// #10006 — le sélecteur d'un invité de World Wide ne retient que .txt et
/// audio, dit pourquoi le reste ne passe pas, et la conversation qu'il ouvre
/// s'annonce comme World Wide avant le réseau.
@MainActor
final class GuestAttachmentScreeningTests: XCTestCase {

    private let world = GuestAttachmentAllowance(kinds: [.text, .audio])

    private func candidate(_ name: String, bytes: Int64 = 1_000) -> GuestAttachmentScreening.Candidate {
        GuestAttachmentScreening.Candidate(name: name, byteCount: bytes)
    }

    // MARK: - Sélection

    func test_screen_worldWide_keepsTxtAndAudio_andNamesTheRefusedPdf() {
        let screening = GuestAttachmentScreening(
            candidates: [candidate("notes.txt"), candidate("guide.pdf"), candidate("voix.m4a")],
            allowance: world
        )

        XCTAssertEqual(screening.acceptedIndices, [0, 2])
        XCTAssertEqual(screening.refusals, [.init(fileName: "guide.pdf", reason: .kindNotAllowed)])
    }

    func test_screen_unrestricted_keepsEverything() {
        let screening = GuestAttachmentScreening(
            candidates: [candidate("guide.pdf"), candidate("photo.heic")],
            allowance: .unrestricted
        )

        XCTAssertEqual(screening.acceptedIndices, [0, 1])
        XCTAssertTrue(screening.refusals.isEmpty)
    }

    func test_screen_oversizedText_isRefusedForItsSize() {
        let screening = GuestAttachmentScreening(
            candidates: [candidate("livre.txt", bytes: GuestAttachmentAllowance.maxBytes + 1)],
            allowance: world
        )

        XCTAssertEqual(screening.refusals, [.init(fileName: "livre.txt", reason: .tooLarge)])
    }

    // MARK: - Dépôt et collage

    func test_screenIngest_keepsTextAndAllowedFiles_dropsTheRest() {
        let txt = ComposerIngest.file(url: URL(fileURLWithPath: "/tmp/a.txt"), name: "a.txt", mime: "text/plain")
        let png = ComposerIngest.file(url: URL(fileURLWithPath: "/tmp/b.png"), name: "b.png", mime: "image/png")
        let snippet = ComposerIngest.text("bonjour")

        let screened = GuestAttachmentScreening.screenIngest([txt, png, snippet], allowance: world, byteCount: { _ in 10 })

        XCTAssertEqual(screened.kept, [txt, snippet])
        XCTAssertEqual(screened.refusals, [.init(fileName: "b.png", reason: .kindNotAllowed)])
    }

    func test_screenIngest_unrestricted_passesThrough() {
        let png = ComposerIngest.file(url: URL(fileURLWithPath: "/tmp/b.png"), name: "b.png", mime: "image/png")

        let screened = GuestAttachmentScreening.screenIngest([png], allowance: .unrestricted, byteCount: { _ in 10 })

        XCTAssertEqual(screened.kept, [png])
    }

    // MARK: - Ce que le sélecteur propose

    func test_contentTypes_textIsPlainText_audioIsAudio() {
        XCTAssertEqual(GuestAttachmentContentTypes.types(for: .text), [.plainText])
        XCTAssertEqual(GuestAttachmentContentTypes.types(for: .audio), [.audio])
    }

    func test_refusalCopy_namesTheFile() {
        let message = GuestAttachmentCopy.refusal(fileName: "guide.pdf", reason: .kindNotAllowed, kinds: [.text, .audio])
        XCTAssertTrue(message.contains("guide.pdf"))
    }

    func test_serverRefusalCopy_neverEmpty() {
        let message = GuestAttachmentCopy.serverRefusal(GuestAttachmentRefusal(reason: .kindNotAllowed), kinds: [.text, .audio])
        XCTAssertFalse(message.isEmpty)
    }

    // MARK: - La conversation que la session ouvre

    func test_conversationShell_world_isTheServedGlobalConversation() {
        let entry = WorldEntry(identifier: "world", title: "World Wide", shareLinkIdentifier: "cle-servie", memberCount: 199, memberCountCapped: true)
        let session = GuestSession(identifier: "cle-servie", context: nil, origin: .world(entry))
        let context = AnonymousSessionContext(
            sessionToken: "t", participantId: "p", permissions: ParticipantPermissions(),
            linkId: "cle-servie", conversationId: "conv-world", allowedAttachmentKinds: [.text, .audio]
        )

        let shell = session.conversationShell(for: context)

        XCTAssertEqual(shell.id, "conv-world")
        XCTAssertEqual(shell.identifier, "world")
        XCTAssertEqual(shell.type, .global)
        XCTAssertEqual(shell.title, "World Wide")
    }

    func test_conversationShell_shareLink_keepsTheHistoricGroupShell() {
        let session = GuestSession(identifier: "mon-lien", context: nil)
        let context = AnonymousSessionContext(
            sessionToken: "t", participantId: "p", permissions: ParticipantPermissions(),
            linkId: "mon-lien", conversationId: "conv-1"
        )

        let shell = session.conversationShell(for: context)

        XCTAssertEqual(shell.identifier, "mon-lien")
        XCTAssertEqual(shell.type, .group)
    }

    // MARK: - World Wide ne s'ouvre jamais en grand (#10055)

    private func worldSession() -> GuestSession {
        let entry = WorldEntry(identifier: "world", title: "World Wide", shareLinkIdentifier: "cle-servie", memberCount: 3)
        return GuestSession(identifier: "cle-servie", context: nil, origin: .world(entry))
    }

    private func context(kinds: [GuestAttachmentKind]?) -> AnonymousSessionContext {
        AnonymousSessionContext(
            sessionToken: "t", participantId: "p", permissions: ParticipantPermissions(),
            linkId: "cle-servie", conversationId: "conv-world", allowedAttachmentKinds: kinds
        )
    }

    func test_effectiveContext_world_withoutServedKinds_keepsTheWorldCeiling() {
        let served = worldSession().effectiveContext(context(kinds: nil))

        XCTAssertEqual(served.allowedAttachmentKinds, [.text, .audio])
        XCTAssertFalse(served.attachmentAllowance.offersVisualMedia)
    }

    func test_effectiveContext_world_neverWidensBeyondTheCeiling() {
        let served = worldSession().effectiveContext(context(kinds: [.text, .audio, .image, .pdf]))

        XCTAssertEqual(served.allowedAttachmentKinds, [.text, .audio])
    }

    func test_effectiveContext_world_keepsANarrowerServedList() {
        let served = worldSession().effectiveContext(context(kinds: [.audio]))

        XCTAssertEqual(served.allowedAttachmentKinds, [.audio])
    }

    func test_effectiveContext_shareLink_withoutKinds_staysUnrestricted() {
        let session = GuestSession(identifier: "mon-lien", context: nil)

        let served = session.effectiveContext(context(kinds: nil))

        XCTAssertNil(served.allowedAttachmentKinds)
        XCTAssertEqual(served.attachmentAllowance, .unrestricted)
    }

    func test_sessionContext_decodesWithoutKinds_fromAnOlderSave() throws {
        let json = #"{"sessionToken":"t","participantId":"p","permissions":{"canSendMessages":true,"canSendFiles":false,"canSendImages":false,"canSendVideos":false,"canSendAudios":false,"canSendLocations":false,"canSendLinks":false},"linkId":"l","conversationId":"c"}"#
        let context = try JSONDecoder().decode(AnonymousSessionContext.self, from: Data(json.utf8))
        XCTAssertNil(context.allowedAttachmentKinds)
        XCTAssertEqual(context.attachmentAllowance, .unrestricted)
    }
}
