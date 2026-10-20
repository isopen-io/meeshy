import XCTest

/// L'envoi d'un message ne laisse plus deux signatures vivre côte à côte ni une
/// écriture de persistance échouer en silence (#11118, #11119).
///
/// `sendMessage(content:…)` empilait onze paramètres optionnels que le serveur ne
/// comprend pas tous ensemble ; tout appelant de production construit désormais
/// un `OutgoingMessage` et appelle `send(_:)`. Quant aux `try?` sur la
/// persistance, ils faisaient disparaître l'échec d'une transition d'état — la
/// bulle restait « en cours d'envoi » sans que rien ne le dise.
final class SendPathGuardTests: XCTestCase {

    private static var appRoot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Architecture
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
    }

    private func swiftFiles(under relativeDirectory: String) throws -> [URL] {
        let root = Self.appRoot.appendingPathComponent(relativeDirectory)
        let enumerator = FileManager.default.enumerator(at: root, includingPropertiesForKeys: nil)
        return (enumerator?.allObjects as? [URL] ?? []).filter { $0.pathExtension == "swift" }
    }

    private func code(of url: URL) throws -> String {
        AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func matches(_ pattern: String, in source: String) throws -> Int {
        let regex = try NSRegularExpression(pattern: pattern)
        return regex.numberOfMatches(in: source, range: NSRange(source.startIndex..., in: source))
    }

    func test_guardCanReadProductionSources() throws {
        let files = try swiftFiles(under: "Meeshy")
        XCTAssertGreaterThan(files.count, 500, "la garde ne mesurerait RIEN : le dossier Meeshy est introuvable")
    }

    func test_productionCallers_buildOutgoingMessage() throws {
        let callers = try swiftFiles(under: "Meeshy").filter { url in
            try matches(#"(?<!func )sendMessage\(\s*content:"#, in: code(of: url)) > 0
        }
        XCTAssertEqual(callers.map(\.lastPathComponent), [],
                       "ces fichiers appellent encore `sendMessage(content:…)` : construire un OutgoingMessage et appeler `send(_:)`")
    }

    func test_sendPath_hasNoSilentTryOnPersistence() throws {
        let silentWrite = #"try\?\s+await[^\n]*(applyEvent|markOptimisticFailed|purgeMessages|markDeleted|resolveServerId)"#
        let silentEncode = #"try\? JSONEncoder"#
        let relativeFiles = [
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+Send.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+FullscreenReply.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+WriteRestriction.swift",
            "Meeshy/Features/Main/ViewModels/Conversation/ConversationSendCoordinator.swift",
            "Meeshy/Features/Main/Views/ConversationView+AttachmentHandlers.swift",
            "Meeshy/Features/Main/Views/ConversationView+Sticker.swift",
        ]
        let outbox = try swiftFiles(under: "Meeshy/Features/Main/Services")
            .filter { $0.lastPathComponent.hasPrefix("OutboxDispatcher") }
        XCTAssertFalse(outbox.isEmpty, "l'unité OutboxDispatcher est introuvable")
        let urls = relativeFiles.map { Self.appRoot.appendingPathComponent($0) } + outbox

        let offenders = try urls.filter { url in
            let source = try code(of: url)
            return try matches(silentWrite, in: source) + matches(silentEncode, in: source) > 0
        }
        XCTAssertEqual(offenders.map(\.lastPathComponent), [],
                       "une écriture de persistance de l'envoi échoue en silence : passer par `bestEffort` ou le coordinateur")
    }
}
