import XCTest
@testable import Meeshy
import MeeshySDK

/// **Un message lu seulement par l'appareil ne fait sortir aucun de ses liens**
/// (#12768, constat IOS-05 de la revue E2EE du 2026-11-17).
///
/// La loi vit dans la VALEUR que toutes les surfaces partagent
/// (`BubbleContent.text(raw:of:)`) : la bulle, Focal, la Rivière et l'aperçu
/// d'appui long la reçoivent sans avoir à poser quoi que ce soit. Un message
/// chiffré de bout en bout, ou déchiffré sur l'appareil, ne porte ni aperçu
/// OpenGraph (site tiers), ni carte de conversation (serveur), ni façade vidéo,
/// ni lien suivi `/l/<token>` (serveur) — son adresse reste touchable.
/// Chaque témoin chiffré a son témoin en clair : sans lui, un builder qui ne
/// détecterait plus aucun lien passerait pour conforme.
@MainActor
final class EndToEndLinkEmbedLawTests: XCTestCase {

    // MARK: - Fabriques

    private let webAddress = "Le dossier : https://exemple.org/dossier-secret"
    private let shareLink = "Viens : https://meeshy.me/join/mshy_x"
    private let videoAddress = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

    private func clear(_ text: String, trackedLinks: [String: String] = [:]) -> Message {
        Message(id: "000000000000000000000b01", conversationId: "c1", senderId: "p2", content: text,
                senderName: "Bob", isMe: false, trackedLinkMap: trackedLinks)
    }

    private func decrypted(_ text: String, isEncrypted: Bool = true, encryptionMode: String? = "e2ee",
                           trackedLinks: [String: String] = [:]) -> Message {
        var message = Message(id: "000000000000000000000b02", conversationId: "c1", senderId: "p2",
                              content: E2EEWire.contentPlaceholder,
                              isEncrypted: isEncrypted, encryptionMode: encryptionMode,
                              senderName: "Bob", isMe: false, trackedLinkMap: trackedLinks)
        message.adoptDecryptedContent(text)
        return message
    }

    private func text(_ message: Message) throws -> BubbleContent.Text {
        try XCTUnwrap(BubbleContent(message: message, translations: [], preferredTranslation: nil,
                                    currentUserId: "me", timeString: "10:00").text)
    }

    // MARK: - Aperçu OpenGraph (site tiers)

    func test_init_decryptedWebAddress_mountsNoPreviewButKeepsTheLinkTappable() throws {
        let resolved = try text(decrypted(webAddress))

        XCTAssertNil(resolved.firstLinkURL, "aucun aperçu ne va chercher la page chez le tiers")
        XCTAssertFalse(resolved.linksAreInert, "l'adresse reste touchable : ouvrir est un geste explicite")
        XCTAssertEqual(resolved.raw, webAddress)
    }

    func test_init_clearWebAddress_keepsItsPreview() throws {
        let resolved = try text(clear(webAddress))

        XCTAssertEqual(resolved.firstLinkURL, "https://exemple.org/dossier-secret")
    }

    // MARK: - Carte de conversation (serveur)

    func test_init_decryptedShareLink_asksTheServerNothing() throws {
        let resolved = try text(decrypted(shareLink))

        XCTAssertNil(resolved.conversationCardTarget)
        XCTAssertNil(resolved.firstLinkURL)
    }

    func test_init_clearShareLink_keepsItsConversationCard() throws {
        let resolved = try text(clear(shareLink))

        XCTAssertEqual(resolved.conversationCardTarget, .shareLink(identifier: "mshy_x"))
    }

    // MARK: - Carte de profil (serveur, #19519)

    func test_init_clearProfileLink_mountsTheProfileCard() throws {
        let short = try text(clear("Parle à Aïssa : https://meeshy.me/@aissa"))
        let long = try text(clear("https://meeshy.me/u/aissa"))

        XCTAssertEqual(short.profileCardHandle, "aissa")
        XCTAssertEqual(long.profileCardHandle, "aissa")
        XCTAssertNil(short.conversationCardTarget, "une fiche n'est pas une conversation")
    }

    func test_init_decryptedProfileLink_asksTheServerNothing() throws {
        let resolved = try text(decrypted("https://meeshy.me/@aissa"))

        XCTAssertNil(resolved.profileCardHandle)
    }

    func test_init_foreignHostProfilePath_isNoProfileCard() throws {
        let resolved = try text(clear("https://evil.example/@aissa"))

        XCTAssertNil(resolved.profileCardHandle)
    }

    // MARK: - Façade vidéo (vignette chez l'hébergeur)

    func test_init_decryptedVideoAddress_mountsNoVideoFacade() throws {
        let resolved = try text(decrypted(videoAddress))

        XCTAssertNil(resolved.embeddedVideo)
        XCTAssertNil(resolved.embedTrackedURL)
    }

    func test_init_clearVideoAddress_keepsItsVideoFacade() throws {
        let resolved = try text(clear(videoAddress))

        XCTAssertNotNil(resolved.embeddedVideo)
    }

    // MARK: - Lien suivi (redirection par le serveur)

    func test_init_decryptedMessageWithServedTrackedMap_dropsTheTrackedMap() throws {
        let resolved = try text(decrypted(webAddress, trackedLinks: ["https://exemple.org/dossier-secret": "tok123"]))

        XCTAssertTrue(resolved.trackedLinks.isEmpty, "un toucher ne passe jamais par la redirection du serveur")
    }

