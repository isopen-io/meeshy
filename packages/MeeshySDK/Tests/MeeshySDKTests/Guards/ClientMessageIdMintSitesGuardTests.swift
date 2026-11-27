import Foundation
import XCTest

/// **Une `clientMessageId` ne se fabrique qu'à la COMPOSITION d'un message** (#6915).
///
/// Sur 28 groupes de messages dupliqués en production, les 28 portaient une
/// clé PAR copie : la déduplication serveur fonctionnait, elle ne pouvait
/// simplement rien reconnaître, parce que chaque ré-émission refabriquait sa
/// clé. Un renvoi (retry, rejeu de file, réémission socket, ré-invocation)
/// porte la clé du message composé, il n'en fabrique jamais une.
///
/// Ce cliquet tient l'inventaire EXACT des sites qui fabriquent une clé, dans
/// les deux sens : un site absent de la table n'en a pas le droit, et un site
/// qui ne fabrique plus doit sortir de la table. Les chemins d'ÉMISSION
/// (sockets, dispatcher de la file) n'y figurent pas, et un repli
/// `?? ClientMessageId.generate()` n'y est toléré que dans un initialiseur
/// qui CRÉE une composition.
final class ClientMessageIdMintSitesGuardTests: XCTestCase {

    /// Chaque entrée est un site de composition : un geste de l'utilisateur
    /// (ou une ligne de file créée) donne naissance à UN message.
    private static let compositionSites: [String: Int] = [
        // L'envoi du composeur : `reusedClientMessageId ?? generate()`, le rejeu réutilise.
        "apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+Send.swift": 1,
        // La redirection vers le tête-à-tête lisible compose un message dans une AUTRE conversation.
        "apps/ios/Meeshy/Features/Main/ViewModels/Conversation/EndToEndReadableRedirect.swift": 1,
        // Un groupe de médias choisi reçoit sa clé une fois, à la sélection.
        "apps/ios/Meeshy/Features/Main/Views/OutgoingMediaGroup.swift": 1,
        // Le sticker posé reçoit sa clé une fois, puis la passe en `reusedClientMessageId`.
        "apps/ios/Meeshy/Features/Main/Views/ConversationView+Sticker.swift": 1,
        // Le texte d'un lot de pièces jointes, composé une fois.
        "apps/ios/Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift": 1,
        // Un transfert : une clé par destination, mémorisée par `dedupKey`.
        "apps/ios/Meeshy/Features/Main/Services/MessageForwardService.swift": 1,
        // Une réponse à une humeur, scellée : un appel = une réponse composée.
        "apps/ios/Meeshy/Features/Main/Services/MoodSpotlight/MoodReplySender.swift": 1,
        // La copie d'un vocal talkie : une clé par copie produite.
        "apps/ios/Meeshy/Features/Talkie/TalkieVoiceCopy.swift": 1,
        // La clé d'un texte composé, réutilisée tant que le texte ne change pas.
        "packages/MeeshySDK/Sources/MeeshySDK/Utils/ComposedMessageKey.swift": 1,
        // Une requête construite sans clé est une composition directe ; le rejeu passe la sienne.
        "packages/MeeshySDK/Sources/MeeshySDK/Models/SendMessageRequest.swift": 1,
        // L'initialiseur qui CRÉE une ligne de file ; la réhydratation exige la clé persistée.
        "packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueueItem.swift": 1,
        // Une réaction (pas un message) mise en file une fois, coalescée ensuite.
        "packages/MeeshySDK/Sources/MeeshySDK/Persistence/OfflineQueue+Mutations.swift": 1,
    ]

    private static let emissionTrees = [
        "packages/MeeshySDK/Sources/MeeshySDK/Sockets",
    ]

    private static let emissionFilePrefixes = [
        "apps/ios/Meeshy/Features/Main/Services/OutboxDispatcher",
    ]

    private static let scannedTrees = [
        "apps/ios/Meeshy",
        "apps/ios/MeeshyNotificationExtension",
        "apps/ios/MeeshyNotificationContentExtension",
        "apps/ios/MeeshyWidgets",
        "apps/ios/MeeshyShareExtension",
        "apps/ios/MeeshyBroadcastExtension",
        "packages/MeeshySDK/Sources",
    ]

    private static let mintPattern = #"ClientMessageId\.generate\b"#

    func test_seulsLesSitesDeCompositionFabriquentUneCle() throws {
        let counts = try mintCounts()
        for (path, count) in counts.sorted(by: { $0.key < $1.key }) {
            XCTAssertLessThanOrEqual(
                count, Self.compositionSites[path] ?? 0,
                """
                \(path) fabrique \(count) clientMessageId pour \(Self.compositionSites[path] ?? 0) \
                tolérée(s). Une clé s'attribue à la COMPOSITION : un renvoi porte la clé \
                du message composé (#6915). Si ce site compose vraiment un message, \
                l'inscrire dans `compositionSites` avec sa raison.
                """
            )
        }
    }