    func test_init_clearMessageWithTrackedMap_keepsTheTrackedMap() throws {
        let resolved = try text(clear(webAddress, trackedLinks: ["https://exemple.org/dossier-secret": "tok123"]))

        XCTAssertEqual(resolved.trackedLinks, ["https://exemple.org/dossier-secret": "tok123"])
    }

    // MARK: - Les trois provenances du « lu seulement par l'appareil »

    func test_init_clearAdoptedFromADecryptionWhateverTheServedLabels_mountsNothing() throws {
        let resolved = try text(decrypted(shareLink, isEncrypted: false, encryptionMode: nil))

        XCTAssertNil(resolved.firstLinkURL, "la provenance prime sur les étiquettes servies")
        XCTAssertNil(resolved.conversationCardTarget)
    }

    func test_init_messageAnnouncedEndToEndButServedUnencrypted_mountsNothing() throws {
        let served = Message(id: "000000000000000000000b03", conversationId: "c1", senderId: "p2",
                             content: shareLink, isEncrypted: false, encryptionMode: " E2EE ",
                             senderName: "Bob", isMe: false)

        let resolved = try text(served)

        XCTAssertNil(resolved.firstLinkURL)
        XCTAssertNil(resolved.conversationCardTarget)
    }

    func test_init_serverModeMessageServedInClear_keepsItsCard() throws {
        let served = Message(id: "000000000000000000000b04", conversationId: "c1", senderId: "p2",
                             content: shareLink, isEncrypted: false, encryptionMode: "server",
                             senderName: "Bob", isMe: false)

        let resolved = try text(served)

        XCTAssertEqual(resolved.conversationCardTarget, .shareLink(identifier: "mshy_x"),
                       "le serveur lit déjà un message chiffré au repos : rien ne lui est appris")
    }

    // MARK: - Mes propres messages chiffrés

    func test_init_myOwnEncryptedMessage_mountsNothingEither() throws {
        var mine = decrypted(shareLink)
        mine.isMe = true

        let resolved = try text(mine)

        XCTAssertNil(resolved.firstLinkURL)
        XCTAssertNil(resolved.conversationCardTarget)
    }

    // MARK: - Rivière

    func test_riverLinkEmbed_decryptedMessage_isNil() {
        XCTAssertNil(RiverConversationMapping.linkEmbed(of: decrypted(shareLink), text: \.content))
        XCTAssertNil(RiverConversationMapping.linkEmbed(of: decrypted(videoAddress), text: \.content))
    }

    func test_riverLinkEmbed_clearMessage_keepsTheCard() {
        let embed = RiverConversationMapping.linkEmbed(of: clear(shareLink), text: \.content)

        XCTAssertEqual(embed?.conversationCardTarget, .shareLink(identifier: "mshy_x"))
    }

    // MARK: - Aperçu d'appui long : la même loi

    func test_previewGate_readsTheSameLaw() {
        let announced = Message(id: "000000000000000000000b05", conversationId: "c1", senderId: "p2",
                                content: shareLink, isEncrypted: false, encryptionMode: "e2ee")

        XCTAssertFalse(ConversationPreviewRenderer.mountsLinkEmbed(for: announced))
        XCTAssertFalse(ConversationPreviewRenderer.mountsLinkEmbed(for: decrypted(shareLink)))
        XCTAssertTrue(ConversationPreviewRenderer.mountsLinkEmbed(for: clear(shareLink)))
    }

    // MARK: - Le cache des aperçus n'est pas sauvegardé

    func test_linkPreviewCache_livesInCachesNeverInDocuments() {
        let file = LinkPreviewStore.cacheFileURL()
        let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let documents = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]

        XCTAssertTrue(file.path.hasPrefix(caches.path), "Library/Caches n'est ni sauvegardé par iCloud ni par Finder")
        XCTAssertFalse(file.path.hasPrefix(documents.path), "Documents/ est sauvegardé : une adresse lue y partait")
    }

    func test_theLaunch_removesTheCopyLeftInDocuments_beforeAnyCardIsMounted() throws {
        var app = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { app.deleteLastPathComponent() }
        let launch = try String(contentsOf: app.appendingPathComponent("Meeshy/MeeshyApp.swift"), encoding: .utf8)

        XCTAssertTrue(launch.contains("LinkPreviewStore.removeLegacyBackedUpCache("),
                      "le lancement efface l'ancien cache : le magasin, paresseux, ne naît qu'à la première carte (R-6)")
    }

    func test_linkPreviewCache_removesTheCopyLeftInDocuments() throws {
        let documents = FileManager.default.temporaryDirectory
            .appendingPathComponent("EndToEndLinkEmbedLawTests-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: documents) }
        let legacy = LinkPreviewStore.legacyBackedUpCacheFile(inDocuments: documents)
        try FileManager.default.createDirectory(at: legacy.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data("{\"https://exemple.org/dossier-secret\":{}}".utf8).write(to: legacy)

        LinkPreviewStore.removeLegacyBackedUpCache(inDocuments: documents)

        XCTAssertFalse(FileManager.default.fileExists(atPath: legacy.path))
    }
}