    func test_laTableNeGardePasDeSiteQuiNeFabriquePlus() throws {
        let counts = try mintCounts()
        for (path, tolerated) in Self.compositionSites.sorted(by: { $0.key < $1.key }) {
            XCTAssertEqual(
                counts[path] ?? 0, tolerated,
                "\(path) est inscrit pour \(tolerated) site(s) et en contient \(counts[path] ?? 0) : ajuster la table."
            )
        }
    }

    func test_aucunCheminDEmissionNeFabriqueUneCle() throws {
        let counts = try mintCounts()
        let emitting = counts.keys.filter { path in
            Self.emissionTrees.contains { path.hasPrefix($0 + "/") }
                || Self.emissionFilePrefixes.contains { path.hasPrefix($0) }
        }
        XCTAssertEqual(emitting.sorted(), [], "un chemin d'émission fabrique sa clé au lieu de porter celle de la composition")
    }

    /// La réponse du fil rendait son texte au composeur après un échec, et le
    /// nouvel appui fabriquait une clé neuve : la copie que le serveur avait
    /// peut-être déjà reçue devenait un doublon.
    func test_laReponseDuFilRenvoieLaCleDeSaComposition() throws {
        let source = try String(
            contentsOf: repoRoot().appendingPathComponent("apps/ios/Meeshy/Features/Main/Views/ThreadView.swift"),
            encoding: .utf8
        )
        XCTAssertTrue(source.contains("ComposedMessageKey.resolve(for: text, retained: retainedReplyKey)"),
                      "la clé de la réponse se résout depuis la composition retenue")
        XCTAssertTrue(source.contains("retainedReplyKey = composed"),
                      "un échec retient la clé avec le texte rendu au composeur")
        XCTAssertTrue(source.contains("guard !isSending"),
                      "une ré-invocation pendant l'envoi ne compose pas un second message")
    }

    func test_leDetecteurReconnaitLesFormesDuDepot() {
        let recognised = [
            "let cid = clientMessageId ?? ClientMessageId.generate()",
            "let tempId = ClientMessageId.generate()",
            "newClientMessageId: @escaping () -> String = ClientMessageId.generate,",
        ]
        let ignored = [
            "// let cid = ClientMessageId.generate()",
            "/// `ClientMessageId.generate()` au moment de la composition",
            "* ClientMessageId.generate()",
            "ClientMessageId.isValid(cid)",
        ]
        recognised.forEach { XCTAssertTrue(Self.mints($0), $0) }
        ignored.forEach { XCTAssertFalse(Self.mints($0), $0) }
    }

    func test_leBalayageVoitBienLArbre() throws {
        let sdkLines = try swiftSources(in: "packages/MeeshySDK/Sources")
            .reduce(0) { $0 + $1.source.split(separator: "\n", omittingEmptySubsequences: false).count }
        let appLines = try swiftSources(in: "apps/ios/Meeshy")
            .reduce(0) { $0 + $1.source.split(separator: "\n", omittingEmptySubsequences: false).count }
        XCTAssertGreaterThan(sdkLines, 500, "le balayage ne lit pas le SDK : le détecteur est aveugle")
        XCTAssertGreaterThan(appLines, 500, "le balayage ne lit pas l'app : le détecteur est aveugle")
    }

    static func mints(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard !trimmed.hasPrefix("//"), !trimmed.hasPrefix("*") else { return false }
        return trimmed.range(of: mintPattern, options: .regularExpression) != nil
    }

    private func repoRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
    }

    private func swiftSources(in tree: String) throws -> [(relative: String, source: String)] {
        let root = repoRoot()
        guard let walker = FileManager.default.enumerator(at: root.appendingPathComponent(tree), includingPropertiesForKeys: nil) else {
            return []
        }
        return try walker.compactMap { $0 as? URL }
            .filter { $0.pathExtension == "swift" }
            .map { url in
                (url.path.replacingOccurrences(of: root.path + "/", with: ""), try String(contentsOf: url, encoding: .utf8))
            }
    }

    private func mintCounts() throws -> [String: Int] {
        try Self.scannedTrees
            .flatMap { try swiftSources(in: $0) }
            .reduce(into: [String: Int]()) { counts, file in
                let hits = file.source.split(separator: "\n", omittingEmptySubsequences: false)
                    .filter { Self.mints(String($0)) }.count
                if hits > 0 { counts[file.relative, default: 0] += hits }
            }
    }
}
